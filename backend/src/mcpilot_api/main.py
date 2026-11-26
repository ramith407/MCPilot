from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from mcpilot_api.api.routes import router
from mcpilot_api.config import CORS_ORIGINS

app = FastAPI(title="MCPilot Local API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

app.include_router(router)
