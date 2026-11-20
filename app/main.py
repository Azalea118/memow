from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.errors import register_error_handlers
from app.routers import activity, analytics, employees, removals, subsections, violation_types, violations
from db import engine


def ensure_schema() -> None:
    """Apply additive changes to an existing app1 database."""
    with engine.begin() as conn:
        rows = conn.execute(text("PRAGMA table_info(employees)")).fetchall()
        if not rows:
            return
        columns = {row[1] for row in rows}
        if "employee_type" not in columns:
            conn.execute(text(
                "ALTER TABLE employees ADD COLUMN employee_type "
                "VARCHAR(20) NOT NULL DEFAULT 'employee'"))
        conn.execute(text(
            "CREATE INDEX IF NOT EXISTS ix_employees_employee_type "
            "ON employees(employee_type)"))


def create_app() -> FastAPI:
    ensure_schema()
    app = FastAPI(title="Violation Tracker API", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        # allow_origins=["http://localhost:3000"],
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)

    app.include_router(employees.router)
    app.include_router(violation_types.router)
    app.include_router(subsections.router)
    app.include_router(violations.router)
    app.include_router(removals.router)
    app.include_router(activity.router)
    app.include_router(analytics.router)

    return app


app = create_app()
_ = app.openapi()
