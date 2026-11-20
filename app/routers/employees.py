from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, status

from app.deps import DbSession, PaginationDep, ActorDep, HrDep
from auth import accounts as auth_accounts
from app.schemas.common import Page
from app.schemas.employee import (
    BulkCreateResult,
    EmployeeCreate,
    EmployeeDetail,
    EmployeeRead,
    EmployeeSummary,
    EmployeeTotals,
    EmployeeUpdate,
)
from queries import (
    count_employees,
    create_employee,
    create_employees_bulk,
    deactivate_employee,
    delete_employee,
    get_employee_by_code,
    get_employee_detail,
    get_employee_totals,
    reactivate_employee,
    search_employees,
    update_employee,
)

router = APIRouter(prefix="/employees", tags=["employees"])


# in imports: swap min_points/min_strikes to min_active_violations/min_total_offenses

@router.get("", response_model=Page[EmployeeSummary])
def list_employees(
    db: DbSession,
    page: PaginationDep,
    search: Annotated[str | None, Query(max_length=100)] = None,
    department: Annotated[str | None, Query(max_length=100)] = None,
    position: Annotated[str | None, Query(max_length=100)] = None,
    min_active_violations: Annotated[int | None, Query(ge=0)] = None,
    min_total_offenses: Annotated[int | None, Query(ge=0)] = None,
    include_inactive: Annotated[bool, Query()] = False,
):
    items = search_employees(
        db, search=search, include_inactive=include_inactive,
        department=department, position=position,
        min_active_violations=min_active_violations,
        min_total_offenses=min_total_offenses,
        limit=page.limit, offset=page.offset,
    )
    total = count_employees(
        db, search=search, include_inactive=include_inactive,
        department=department, position=position,
        min_active_violations=min_active_violations,
        min_total_offenses=min_total_offenses,
    )
    return Page(items=items, total=total, limit=page.limit, offset=page.offset)

@router.get("/by-code/{code}", response_model=EmployeeRead, summary="Look up by employee code")
def get_by_code(db: DbSession, code: Annotated[str, Path(min_length=1, max_length=50)]):
    employee = get_employee_by_code(db, code)
    if employee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Employee code {code!r} not found")
    return employee


@router.get("/{employee_id}/totals", response_model=EmployeeTotals, summary="Cheap totals")
def totals(db: DbSession, employee_id: Annotated[int, Path(ge=1)]):
    return get_employee_totals(db, employee_id)  # raises EmployeeNotFound


@router.get("/{employee_id}", response_model=EmployeeDetail, summary="Full profile + history")
def detail(db: DbSession, employee_id: Annotated[int, Path(ge=1)]):
    employee = get_employee_detail(db, employee_id)
    if employee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Employee {employee_id} not found")
    return employee


def _provision_account(employee, username: str, password: str) -> int:
    try:
        return auth_accounts.create_account(
            employee_id=employee.id,
            employee_code=employee.employee_code,
            username=username,
            password=password,
            role=employee.employee_type.value,
            first_name=employee.first_name,
            last_name=employee.last_name,
        )
    except auth_accounts.UsernameTaken as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except auth_accounts.EmployeeAlreadyLinked as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The employee login account could not be created. No employee was saved.",
        ) from exc


def _sync_account(employee, changes: dict) -> None:
    try:
        auth_accounts.update_account(
            employee.id,
            role=employee.employee_type.value,
            first_name=employee.first_name,
            last_name=employee.last_name,
            employee_code=employee.employee_code,
        )
        if changes.get("employee_type") not in (None, "supervisor"):
            auth_accounts.disable_employee_trackers(employee.id)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The employee login account could not be updated. No changes were saved.",
        ) from exc


@router.post("", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
def create(db: DbSession, payload: EmployeeCreate, actor: ActorDep, identity: HrDep):
    data = payload.model_dump()
    username = data.pop("account_username")
    password = data.pop("account_password")
    if identity.role and not (username and password):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Login username and initial password are required for a new employee.",
        )
    employee = create_employee(db, **data, actor=actor, commit=False)
    account_id = None
    try:
        if username and password:
            account_id = _provision_account(employee, username, password)
        db.commit()
    except Exception:
        db.rollback()
        if account_id is not None:
            auth_accounts.delete_account_by_id(account_id)
        raise
    return employee

@router.post("/bulk", response_model=BulkCreateResult, status_code=status.HTTP_201_CREATED)
def bulk_create(db: DbSession, payload: list[EmployeeCreate], actor: ActorDep, identity: HrDep):
    rows, accounts = [], []
    for item in payload:
        data = item.model_dump()
        accounts.append((data.pop("account_username"), data.pop("account_password")))
        rows.append(data)
    if identity.role and any(not (username and password)
                             for username, password in accounts):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "Login username and initial password are required for every new employee.",
        )
    created = create_employees_bulk(db, rows, actor=actor, commit=False)
    account_ids = []
    try:
        for employee, (username, password) in zip(created, accounts):
            if username and password:
                account_ids.append(_provision_account(employee, username, password))
        db.commit()
    except Exception:
        db.rollback()
        for account_id in account_ids:
            auth_accounts.delete_account_by_id(account_id)
        raise
    return BulkCreateResult(created=len(created), employees=created)

@router.patch("/{employee_id}", response_model=EmployeeRead)
def update(db: DbSession, employee_id: Annotated[int, Path(ge=1)],
           payload: EmployeeUpdate, actor: ActorDep, _: HrDep):
    changes = payload.model_dump(exclude_unset=True)
    employee = update_employee(
        db, employee_id, **changes, actor=actor, commit=False)
    _sync_account(employee, {k: (v.value if hasattr(v, "value") else v)
                             for k, v in changes.items()})
    db.commit()
    return employee

@router.post("/{employee_id}/deactivate", response_model=EmployeeRead)
def deactivate(db: DbSession, employee_id: Annotated[int, Path(ge=1)],
               actor: ActorDep, _: HrDep):
    employee = deactivate_employee(
        db, employee_id, actor=actor, commit=False)
    try:
        auth_accounts.update_account(employee_id, disabled=True)
        auth_accounts.disable_employee_trackers(employee_id)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The employee login account could not be disabled. No changes were saved.",
        ) from exc
    db.commit()
    return employee

@router.post("/{employee_id}/reactivate", response_model=EmployeeRead)
def reactivate(db: DbSession, employee_id: Annotated[int, Path(ge=1)],
               actor: ActorDep, _: HrDep):
    employee = reactivate_employee(
        db, employee_id, actor=actor, commit=False)
    try:
        auth_accounts.update_account(employee_id, disabled=False)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "The employee login account could not be enabled. No changes were saved.",
        ) from exc
    db.commit()
    return employee

@router.delete("/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def hard_delete(db: DbSession, employee_id: Annotated[int, Path(ge=1)],
                actor: ActorDep, _: HrDep):
    delete_employee(db, employee_id, actor=actor, commit=False)
    auth_accounts.delete_account(employee_id)
    db.commit()
