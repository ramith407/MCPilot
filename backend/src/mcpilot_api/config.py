import os

from dotenv import load_dotenv

load_dotenv()


def _read_cors_origins() -> list[str]:
    raw_origins = os.getenv(
        "MCPILOT_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    )
    origins = [origin.strip().rstrip("/") for origin in raw_origins.split(",")]
    return [origin for origin in origins if origin]


CORS_ORIGINS = _read_cors_origins()
