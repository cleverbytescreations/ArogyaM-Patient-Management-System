"""Permission constants and role→permission mapping (BE-TF.5, SAD §11.2).

The role map is the single source of truth consumed by require_permission() and
by /me/permissions. Frontend reads effective permissions from the API — it never
hard-codes this matrix.
"""

from __future__ import annotations

# --------------------------------------------------------------------------- #
# Permission codes (API spec §2.3)
# --------------------------------------------------------------------------- #
PERM_CREATE_PATIENT = "create_patient"
PERM_VIEW_PATIENT = "view_patient"
PERM_EDIT_PATIENT = "edit_patient"
PERM_VIEW_MEDICAL_HISTORY = "view_medical_history"
PERM_ADD_CONSULTATION = "add_consultation"
PERM_ADD_PRESCRIPTION = "add_prescription"
PERM_MANAGE_USERS = "manage_users"
PERM_MANAGE_MASTER_DATA = "manage_master_data"
PERM_VIEW_AUDIT = "view_audit"
PERM_BACKUP_CONTROL = "backup_control"
PERM_EXPORT = "export"
PERM_MANAGE_FOLLOWUPS = "manage_followups"
PERM_MERGE_RECORDS = "merge_records"
PERM_REQUEST_MERGE = "request_merge"
PERM_VIEW_REPORTS = "view_reports"

ALL_PERMISSIONS: frozenset[str] = frozenset(
    {
        PERM_CREATE_PATIENT,
        PERM_VIEW_PATIENT,
        PERM_EDIT_PATIENT,
        PERM_VIEW_MEDICAL_HISTORY,
        PERM_ADD_CONSULTATION,
        PERM_ADD_PRESCRIPTION,
        PERM_MANAGE_USERS,
        PERM_MANAGE_MASTER_DATA,
        PERM_VIEW_AUDIT,
        PERM_BACKUP_CONTROL,
        PERM_EXPORT,
        PERM_MANAGE_FOLLOWUPS,
        PERM_MERGE_RECORDS,
        PERM_REQUEST_MERGE,
        PERM_VIEW_REPORTS,
    }
)

# --------------------------------------------------------------------------- #
# Role codes (must match roles.code in the database)
# --------------------------------------------------------------------------- #
ROLE_ADMIN = "ADMIN"
ROLE_DOCTOR = "DOCTOR"
ROLE_RECEPTION = "RECEPTION"
ROLE_DATA_ENTRY = "DATA_ENTRY"

# --------------------------------------------------------------------------- #
# Role → permission mapping (SAD §11.2)
# --------------------------------------------------------------------------- #
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    ROLE_ADMIN: ALL_PERMISSIONS,
    ROLE_DOCTOR: frozenset(
        {
            PERM_VIEW_PATIENT,
            PERM_VIEW_MEDICAL_HISTORY,
            PERM_ADD_CONSULTATION,
            PERM_ADD_PRESCRIPTION,
            PERM_MANAGE_FOLLOWUPS,
            PERM_EXPORT,
            PERM_VIEW_REPORTS,
        }
    ),
    ROLE_RECEPTION: frozenset(
        {
            PERM_CREATE_PATIENT,
            PERM_VIEW_PATIENT,
            PERM_EDIT_PATIENT,
            PERM_MANAGE_FOLLOWUPS,
            PERM_REQUEST_MERGE,
        }
    ),
    ROLE_DATA_ENTRY: frozenset(
        {
            PERM_CREATE_PATIENT,
            PERM_VIEW_PATIENT,
            PERM_EDIT_PATIENT,
            PERM_MANAGE_FOLLOWUPS,
            PERM_REQUEST_MERGE,
        }
    ),
}


def resolve_permissions(role_codes: list[str]) -> list[str]:
    """Return deduplicated permissions for the given role code list."""
    perms: set[str] = set()
    for code in role_codes:
        perms |= ROLE_PERMISSIONS.get(code, frozenset())
    return sorted(perms)
