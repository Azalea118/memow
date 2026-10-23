from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ViolationRemovalCreate(BaseModel):
    """Body for POST .../remove and POST .../clear."""

    model_config = ConfigDict(extra="forbid")

    removed_by: str = Field(
        min_length=1,
        max_length=150,
        description="Name or identifier of the person removing the violation",
    )
    reason: str = Field(
        min_length=1,
        max_length=2000,
        description="Why this violation is being removed",
    )


class ViolationRemovalRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int

    # What was removed
    violation_record_id: int
    violation_type_id: int | None = None
    violation_type_name: str
    points: int
    is_strike: bool
    original_notes: str | None = None

    # To whom
    employee_id: int
    employee_code: str
    employee_full_name: str

    # From whom
    original_issued_by: str | None = None
    original_issued_at: datetime

    # By whom + why
    removed_by: str
    reason: str
    removed_at: datetime
