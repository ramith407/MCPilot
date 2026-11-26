from fastapi import APIRouter

from mcpilot_api.schemas import HealthResponse, TestRequest, TestResponse

router = APIRouter(prefix="/api")


@router.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@router.post("/test", response_model=TestResponse)
def test_connection(payload: TestRequest) -> TestResponse:
    return TestResponse(
        message=payload.message,
        response=f"Backend received: {payload.message}",
    )
