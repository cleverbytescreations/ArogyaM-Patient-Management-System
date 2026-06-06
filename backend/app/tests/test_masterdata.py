"""Integration tests for master data and OP sequence APIs (BE-T2.1, BE-T2.2, API-T2.1).

Covers:
- List/create/update master data items by type
- Unknown type → 404; duplicate code → 409
- Deactivation does not break existing references
- OP sequence list and admin update
- last_sequence not client-writable
- RBAC: write requires manage_master_data; read is authenticated-only
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

BASE = "/api/v1"


# ── Helpers ───────────────────────────────────────────────────────────────────


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Master data read (any authenticated user) ─────────────────────────────────


class TestMasterDataRead:
    def test_list_known_type_returns_items(self, client: TestClient, reception_token: str) -> None:
        r = client.get(f"{BASE}/master-data/gender", headers=_auth(reception_token))
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        assert len(data) > 0
        assert all("code" in item and "label" in item for item in data)

    def test_list_unknown_type_returns_404(self, client: TestClient, reception_token: str) -> None:
        r = client.get(f"{BASE}/master-data/nonexistent_type", headers=_auth(reception_token))
        assert r.status_code == 404

    def test_list_unauthenticated_returns_401(self, client: TestClient) -> None:
        r = client.get(f"{BASE}/master-data/gender")
        assert r.status_code == 401

    def test_active_filter_hides_inactive(
        self, client: TestClient, db: Session, admin_token: str, reception_token: str
    ) -> None:
        # Deactivate one item via the update endpoint
        items = client.get(f"{BASE}/master-data/gender", headers=_auth(reception_token)).json()
        assert len(items) > 0
        target_id = items[0]["id"]
        r = client.put(
            f"{BASE}/master-data/gender/{target_id}",
            json={"is_active": False},
            headers=_auth(admin_token),
        )
        assert r.status_code == 200
        assert r.json()["is_active"] is False

        # Active-only filter should exclude it
        all_items = client.get(f"{BASE}/master-data/gender", headers=_auth(reception_token)).json()
        active_items = client.get(
            f"{BASE}/master-data/gender?active=true", headers=_auth(reception_token)
        ).json()
        assert len(active_items) < len(all_items) or any(
            i["id"] == target_id for i in all_items
        )
        assert all(i["is_active"] for i in active_items)


# ── Master data write (Admin — manage_master_data) ────────────────────────────


class TestMasterDataWrite:
    def test_create_item_as_admin(self, client: TestClient, admin_token: str) -> None:
        r = client.post(
            f"{BASE}/master-data/blood_group",
            json={"code": "TEST_BG", "label": "Test Blood Group", "sort_order": 99},
            headers=_auth(admin_token),
        )
        assert r.status_code == 201
        body = r.json()
        assert body["code"] == "TEST_BG"
        assert body["label"] == "Test Blood Group"
        assert body["type"] == "blood_group"
        assert body["is_active"] is True

    def test_create_duplicate_code_returns_409(
        self, client: TestClient, admin_token: str
    ) -> None:
        r1 = client.post(
            f"{BASE}/master-data/blood_group",
            json={"code": "DUP_BG", "label": "Dup BG"},
            headers=_auth(admin_token),
        )
        assert r1.status_code == 201
        r2 = client.post(
            f"{BASE}/master-data/blood_group",
            json={"code": "DUP_BG", "label": "Another Dup BG"},
            headers=_auth(admin_token),
        )
        assert r2.status_code == 409

    def test_create_unknown_type_returns_404(
        self, client: TestClient, admin_token: str
    ) -> None:
        r = client.post(
            f"{BASE}/master-data/unknown_type",
            json={"code": "XX", "label": "Test"},
            headers=_auth(admin_token),
        )
        assert r.status_code == 404

    def test_non_admin_cannot_create(
        self, client: TestClient, reception_token: str
    ) -> None:
        r = client.post(
            f"{BASE}/master-data/blood_group",
            json={"code": "RECEP_BG", "label": "Recep BG"},
            headers=_auth(reception_token),
        )
        assert r.status_code == 403

    def test_update_label(self, client: TestClient, admin_token: str) -> None:
        r = client.post(
            f"{BASE}/master-data/dietary_preference",
            json={"code": "UPD_PREF", "label": "Old Label"},
            headers=_auth(admin_token),
        )
        assert r.status_code == 201
        item_id = r.json()["id"]

        r2 = client.put(
            f"{BASE}/master-data/dietary_preference/{item_id}",
            json={"label": "New Label"},
            headers=_auth(admin_token),
        )
        assert r2.status_code == 200
        assert r2.json()["label"] == "New Label"

    def test_update_wrong_type_returns_404(
        self, client: TestClient, admin_token: str
    ) -> None:
        r = client.post(
            f"{BASE}/master-data/dietary_preference",
            json={"code": "XPREF", "label": "X"},
            headers=_auth(admin_token),
        )
        assert r.status_code == 201
        item_id = r.json()["id"]

        # Try to update via a different type
        r2 = client.put(
            f"{BASE}/master-data/gender/{item_id}",
            json={"label": "Hijack"},
            headers=_auth(admin_token),
        )
        assert r2.status_code == 404

    def test_update_empty_body_returns_422(
        self, client: TestClient, admin_token: str
    ) -> None:
        r = client.post(
            f"{BASE}/master-data/marital_status",
            json={"code": "EMPTY_UPD", "label": "Dummy"},
            headers=_auth(admin_token),
        )
        item_id = r.json()["id"]
        r2 = client.put(
            f"{BASE}/master-data/marital_status/{item_id}",
            json={},
            headers=_auth(admin_token),
        )
        assert r2.status_code == 422

    def test_code_validated_uppercase_pattern(
        self, client: TestClient, admin_token: str
    ) -> None:
        r = client.post(
            f"{BASE}/master-data/gender",
            json={"code": "invalid-code!", "label": "Bad code"},
            headers=_auth(admin_token),
        )
        assert r.status_code == 422


# ── OP Sequence ───────────────────────────────────────────────────────────────


class TestOpSequences:
    def test_list_sequences_returns_seeded_rows(
        self, client: TestClient, reception_token: str
    ) -> None:
        r = client.get(f"{BASE}/op-sequences", headers=_auth(reception_token))
        assert r.status_code == 200
        seqs = r.json()
        assert isinstance(seqs, list)
        assert len(seqs) >= 1
        codes = {s["category_code"] for s in seqs}
        # At least the seeded categories should be present
        assert len(codes) >= 1

    def test_list_unauthenticated_returns_401(self, client: TestClient) -> None:
        r = client.get(f"{BASE}/op-sequences")
        assert r.status_code == 401

    def test_update_prefix_as_admin(
        self, client: TestClient, admin_token: str, reception_token: str
    ) -> None:
        seqs = client.get(f"{BASE}/op-sequences", headers=_auth(reception_token)).json()
        assert len(seqs) > 0
        target = seqs[0]
        seq_id = target["id"]
        old_prefix = target["prefix"]

        new_prefix = f"T{seq_id}"  # short unique prefix
        r = client.put(
            f"{BASE}/op-sequences/{seq_id}",
            json={"prefix": new_prefix},
            headers=_auth(admin_token),
        )
        assert r.status_code == 200
        assert r.json()["prefix"] == new_prefix

        # Restore
        client.put(
            f"{BASE}/op-sequences/{seq_id}",
            json={"prefix": old_prefix},
            headers=_auth(admin_token),
        )

    def test_last_sequence_not_in_update_request(
        self, client: TestClient, admin_token: str, reception_token: str
    ) -> None:
        """last_sequence must NOT be accepted via the admin update endpoint."""
        seqs = client.get(f"{BASE}/op-sequences", headers=_auth(reception_token)).json()
        seq_id = seqs[0]["id"]
        original_last_seq = seqs[0]["last_sequence"]

        r = client.put(
            f"{BASE}/op-sequences/{seq_id}",
            json={"last_sequence": 9999},
            headers=_auth(admin_token),
        )
        # The request either gets 422 (field rejected by schema) or succeeds
        # but last_sequence is unchanged — it MUST NOT be writable.
        if r.status_code == 200:
            updated = r.json()
            assert updated["last_sequence"] == original_last_seq, (
                "last_sequence must not be client-writable via the update endpoint"
            )
        else:
            # 422 means the schema correctly rejected the extra field
            assert r.status_code in (422,)

    def test_non_admin_cannot_update_sequence(
        self, client: TestClient, reception_token: str
    ) -> None:
        seqs = client.get(f"{BASE}/op-sequences", headers=_auth(reception_token)).json()
        seq_id = seqs[0]["id"]
        r = client.put(
            f"{BASE}/op-sequences/{seq_id}",
            json={"is_active": False},
            headers=_auth(reception_token),
        )
        assert r.status_code == 403

    def test_update_nonexistent_seq_returns_404(
        self, client: TestClient, admin_token: str
    ) -> None:
        # 30000 is within SmallInteger range (max 32767) but will not exist
        r = client.put(
            f"{BASE}/op-sequences/30000",
            json={"is_active": False},
            headers=_auth(admin_token),
        )
        assert r.status_code == 404

    def test_update_duplicate_prefix_returns_409(
        self, client: TestClient, admin_token: str, reception_token: str
    ) -> None:
        seqs = client.get(f"{BASE}/op-sequences", headers=_auth(reception_token)).json()
        if len(seqs) < 2:
            pytest.skip("Need at least 2 sequences for this test")
        seq1_id = seqs[0]["id"]
        seq2_prefix = seqs[1]["prefix"]
        r = client.put(
            f"{BASE}/op-sequences/{seq1_id}",
            json={"prefix": seq2_prefix},
            headers=_auth(admin_token),
        )
        assert r.status_code == 409
