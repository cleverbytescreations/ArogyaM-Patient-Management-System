#!/usr/bin/env python3
"""
ArogyaM PMS — ~50k patient seed data generator (TST-T0.4)

Generates realistic Indian patient records to exercise the FTS + pg_trgm
search indexes at production-representative scale before load testing.

Usage:
    pip install psycopg[binary] faker
    python tests/perf/seed_patients.py \
        --dsn "postgresql://arogyam:arogyam_dev_pw@localhost:5432/arogyam" \
        --count 50000

WARNING: Only run against a dedicated test/staging database. Running against
a production database will insert 50 k fake patient records.
"""

import argparse
import random
import sys
import uuid
from datetime import date, timedelta

try:
    import psycopg
except ImportError:
    sys.exit("psycopg not installed — run: pip install 'psycopg[binary]'")

try:
    from faker import Faker
    from faker.providers import person, phone_number
except ImportError:
    sys.exit("faker not installed — run: pip install faker")

BATCH_SIZE = 500

# Indian first and last names for realistic FTS/trgm test data.
FIRST_NAMES = [
    "Aarav", "Arjun", "Arun", "Bala", "Deepa", "Devi", "Ganesh", "Geetha",
    "Hari", "Indira", "Karthik", "Kavitha", "Krishna", "Lakshmi", "Mala",
    "Manoj", "Meena", "Mohan", "Nair", "Nithya", "Padma", "Pooja", "Priya",
    "Raj", "Rajan", "Rajesh", "Ramesh", "Ravi", "Rekha", "Rohini", "Sabitha",
    "Sangeetha", "Saraswathi", "Saritha", "Selvi", "Shanthi", "Shiva",
    "Sridhar", "Srinivas", "Suresh", "Uma", "Usha", "Venkat", "Vijaya",
    "Vijayalakshmi", "Vimal", "Vinodh", "Vishal", "Yamuna", "Yamini",
]
LAST_NAMES = [
    "Agarwal", "Balachandran", "Chandrasekaran", "Chidambaram", "Das",
    "Ganesan", "Gupta", "Iyer", "Jaiswal", "Jayaraman", "Krishnaswamy",
    "Kumar", "Menon", "Murugan", "Nair", "Narasimhan", "Palanisamy",
    "Pandey", "Pillai", "Prabhu", "Raghavan", "Rajendran", "Ramachandran",
    "Reddy", "Sharma", "Shastri", "Singh", "Srinivasan", "Subramaniam",
    "Swaminathan", "Thyagarajan", "Varma", "Venkataraman", "Venkatesan",
    "Viswanathan",
]
OP_CATEGORIES = ["GEN", "PAED", "OBS", "SURG", "ENT", "ORTHO", "DERM"]
BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]


def random_dob() -> date:
    start = date(1940, 1, 1)
    end = date(2010, 12, 31)
    return start + timedelta(days=random.randint(0, (end - start).days))


def random_mobile() -> str:
    prefix = random.choice(["98", "97", "96", "95", "94", "93", "91", "90", "87", "86"])
    return prefix + str(random.randint(10_000_000, 99_999_999))


def random_op_number(seq: int) -> str:
    cat = random.choice(OP_CATEGORIES)
    year = random.choice(["2022", "2023", "2024", "2025"])
    return f"OP/{cat}/{year}/{seq:05d}"


def seed(dsn: str, count: int) -> None:
    print(f"Seeding {count:,} patients into {dsn!r} …")
    inserted = 0

    with psycopg.connect(dsn) as conn:
        with conn.cursor() as cur:
            batch: list[tuple] = []

            for i in range(1, count + 1):
                first = random.choice(FIRST_NAMES)
                last = random.choice(LAST_NAMES)
                gender = random.choice(["M", "F", "O"])
                dob = random_dob()
                mobile = random_mobile()
                op_number = random_op_number(i)
                blood_group = random.choice(BLOOD_GROUPS + [None, None])  # ~25% None
                address = f"{random.randint(1,200)} {random.choice(['MG Road','Gandhi Nagar','Nehru Street','Anna Salai','Rajiv Marg'])} {random.choice(['Chennai','Bengaluru','Coimbatore','Mysuru','Madurai','Trichy'])}"

                batch.append((
                    str(uuid.uuid4()),  # id
                    op_number,
                    first,
                    last,
                    gender,
                    dob,
                    mobile,
                    blood_group,
                    address,
                ))

                if len(batch) >= BATCH_SIZE:
                    cur.executemany(
                        """
                        INSERT INTO patients
                            (id, op_number, first_name, last_name, gender,
                             date_of_birth, mobile, blood_group, address,
                             created_at, updated_at, version)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s,
                                now(), now(), 1)
                        ON CONFLICT (op_number) DO NOTHING
                        """,
                        batch,
                    )
                    conn.commit()
                    inserted += len(batch)
                    batch = []
                    if inserted % 5000 == 0:
                        print(f"  … {inserted:,} / {count:,} inserted")

            if batch:
                cur.executemany(
                    """
                    INSERT INTO patients
                        (id, op_number, first_name, last_name, gender,
                         date_of_birth, mobile, blood_group, address,
                         created_at, updated_at, version)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s,
                            now(), now(), 1)
                    ON CONFLICT (op_number) DO NOTHING
                    """,
                    batch,
                )
                conn.commit()
                inserted += len(batch)

    print(f"Done — {inserted:,} rows inserted (conflicts skipped).")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed ~50k test patients")
    parser.add_argument(
        "--dsn",
        required=True,
        help="psycopg3 DSN: postgresql://user:pass@host:port/dbname",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=50_000,
        help="Number of patients to insert (default 50000)",
    )
    args = parser.parse_args()

    if "prod" in args.dsn.lower() or "production" in args.dsn.lower():
        print("ERROR: DSN looks like a production database. Aborting.", file=sys.stderr)
        sys.exit(1)

    seed(args.dsn, args.count)


if __name__ == "__main__":
    main()
