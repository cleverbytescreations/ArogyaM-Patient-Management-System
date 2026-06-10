"""Doctor signature -> base64 data URI for embedding into report PDFs.

Reports render through WeasyPrint and must not touch the filesystem or network at
render time (mirrors the logo data-URI pattern in the modules' report_pdf.py).
This helper pulls a doctor's signature image out of MinIO once during context
assembly and returns it as a data URI; report templates size it for A4 via CSS.
"""

from __future__ import annotations

import base64
import logging

from app.core.errors import ServiceUnavailableError
from app.modules.auth.models import User
from app.modules.documents.storage import storage

logger = logging.getLogger(__name__)


def signature_data_uri(doctor: User | None) -> str | None:
    """Return a `data:<type>;base64,...` URI for the doctor's signature, or None.

    Storage failures are swallowed (logged, no PHI) so a transient object-store
    outage degrades to the text-only signature rather than failing the report.
    """
    if doctor is None or doctor.signature_object_key is None:
        return None
    content_type = doctor.signature_content_type or "image/png"
    try:
        download = storage.stream(doctor.signature_object_key)
        data = b"".join(download.body)
    except ServiceUnavailableError:
        logger.warning("Signature unavailable for doctor %s; rendering text-only", doctor.id)
        return None
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{content_type};base64,{encoded}"
