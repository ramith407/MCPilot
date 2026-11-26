from __future__ import annotations

import hmac
import secrets

from fastapi import HTTPException, Request, status

from mcpilot_api.config import CORS_ORIGINS

ALLOWED_HOSTS = {"127.0.0.1:8000", "localhost:8000"}
REQUEST_TOKEN_HEADER = "x-mcpilot-request-token"


def _validate_local_browser_request(request: Request) -> None:
    host = request.headers.get("host", "").lower()
    origin = request.headers.get("origin", "").rstrip("/")
    if host not in ALLOWED_HOSTS:
        raise HTTPException(status_code=400, detail="Unexpected Host header for the local API.")
    if origin not in CORS_ORIGINS:
        raise HTTPException(status_code=403, detail="Request origin is not an allowed MCPilot development origin.")


async def require_local_request(request: Request) -> None:
    _validate_local_browser_request(request)
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        expected = request.app.state.request_token
        supplied = request.headers.get(REQUEST_TOKEN_HEADER, "")
        if not supplied or not hmac.compare_digest(expected, supplied):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing or invalid local request token.")


def issue_request_token() -> str:
    return secrets.token_urlsafe(32)
