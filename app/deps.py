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
