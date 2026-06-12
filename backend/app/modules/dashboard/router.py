"""Dashboard routes (BE-DASH.5).

Routes:
  GET /dashboard/summary  — aggregated KPI snapshot, sections filtered by caller permissions
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_permission
from app.core.permissions import PERM_VIEW_PATIENT
from app.modules.dashboard import service as svc
from app.modules.dashboard.schemas import DashboardSummary

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

# All authenticated clinical roles have view_patient; use it as the floor gate.
# Section-level filtering happens inside the service based on full permissions.
ViewPatient = Annotated[dict, Depends(require_permission(PERM_VIEW_PATIENT))]


@router.get(
    "/summary",
    response_model=DashboardSummary,
    summary="Aggregated dashboard KPIs, filtered by caller permissions",
)
def get_dashboard_summary(
    payload: ViewPatient,
    db: Annotated[Session, Depends(get_db)],
) -> DashboardSummary:
    return svc.get_summary(db, payload)
