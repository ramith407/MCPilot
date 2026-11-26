import pytest
from fastapi.testclient import TestClient

from mcpilot_api.main import app


@pytest.fixture
def client() -> TestClient:
    with TestClient(app) as test_client:
        yield test_client


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_test_endpoint_echoes_valid_message(client: TestClient) -> None:
    response = client.post("/api/test", json={"message": "hello"})

    assert response.status_code == 200
    assert response.json() == {
        "message": "hello",
        "response": "Backend received: hello",
    }


@pytest.mark.parametrize(
    "payload",
    [
        {"message": ""},
        {"message": "  \t\n"},
        {"message": "x" * 501},
        {"message": "hello", "unexpected": True},
    ],
    ids=["empty", "whitespace-only", "over-500-characters", "extra-field"],
)
def test_test_endpoint_rejects_invalid_payloads(
    client: TestClient,
    payload: dict[str, object],
) -> None:
    response = client.post("/api/test", json=payload)

    assert response.status_code == 422
