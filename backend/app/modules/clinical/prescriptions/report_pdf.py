"""HTML -> PDF rendering for the prescription report (BE-T7.x).

Renders the Jinja2 template in templates/prescription.html through WeasyPrint.
Header logos are embedded as base64 data URIs so the PDF needs no filesystem
or network access at render time and looks identical everywhere. Mirrors
app.modules.visits.report_pdf (case sheet report).
"""

from __future__ import annotations

import base64
from functools import lru_cache
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML

_MODULE_DIR = Path(__file__).resolve().parent
_TEMPLATES_DIR = _MODULE_DIR / "templates"
_ASSETS_DIR = _MODULE_DIR / "report_assets"

_LOGO_FILES = {
    "logo_seal_left": "seal-left.png",
    "logo_wordmark_center": "wordmark-center.png",
    "logo_sacred_grove_right": "sacred-grove-right.png",
}

_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"]),
)


@lru_cache(maxsize=1)
def _logo_data_uris() -> dict[str, str]:
    uris: dict[str, str] = {}
    for key, filename in _LOGO_FILES.items():
        data = (_ASSETS_DIR / filename).read_bytes()
        uris[key] = f"data:image/png;base64,{base64.b64encode(data).decode('ascii')}"
    return uris


def render_prescription_pdf(context: dict[str, Any]) -> bytes:
    """Render the prescription context dict to PDF bytes."""
    template = _env.get_template("prescription.html")
    html_string = template.render(**context, **_logo_data_uris())
    return HTML(string=html_string, base_url=str(_TEMPLATES_DIR)).write_pdf()
