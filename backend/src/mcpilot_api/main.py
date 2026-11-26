from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from mcpilot_api.api.mcp_routes import router as mcp_router
from mcpilot_api.api.routes import router
from mcpilot_api.config import CORS_ORIGINS
from mcpilot_api.security import issue_request_token
from mcpilot_api.services.runtime import SessionManager


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.runtime = SessionManager()
    app.state.runtime.start_reaper()
    app.state.request_token = issue_request_token()
    yield
    await app.state.runtime.close_all()


app = FastAPI(title="MCPilot Local API", version="0.2.0", lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def safe_request_validation_error(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    # Pydantic's default response may include each invalid input value. Keep only
    # locations and messages so malformed secret-bearing definitions aren't echoed.
    details = [
        {
            "type": error.get("type", "value_error"),
            "loc": error.get("loc", ()),
            "msg": error.get("msg", "Invalid request."),
        }
        for error in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": details})

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type", "X-MCPilot-Request-Token"],
)

app.include_router(router)
app.include_router(mcp_router)
