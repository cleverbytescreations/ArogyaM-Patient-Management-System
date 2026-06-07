"""Seed 10 dummy patients for development/testing.

Run inside the API container after migrations:
    python scripts/seed_dummy_patients.py

Idempotent: skips any patient whose mobile number already exists.
OP numbers are generated via the transaction-safe `generate_op_number`
(row-locked `op_sequence` increment), per category, inside the same
session/transaction as the insert.
"""

from __future__ import annotations

import sys
import uuid
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.db import SessionLocal

# Register all model tables so SQLAlchemy can resolve cross-module foreign
# keys (e.g. patients.updated_by -> users) when flushing. Mirrors the model
# imports in app/migrations/env.py.
from app.modules.auth import models as _auth_models  # noqa: F401  register tables
from app.modules.clinical.discharge import models as _discharge_models  # noqa: F401
from app.modules.clinical.prescriptions import models as _prescription_models  # noqa: F401
from app.modules.masterdata import models as _masterdata_models  # noqa: F401
from app.modules.patients.models import Patient
from app.modules.patients.op_number import generate_op_number
from app.modules.visits import models as _visit_models  # noqa: F401

DUMMY_PATIENTS = [
    {
        "op_category_code": "REGULAR",
        "full_name": "Anita Joseph",
        "date_of_birth": date(1985, 4, 12),
        "gender": "FEMALE",
        "mobile": "9000000001",
        "email": "anita.joseph@example.dev",
        "city": "Kochi",
        "state": "Kerala",
        "pincode": "682001",
        "marital_status": "MARRIED",
        "blood_group": "O_POS",
    },
    {
        "op_category_code": "REGULAR",
        "full_name": "Rahul Menon",
        "age_years": 41,
        "gender": "MALE",
        "mobile": "9000000002",
        "city": "Thrissur",
        "state": "Kerala",
        "pincode": "680001",
        "profession": "Teacher",
        "blood_group": "B_POS",
    },
    {
        "op_category_code": "VILLAGE",
        "full_name": "Lakshmi Pillai",
        "date_of_birth": date(1972, 11, 3),
        "gender": "FEMALE",
        "mobile": "9000000003",
        "city": "Alappuzha",
        "state": "Kerala",
        "pincode": "688001",
        "marital_status": "WIDOWED",
        "dietary_preference": "VEG",
    },
    {
        "op_category_code": "REGULAR",
        "full_name": "Suresh Babu",
        "age_years": 58,
        "gender": "MALE",
        "mobile": "9000000004",
        "email": "suresh.babu@example.dev",
        "city": "Kollam",
        "state": "Kerala",
        "pincode": "691001",
        "blood_group": "A_NEG",
        "height_cm": 168.5,
        "weight_kg": 74.2,
    },
    {
        "op_category_code": "CAMP",
        "full_name": "Fathima Beevi",
        "age_years": 36,
        "gender": "FEMALE",
        "mobile": "9000000005",
        "city": "Kozhikode",
        "state": "Kerala",
        "pincode": "673001",
        "dietary_preference": "NONVEG",
    },
    {
        "op_category_code": "REGULAR",
        "full_name": "Manoj Varma",
        "date_of_birth": date(1990, 7, 22),
        "gender": "MALE",
        "mobile": "9000000006",
        "email": "manoj.varma@example.dev",
        "city": "Kannur",
        "state": "Kerala",
        "pincode": "670001",
        "marital_status": "SINGLE",
        "profession": "Engineer",
    },
    {
        "op_category_code": "VILLAGE",
        "full_name": "Saraswathi Amma",
        "age_years": 67,
        "gender": "FEMALE",
        "mobile": "9000000007",
        "city": "Palakkad",
        "state": "Kerala",
        "pincode": "678001",
        "blood_group": "AB_POS",
        "marital_status": "WIDOWED",
    },
    {
        "op_category_code": "REGULAR",
        "full_name": "Joseph Thomas",
        "date_of_birth": date(1979, 1, 15),
        "gender": "MALE",
        "mobile": "9000000008",
        "city": "Kottayam",
        "state": "Kerala",
        "pincode": "686001",
        "profession": "Farmer",
        "dietary_preference": "VEGAN",
    },
    {
        "op_category_code": "REGULAR",
        "full_name": "Devika Nair",
        "age_years": 29,
        "gender": "FEMALE",
        "mobile": "9000000009",
        "email": "devika.nair@example.dev",
        "city": "Thiruvananthapuram",
        "state": "Kerala",
        "pincode": "695001",
        "marital_status": "SINGLE",
        "blood_group": "B_NEG",
    },
    {
        "op_category_code": "CAMP",
        "full_name": "Ouseph Mathew",
        "age_years": 73,
        "gender": "MALE",
        "mobile": "9000000010",
        "city": "Idukki",
        "state": "Kerala",
        "pincode": "685601",
        "marital_status": "MARRIED",
        "remarks": "Camp registration — follow-up needed",
    },
]


def main() -> None:
    with SessionLocal() as db:
        for spec in DUMMY_PATIENTS:
            existing = db.execute(
                select(Patient).where(Patient.mobile == spec["mobile"])
            ).scalar_one_or_none()
            if existing:
                print(f"[seed_dummy_patients] mobile '{spec['mobile']}' already exists — skipping.")
                continue

            op_number = generate_op_number(db, spec["op_category_code"])
            patient = Patient(id=uuid.uuid4(), op_number=op_number, **spec)
            db.add(patient)
            db.commit()
            print(
                f"[seed_dummy_patients] Created '{spec['full_name']}' "
                f"(OP {op_number}, {spec['op_category_code']})."
            )

    print("[seed_dummy_patients] Done.")


if __name__ == "__main__":
    main()
