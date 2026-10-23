from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, status

from app.deps import DbSession, PaginationDep
from app.schemas.common import Page
from app.schemas.removal import ViolationRemovalRead
from queries import (
    count_violation_removals,
    get_violation_removal,
    list_violation_removals,
)

router = APIRouter(prefix="/violation-removals", tags=["violation-removals"])


@router.get("", response_model=Page[ViolationRemovalRead], summary="All violation removals")
def list_removals(
    db: DbSession,
    page: PaginationDep,
    employee_id: Annotated[int | None, Query(ge=1, description="Filter by employee")] = None,
    removed_by: Annotated[str | None, Query(max_length=150, description="Filter by remover name (substring)")] = None,
    since: Annotated[datetime | None, Query(description="Inclusive lower bound on removed_at (UTC)")] = None,
    until: Annotated[datetime | None, Query(description="Inclusive upper bound on removed_at (UTC)")] = None,
    search: Annotated[str | None, Query(max_length=100, description="Search reason, employee, violation type")] = None,
):
    items = list_violation_removals(
        db,
        employee_id=employee_id,
        removed_by=removed_by,
        since=since,
        until=until,
        search=search,
        limit=page.limit,
        offset=page.offset,
    )
    total = count_violation_removals(
        db,
        employee_id=employee_id,
        removed_by=removed_by,
        since=since,
        until=until,
        search=search,
    )
    return Page(items=items, total=total, limit=page.limit, offset=page.offset)


@router.get("/{removal_id}", response_model=ViolationRemovalRead, summary="One removal entry")
def get_removal(db: DbSession, removal_id: Annotated[int, Path(ge=1)]):
    removal = get_violation_removal(db, removal_id)
    if removal is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"ViolationRemoval {removal_id} not found")
    return removal
