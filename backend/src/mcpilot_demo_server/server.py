from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import TypedDict

from mcp.server import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

logging.basicConfig(level=logging.INFO, stream=__import__("sys").stderr)
mcp = MCPServer("MCPilot Demo Tools", version="0.1.0")


class SumResult(TypedDict):
    sum: int | float


@mcp.tool()
def add_numbers(a: float, b: float) -> SumResult:
    """Add two numbers and return their sum as structured data."""
    if not math.isfinite(a) or not math.isfinite(b):
        raise ToolError("Inputs must be finite numbers.")
    result = a + b
    if not math.isfinite(result):
        raise ToolError("The sum is outside the supported numeric range.")
    return {"sum": int(result) if result.is_integer() else result}


@mcp.tool()
def echo_message(message: str) -> str:
    """Return the supplied message exactly as received."""
    return message


@mcp.tool()
def get_current_time() -> str:
    """Return the current UTC time in ISO 8601 format."""
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


if __name__ == "__main__":
    mcp.run()
