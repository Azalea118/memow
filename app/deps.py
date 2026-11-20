from typing import Annotated

from fastapi import Depends, Query, Header, HTTPException
from sqlalchemy.orm import Session

from app.session import get_session


DbSession = Annotated[Session, Depends(get_session)]


class Pagination:
    def __init__(
        self,
        limit: Annotated[int, Query(ge=1, le=200)] = 50,
        offset: Annotated[int, Query(ge=0)] = 0,
    ) -> None:
        self.limit = limit
        self.offset = offset

def get_actor(x_actor: Annotated[str | None, Header()] = None) -> str:
    """Actor for audit logging. Header-based today; swap for auth user later."""
    if not x_actor or not x_actor.strip():
        raise HTTPException(
            status_code=400,
            detail="X-Actor header required for write operations. "
                   "Set it to the name/identifier of the person performing the action.",
        )
    return x_actor.strip()


ActorDep = Annotated[str, Depends(get_actor)]
PaginationDep = Annotated[Pagination, Depends()]


class Identity:
    def __init__(self, role: str | None, employee_id: int | None) -> None:
        self.role = (role or "").strip().lower()
        self.employee_id = employee_id


def get_identity(
    x_role: Annotated[str | None, Header()] = None,
    x_employee_id: Annotated[str | None, Header()] = None,
) -> Identity:
    employee_id = None
    if x_employee_id and x_employee_id.strip().isdigit():
        employee_id = int(x_employee_id.strip())
    return Identity(x_role, employee_id)


def require_hr(identity: Annotated[Identity, Depends(get_identity)]) -> Identity:
    if identity.role and identity.role != "hr":
        raise HTTPException(status_code=403, detail="Only HR can manage employees.")
    return identity


def require_issuer(identity: Annotated[Identity, Depends(get_identity)]) -> Identity:
    if identity.role and identity.role not in ("hr", "supervisor"):
        raise HTTPException(
            status_code=403,
            detail="Only HR or a Supervisor can issue violations.")
    return identity


def require_self_or_staff(employee_id: int,
                         identity: Annotated[Identity, Depends(get_identity)]) -> Identity:
    if identity.role == "employee" and identity.employee_id != employee_id:
        raise HTTPException(
            status_code=403,
            detail="You can only view your own violation records.")
    return identity


IdentityDep = Annotated[Identity, Depends(get_identity)]
HrDep = Annotated[Identity, Depends(require_hr)]
IssuerDep = Annotated[Identity, Depends(require_issuer)]


def check_self_or_staff(identity: Identity, employee_id: int) -> None:
    if identity.role == "employee" and identity.employee_id != employee_id:
        raise HTTPException(
            status_code=403,
            detail="You can only view your own violation records.")
