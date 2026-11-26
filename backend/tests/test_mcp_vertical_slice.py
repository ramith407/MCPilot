from __future__ import annotations

import re
import sys

import pytest
from fastapi.testclient import TestClient

from mcpilot_api.main import app
from mcpilot_api.schemas import IntegrationDefinition
from mcpilot_api.services import runtime as runtime_module

API_ORIGIN = "http://localhost:3000"
API_BASE = "http://127.0.0.1:8000"


@pytest.fixture
def secure_client() -> TestClient:
    with TestClient(app, base_url=API_BASE) as client:
        client.headers.update({"Origin": API_ORIGIN})
        response = client.get("/api/v1/security/token")
        assert response.status_code == 200
        client.headers["X-MCPilot-Request-Token"] = response.json()["token"]
        yield client


def register_demo(client: TestClient) -> dict[str, object]:
    demo = client.get("/api/v1/demo")
    assert demo.status_code == 200
    registered = client.post("/api/v1/integrations", json=demo.json())
    assert registered.status_code == 200, registered.text
    return registered.json()


def connect_demo(client: TestClient) -> dict[str, object]:
    register_demo(client)
    prepared = client.post("/api/v1/sessions/prepare", json={"integration_id": "mcpilot-demo-tools"})
    assert prepared.status_code == 200, prepared.text
    approval = prepared.json()
    assert approval["command"]
    assert approval["args"] == ["-m", "mcpilot_demo_server.server"]
    assert approval["environment_keys"] == []
    connected = client.post("/api/v1/sessions", json={"approval_token": approval["approval_token"]})
    assert connected.status_code == 200, connected.text
    return connected.json()


def test_canonical_schema_requires_stdio_and_rejects_unknown_fields() -> None:
    definition = {
        "specVersion": "1.0",
        "id": "argv-boundaries",
        "name": "Argument boundaries",
        "transport": {
            "type": "stdio",
            "command": "python",
            "args": ["script with spaces.py", "", "--name=one two"],
            "workingDirectory": ".",
            "env": {},
        },
    }
    model = IntegrationDefinition.model_validate(definition)
    assert model.transport.args == ["script with spaces.py", "", "--name=one two"]
    with pytest.raises(ValueError):
        IntegrationDefinition.model_validate({**definition, "unexpected": True})
    with pytest.raises(ValueError):
        IntegrationDefinition.model_validate(
            {**definition, "transport": {**definition["transport"], "command": "python -c print(1)"}}
        )
    with pytest.raises(ValueError):
        IntegrationDefinition.model_validate(
            {**definition, "transport": {**definition["transport"], "workingDirectory": "../outside"}}
        )


def test_streamable_http_definition_validates_but_is_not_connected(secure_client: TestClient) -> None:
    definition = {
        "specVersion": "1.0",
        "id": "future-http-demo",
        "name": "Future HTTP Demo",
        "transport": {"type": "streamable-http", "url": "https://example.test/mcp"},
    }
    response = secure_client.post("/api/v1/integrations", json=definition)
    assert response.status_code == 200
    prepared = secure_client.post("/api/v1/sessions/prepare", json={"integration_id": "future-http-demo"})
    assert prepared.status_code == 400
    assert "Only STDIO" in prepared.json()["detail"]


def test_connection_requires_one_time_approval_and_discovers_live_tools(secure_client: TestClient) -> None:
    register_demo(secure_client)
    prepared = secure_client.post("/api/v1/sessions/prepare", json={"integration_id": "mcpilot-demo-tools"})
    assert prepared.status_code == 200
    assert secure_client.app.state.runtime.sessions == {}
    connected = secure_client.post(
        "/api/v1/sessions",
        json={"approval_token": prepared.json()["approval_token"]},
    )
    assert connected.status_code == 200, connected.text
    session = connected.json()
    assert session["status"] == "ready"
    assert {tool["name"] for tool in session["tools"]} == {
        "add_numbers",
        "echo_message",
        "get_current_time",
    }
    assert session["protocol_version"]
    reused = secure_client.post(
        "/api/v1/sessions",
        json={"approval_token": prepared.json()["approval_token"]},
    )
    assert reused.status_code == 422
    secure_client.delete(f"/api/v1/sessions/{session['id']}")


def test_connection_denial_leaves_no_session_or_child_process(secure_client: TestClient) -> None:
    register_demo(secure_client)
    prepared = secure_client.post("/api/v1/sessions/prepare", json={"integration_id": "mcpilot-demo-tools"})
    assert prepared.status_code == 200
    # Denial is represented by not submitting the one-use launch approval.
    assert secure_client.app.state.runtime.sessions == {}


def test_connection_approval_is_invalidated_when_definition_changes(secure_client: TestClient) -> None:
    register_demo(secure_client)
    prepared = secure_client.post("/api/v1/sessions/prepare", json={"integration_id": "mcpilot-demo-tools"})
    assert prepared.status_code == 200
    runtime = secure_client.app.state.runtime
    original = runtime.integrations["mcpilot-demo-tools"]
    runtime.register(original.model_copy(update={"description": "Changed after the approval preview."}))
    response = secure_client.post("/api/v1/sessions", json={"approval_token": prepared.json()["approval_token"]})
    assert response.status_code == 422
    assert "changed after approval" in response.json()["detail"]
    assert runtime.sessions == {}
    denied = secure_client.post("/api/v1/sessions", json={"approval_token": "denied-by-user"})
    assert denied.status_code == 422
    assert secure_client.app.state.runtime.sessions == {}


def test_approved_add_numbers_returns_actual_structured_stdio_result(secure_client: TestClient) -> None:
    session = connect_demo(secure_client)
    session_id = session["id"]
    approval = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/add_numbers/approval",
        json={"arguments": {"a": 10, "b": 20}},
    )
    assert approval.status_code == 200, approval.text
    call = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/add_numbers/call",
        json={"arguments": {"a": 10, "b": 20}, "approval_token": approval.json()["approval_token"]},
    )
    assert call.status_code == 200, call.text
    assert call.json()["is_error"] is False
    assert call.json()["structured_content"] == {"sum": 30}
    secure_client.delete(f"/api/v1/sessions/{session_id}")


def test_tool_approval_binds_exact_arguments_and_is_one_use(secure_client: TestClient) -> None:
    session = connect_demo(secure_client)
    session_id = session["id"]
    prepared = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/add_numbers/approval",
        json={"arguments": {"a": 10, "b": 20}},
    )
    token = prepared.json()["approval_token"]
    changed = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/add_numbers/call",
        json={"arguments": {"a": 10, "b": 21}, "approval_token": token},
    )
    assert changed.status_code == 403
    retry = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/add_numbers/call",
        json={"arguments": {"a": 10, "b": 20}, "approval_token": token},
    )
    assert retry.status_code == 403
    secure_client.delete(f"/api/v1/sessions/{session_id}")


def test_schema_rejects_invalid_tool_arguments_and_unknown_fields(secure_client: TestClient) -> None:
    session = connect_demo(secure_client)
    session_id = session["id"]
    invalid = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/add_numbers/approval",
        json={"arguments": {"a": "ten", "b": 20}},
    )
    assert invalid.status_code == 422
    extra = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/add_numbers/approval",
        json={"arguments": {"a": 10}},
    )
    assert extra.status_code == 422
    secure_client.delete(f"/api/v1/sessions/{session_id}")


def test_tool_exception_is_returned_as_an_actual_mcp_error_result(secure_client: TestClient) -> None:
    session = connect_demo(secure_client)
    session_id = session["id"]
    approved = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/add_numbers/approval",
        json={"arguments": {"a": 1e308, "b": 1e308}},
    )
    assert approved.status_code == 200
    result = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/add_numbers/call",
        json={
            "arguments": approved.json()["arguments"],
            "approval_token": approved.json()["approval_token"],
        },
    )
    assert result.status_code == 200
    assert result.json()["is_error"] is True
    assert "supported numeric range" in result.json()["content"][0]["text"]
    secure_client.delete(f"/api/v1/sessions/{session_id}")


def test_echo_and_utc_clock_are_live_server_results(secure_client: TestClient) -> None:
    session = connect_demo(secure_client)
    session_id = session["id"]

    echo_approval = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/echo_message/approval",
        json={"arguments": {"message": "spaced message — exact"}},
    ).json()
    echo = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/echo_message/call",
        json={"arguments": echo_approval["arguments"], "approval_token": echo_approval["approval_token"]},
    )
    assert echo.status_code == 200, echo.text
    assert echo.json()["structured_content"] == {"result": "spaced message — exact"}

    time_approval = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/get_current_time/approval",
        json={"arguments": {}},
    ).json()
    current_time = secure_client.post(
        f"/api/v1/sessions/{session_id}/tools/get_current_time/call",
        json={"arguments": {}, "approval_token": time_approval["approval_token"]},
    )
    assert current_time.status_code == 200, current_time.text
    time_value = current_time.json()["structured_content"]["result"]
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", time_value)
    secure_client.delete(f"/api/v1/sessions/{session_id}")


def test_local_api_rejects_untrusted_origins_and_missing_state_token() -> None:
    with TestClient(app, base_url=API_BASE) as client:
        bad_origin = client.get("/api/v1/security/token", headers={"Origin": "http://attacker.example"})
        assert bad_origin.status_code == 403
        missing_token = client.post(
            "/api/v1/integrations",
            headers={"Origin": API_ORIGIN},
            json={"not": "relevant without approval"},
        )
        assert missing_token.status_code == 403


def test_validation_errors_do_not_echo_submitted_secret_values(secure_client: TestClient) -> None:
    value = "not-for-an-api-error-response"
    invalid = secure_client.post(
        "/api/v1/integrations",
        json={
            "specVersion": "1.0",
            "id": "invalid-with-secret",
            "name": "Invalid definition",
            "transport": {"type": "stdio", "command": "python", "args": [], "env": {}},
            "unexpected": value,
        },
    )
    assert invalid.status_code == 422
    assert value not in invalid.text


def test_disconnect_closes_real_session(secure_client: TestClient) -> None:
    session = connect_demo(secure_client)
    session_id = session["id"]
    closed = secure_client.delete(f"/api/v1/sessions/{session_id}")
    assert closed.status_code == 200
    assert closed.json() == {"status": "closed"}
    status = secure_client.get(f"/api/v1/sessions/{session_id}")
    assert status.status_code == 404


def test_server_process_exiting_before_initialization_is_reported_and_cleaned(
    secure_client: TestClient,
) -> None:
    definition = {
        "specVersion": "1.0",
        "id": "exits-during-startup",
        "name": "Exits during startup",
        "transport": {
            "type": "stdio",
            "command": sys.executable,
            "args": ["-c", "import sys; sys.exit(0)"],
            "workingDirectory": ".",
            "env": {},
        },
    }
    registered = secure_client.post("/api/v1/integrations", json=definition)
    assert registered.status_code == 200
    prepared = secure_client.post("/api/v1/sessions/prepare", json={"integration_id": definition["id"]})
    assert prepared.status_code == 200
    response = secure_client.post("/api/v1/sessions", json={"approval_token": prepared.json()["approval_token"]})
    assert response.status_code == 422
    assert "failed" in response.json()["detail"].lower() or "closed" in response.json()["detail"].lower()
    assert secure_client.app.state.runtime.sessions == {}


def test_connection_timeout_cancels_and_cleans_up_child_process(
    secure_client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(runtime_module, "CONNECT_TIMEOUT_SECONDS", 0.2)
    definition = {
        "specVersion": "1.0",
        "id": "hangs-during-startup",
        "name": "Hangs during startup",
        "transport": {
            "type": "stdio",
            "command": sys.executable,
            "args": ["-c", "import time; time.sleep(60)"],
            "workingDirectory": ".",
            "env": {},
        },
    }
    registered = secure_client.post("/api/v1/integrations", json=definition)
    assert registered.status_code == 200
    prepared = secure_client.post("/api/v1/sessions/prepare", json={"integration_id": definition["id"]})
    assert prepared.status_code == 200
    response = secure_client.post("/api/v1/sessions", json={"approval_token": prepared.json()["approval_token"]})
    assert response.status_code == 422
    assert "0.2 seconds" in response.json()["detail"]
    assert secure_client.app.state.runtime.sessions == {}
