from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


class ActivityEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    occurred_at: datetime
    event_date: date
    actor: str
    action: str
    target_type: str
    target_id: int | None = None
    employee_id: int | None = None
    summary: str
    metadata_json: dict | None = None


class CalendarDay(BaseModel):
    date: date
    total: int
    employees: int
    violations: int
    violation_types: int
    removals: int


class DigestActorCount(BaseModel):
    actor: str
    count: int


class DailyDigest(BaseModel):
    date: date
    total: int
    by_action: dict[str, int]
    by_actor: list[DigestActorCount]
    highlights: list[str]
    events: list[ActivityEventRead]
