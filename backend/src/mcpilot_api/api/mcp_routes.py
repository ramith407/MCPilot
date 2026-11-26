from __future__ import annotations

import hashlib
import hmac
import json
import secrets
import time
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from jsonschema import ValidationError as SchemaValidationError
from jsonschema import validate as validate_json_schema

from mcpilot_api.schemas import (
    ApprovalRequest,
    ApprovalResponse,
    ConnectRequest,
    IntegrationDefinition,
    RegisteredIntegrationResponse,
    SessionResponse,
    ToolApprovalRequest,
    ToolApprovalResponse,
    ToolCallRequest,
    ToolResultResponse,
)
from mcpilot_api.security import require_local_request
from mcpilot_api.services.runtime import (
    APPROVAL_TTL_SECONDS,
    RuntimeErrorSafe,
    SessionManager,
    ToolApproval,
)

router = APIRouter(prefix="/api/v1", dependencies=[Depends(require_local_request)])


def _runtime(request: Request) -> SessionManager:
    return request.app.state.runtime


def _error(exc: RuntimeErrorSafe, status_code: int = 400) -> HTTPException:
    return HTTPException(status_code=status_code, detail=str(exc))


@router.get("/security/token")
async def get_request_token(request: Request, response: Response) -> dict[str, str]:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Vary"] = "Origin"
    return {"token": request.app.state.request_token}


@router.get("/demo")
async def get_demo_definition() -> dict[str, Any]:
    return {
        "specVersion": "1.0",
        "id": "mcpilot-demo-tools",
        "name": "MCPilot Demo Tools",
        "description": "Local tools used for the first MCPilot demonstration.",
        "transport": {
            "type": "stdio",
            "command": "python",
            "args": ["-m", "mcpilot_demo_server.server"],
            "workingDirectory": ".",
            "env": {},
        },
        "extensions": {},
    }


@router.get("/runtime")
async def get_runtime_info() -> dict[str, object]:
    return {
        "maxConcurrentSessions": 2,
        "maxResultBytes": 1024 * 1024,
        "approvalExpiresInSeconds": APPROVAL_TTL_SECONDS,
    }


@router.post("/integrations", response_model=RegisteredIntegrationResponse)
async def register_integration(
    definition: IntegrationDefinition,
    request: Request,
) -> RegisteredIntegrationResponse:
    runtime = _runtime(request)
    existing = runtime.integrations.get(definition.id)
    if existing and existing != definition:
        raise HTTPException(status_code=409, detail="An integration with this ID is already registered with different contents.")
    runtime.register(definition)
    environment_keys = list(definition.transport.env) if hasattr(definition.transport, "env") else []
    return RegisteredIntegrationResponse(
        id=definition.id,
        name=definition.name,
        transport=definition.transport.type,
        environment_keys=environment_keys,
    )


@router.post("/sessions/prepare", response_model=ApprovalResponse)
async def prepare_session(payload: ApprovalRequest, request: Request) -> ApprovalResponse:
    try:
        token, approval = _runtime(request).prepare_connection(payload.integration_id)
    except RuntimeErrorSafe as exc:
        raise _error(exc) from exc
    return ApprovalResponse(
        approval_token=token,
        expires_in_seconds=APPROVAL_TTL_SECONDS,
        command=approval.command,
        args=approval.args,
        working_directory=str(approval.cwd),
        environment_keys=approval.environment_keys,
    )


@router.post("/sessions", response_model=SessionResponse)
async def connect_session(payload: ConnectRequest, request: Request) -> SessionResponse:
    runtime = _runtime(request)
    try:
        session = await runtime.connect(payload.approval_token)
    except RuntimeErrorSafe as exc:
        raise _error(exc, status_code=422) from exc
    server_info = session.client.server_info
    return SessionResponse(
        id=session.id,
        integration_id=session.integration_id,
        status="ready",
        server_name=server_info.name if server_info else None,
        server_version=server_info.version if server_info else None,
        protocol_version=session.client.protocol_version,
        tools=list(session.tools.values()),
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: str, request: Request) -> SessionResponse:
    try:
        session = await _runtime(request).get_session(session_id)
    except RuntimeErrorSafe as exc:
        raise _error(exc, status_code=404) from exc
    info = session.client.server_info
    return SessionResponse(
        id=session.id,
        integration_id=session.integration_id,
        status="ready",
        server_name=info.name if info else None,
        server_version=info.version if info else None,
        protocol_version=session.client.protocol_version,
        tools=list(session.tools.values()),
    )


@router.post("/sessions/{session_id}/tools/{tool_name}/approval", response_model=ToolApprovalResponse)
async def prepare_tool_call(
    session_id: str,
    tool_name: str,
    payload: ToolApprovalRequest,
    request: Request,
) -> ToolApprovalResponse:
    runtime = _runtime(request)
    try:
        session = await runtime.get_session(session_id)
    except RuntimeErrorSafe as exc:
        raise _error(exc, status_code=404) from exc
    tool = session.tools.get(tool_name)
    if tool is None:
        raise HTTPException(status_code=404, detail="Tool was not discovered in this session.")
    try:
        validate_json_schema(instance=payload.arguments, schema=tool.input_schema)
    except SchemaValidationError as exc:
        raise HTTPException(status_code=422, detail=f"Tool arguments do not match the discovered schema: {exc.message}") from exc

    token = secrets.token_urlsafe(32)
    runtime.tool_approvals[token] = ToolApproval(
        expires_at=time.monotonic() + APPROVAL_TTL_SECONDS,
        session_id=session_id,
        tool_name=tool_name,
        arguments_hash=hashlib.sha256(
            json.dumps(payload.arguments, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        ).hexdigest(),
    )
    return ToolApprovalResponse(
        approval_token=token,
        expires_in_seconds=APPROVAL_TTL_SECONDS,
        tool_name=tool_name,
        arguments=payload.arguments,
    )


@router.post("/sessions/{session_id}/tools/{tool_name}/call", response_model=ToolResultResponse)
async def call_tool(
    session_id: str,
    tool_name: str,
    payload: ToolCallRequest,
    request: Request,
) -> ToolResultResponse:
    runtime = _runtime(request)
    approval = runtime.tool_approvals.pop(payload.approval_token, None)
    digest = hashlib.sha256(
        json.dumps(payload.arguments, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    ).hexdigest()
    if (
        approval is None
        or approval.expires_at < time.monotonic()
        or approval.session_id != session_id
        or approval.tool_name != tool_name
        or not hmac.compare_digest(approval.arguments_hash, digest)
    ):
        raise HTTPException(status_code=403, detail="Tool approval is missing, expired, already used, or does not match this exact call.")
    try:
        result = await runtime.call_tool(session_id, tool_name, payload.arguments)
    except RuntimeErrorSafe as exc:
        raise _error(exc, status_code=422) from exc
    structured = getattr(result, "structured_content", None)
    return ToolResultResponse(
        tool_name=tool_name,
        is_error=bool(result.is_error),
        structured_content=structured,
        content=result.content,
    )


@router.delete("/sessions/{session_id}")
async def disconnect_session(session_id: str, request: Request) -> dict[str, str]:
    await _runtime(request).disconnect(session_id)
    return {"status": "closed"}
