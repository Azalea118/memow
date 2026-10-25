from collections import Counter, defaultdict
from datetime import date as date_type
from typing import Annotated

from fastapi import APIRouter, Path, Query

from app.deps import DbSession, PaginationDep
from app.schemas.activity import (
    ActivityEventRead,
    CalendarDay,
    DailyDigest,
    DigestActorCount,
)
from app.schemas.common import Page
from queries import (
    count_activity_events,
    get_activity_calendar,
    get_daily_digest_events,
    list_activity_events,
)

router = APIRouter(prefix="/activity", tags=["activity"])


@router.get("/timeline", response_model=Page[ActivityEventRead], summary="Activity events")
def timeline(
    db: DbSession,
    page: PaginationDep,
    day: Annotated[date_type | None, Query(description="Single UTC day (YYYY-MM-DD)")] = None,
    start: Annotated[date_type | None, Query(description="Inclusive start date")] = None,
    end: Annotated[date_type | None, Query(description="Inclusive end date")] = None,
    actor: Annotated[str | None, Query(max_length=150)] = None,
    action: Annotated[str | None, Query(max_length=50)] = None,
    target_type: Annotated[str | None, Query(max_length=30)] = None,
    employee_id: Annotated[int | None, Query(ge=1)] = None,
):
    items = list_activity_events(
        db, day=day, start=start, end=end, actor=actor, action=action,
        target_type=target_type, employee_id=employee_id,
        limit=page.limit, offset=page.offset,
    )
    total = count_activity_events(
        db, day=day, start=start, end=end, actor=actor, action=action,
        target_type=target_type, employee_id=employee_id,
    )
    return Page(items=items, total=total, limit=page.limit, offset=page.offset)


@router.get("/calendar", response_model=list[CalendarDay], summary="Per-day event counts")
def calendar(
    db: DbSession,
    start: Annotated[date_type, Query(description="Inclusive start date")],
    end: Annotated[date_type, Query(description="Inclusive end date")],
):
    rows = get_activity_calendar(db, start=start, end=end)
    return [
        CalendarDay(
            date=r.event_date, total=r.total, employees=r.employees,
            violations=r.violations, violation_types=r.violation_types,
            removals=r.removals,
        )
        for r in rows
    ]


@router.get("/digest/{day}", response_model=DailyDigest, summary="Full daily digest")
def digest(db: DbSession, day: Annotated[date_type, Path()]):
    events = get_daily_digest_events(db, day)
    by_action = Counter(e.action for e in events)
    by_actor_counter = Counter(e.actor for e in events)

    highlights = _build_highlights(events)

    return DailyDigest(
        date=day,
        total=len(events),
        by_action=dict(by_action),
        by_actor=[DigestActorCount(actor=a, count=c) for a, c in by_actor_counter.most_common()],
        highlights=highlights,
        events=[ActivityEventRead.model_validate(e) for e in events],
    )


def _build_highlights(events) -> list[str]:
    """Human-readable one-liners per action, generated deterministically."""
    groups: dict[str, list] = defaultdict(list)
    for e in events:
        groups[e.action].append(e)

    out: list[str] = []

    if group := groups.get("employee.created"):
        names = [f"{e.metadata_json.get('employee_code', '?')} ({e.metadata_json.get('full_name', '?')})"
                 for e in group if e.metadata_json]
        out.append(f"{len(group)} employee(s) added: {', '.join(names)}")

    if group := groups.get("employees.bulk_created"):
        total = sum((e.metadata_json or {}).get("count", 0) for e in group)
        out.append(f"Bulk import: {total} employees added across {len(group)} batch(es)")

    if group := groups.get("employee.updated"):
        out.append(f"{len(group)} employee profile update(s)")

    if group := groups.get("employee.deactivated"):
        out.append(f"{len(group)} employee(s) deactivated")

    if group := groups.get("employee.activated"):
        out.append(f"{len(group)} employee(s) reactivated")

    if group := groups.get("employee.deleted"):
        out.append(f"⚠️ {len(group)} employee(s) hard-deleted")

    if group := groups.get("violation.assigned"):
        strikes = sum(1 for e in group if (e.metadata_json or {}).get("is_strike"))
        pts = sum((e.metadata_json or {}).get("points", 0) for e in group)
        extra = f" ({strikes} strike{'s' if strikes != 1 else ''}, {pts} total points)" if strikes else f" ({pts} total points)"
        out.append(f"{len(group)} violation(s) issued{extra}")

    if group := groups.get("violation.removed"):
        # cluster by (actor, reason, employee_code) to detect amnesty
        clusters: dict[tuple, int] = Counter(
            (e.actor, (e.metadata_json or {}).get("reason", ""), (e.metadata_json or {}).get("employee_code", ""))
            for e in group
        )
        for (actor, reason, emp_code), n in clusters.items():
            out.append(f"{n} violation(s) removed by {actor}"
                       + (f" from {emp_code}" if emp_code else "")
                       + (f" — reason: {reason}" if reason else ""))

    if group := groups.get("violation_type.created"):
        names = [(e.metadata_json or {}).get("name", "?") for e in group]
        out.append(f"{len(group)} violation type(s) added: {', '.join(names)}")

    if group := groups.get("violation_type.deleted"):
        out.append(f"{len(group)} violation type(s) deleted")

    return out or ["No activity recorded"]
