from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import os
import secrets
import shutil
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from mcp import Client, StdioServerParameters
from mcp.client.stdio import get_default_environment, stdio_client

from mcpilot_api.schemas import (
    EnvironmentSecret,
    IntegrationDefinition,
    LiteralValue,
    StdioTransport,
    ToolSummary,
)

APPROVAL_TTL_SECONDS = 120
MAX_SESSIONS = 2
MAX_RESULT_BYTES = 1024 * 1024
CONNECT_TIMEOUT_SECONDS = 30
TOOL_TIMEOUT_SECONDS = 30
MAX_SESSION_SECONDS = 30 * 60
MAX_IDLE_SECONDS = 10 * 60
WORKSPACE_ROOT = Path(__file__).resolve().parents[4]


class RuntimeErrorSafe(Exception):
    """An error safe to return to the local UI."""


@dataclass
class Approval:
    expires_at: float
    integration_id: str
    definition_hash: str
    command: str
    args: list[str]
    cwd: Path
    environment: dict[str, str]
    secret_keys: dict[str, str]
    environment_keys: list[str]


@dataclass
class ToolApproval:
    expires_at: float
    session_id: str
    tool_name: str
    arguments_hash: str


@dataclass
class _RedactedResult:
    structured_content: Any
    content: list[dict[str, Any]]
    is_error: bool


@dataclass
class _SessionCommand:
    action: str
    future: asyncio.Future[Any]
    tool_name: str | None = None
    arguments: dict[str, object] | None = None
    cancelled: asyncio.Event = field(default_factory=asyncio.Event)


@dataclass
class ManagedSession:
    id: str
    integration_id: str
    client: Client[Any] | None
    tools: dict[str, ToolSummary]
    created_at: float = field(default_factory=time.monotonic)
    last_active_at: float = field(default_factory=time.monotonic)
    commands: asyncio.Queue[_SessionCommand] = field(default_factory=asyncio.Queue)
    worker: asyncio.Task[None] | None = None
    closing_future: asyncio.Future[Any] | None = None
    closed: bool = False


def _canonical_hash(value: Any) -> str:
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


class SessionManager:
    def __init__(self) -> None:
        self.integrations: dict[str, IntegrationDefinition] = {}
        self.approvals: dict[str, Approval] = {}
        self.tool_approvals: dict[str, ToolApproval] = {}
        self.sessions: dict[str, ManagedSession] = {}
        self._secret_values: set[str] = set()
        self._session_slots = asyncio.Semaphore(MAX_SESSIONS)
        self._guard = asyncio.Lock()
        self._reaper: asyncio.Task[None] | None = None

    def start_reaper(self) -> None:
        self._reaper = asyncio.create_task(self._reap_expired_sessions())

    async def _reap_expired_sessions(self) -> None:
        while True:
            await asyncio.sleep(30)
            now = time.monotonic()
            expired = [
                session.id
                for session in self.sessions.values()
                if now - session.created_at > MAX_SESSION_SECONDS
                or now - session.last_active_at > MAX_IDLE_SECONDS
            ]
            for session_id in expired:
                try:
                    await self.disconnect(session_id)
                except Exception:
                    continue

    def register(self, definition: IntegrationDefinition) -> None:
        self.integrations[definition.id] = definition

    def get_integration(self, integration_id: str) -> IntegrationDefinition:
        definition = self.integrations.get(integration_id)
        if definition is None:
            raise RuntimeErrorSafe("Integration was not found. Register it again.")
        return definition

    def prepare_connection(self, integration_id: str) -> tuple[str, Approval]:
        definition = self.get_integration(integration_id)
        transport = definition.transport
        if not isinstance(transport, StdioTransport):
            raise RuntimeErrorSafe("Only STDIO integrations are supported in this demo.")

        resolved_command = self._resolve_command(transport.command)
        cwd = self._resolve_working_directory(transport.working_directory)

        environment = get_default_environment()
        environment.update({"PYTHONUTF8": "1", "PYTHONIOENCODING": "utf-8"})
        secret_keys: dict[str, str] = {}
        for name, value_source in transport.env.items():
            if isinstance(value_source, LiteralValue):
                environment[name] = value_source.value
            elif isinstance(value_source, EnvironmentSecret):
                secret_keys[name] = value_source.key

        token = secrets.token_urlsafe(32)
        approval = Approval(
            expires_at=time.monotonic() + APPROVAL_TTL_SECONDS,
            integration_id=integration_id,
            definition_hash=_canonical_hash(definition.model_dump(mode="json", by_alias=True)),
            command=resolved_command,
            args=list(transport.args),
            cwd=cwd,
            environment=environment,
            secret_keys=secret_keys,
            environment_keys=sorted(transport.env),
        )
        self.approvals[token] = approval
        return token, approval

    @staticmethod
    def _resolve_command(command_name: str) -> str:
        command = sys.executable if command_name in {"python", "python3"} else shutil.which(command_name)
        if not command:
            raise RuntimeErrorSafe(
                f"Executable '{command_name}' was not found. Install it or select an available executable."
            )
        return str(Path(command).resolve())

    @staticmethod
    def _resolve_working_directory(working_directory: str) -> Path:
        relative_cwd = Path(*working_directory.split("/"))
        cwd = (WORKSPACE_ROOT / relative_cwd).resolve()
        if not cwd.is_dir() or not cwd.is_relative_to(WORKSPACE_ROOT):
            raise RuntimeErrorSafe("Working directory must resolve to an existing directory inside the MCPilot workspace.")
        return cwd

    async def connect(self, token: str) -> ManagedSession:
        approval = self.approvals.pop(token, None)
        if approval is None or approval.expires_at < time.monotonic():
            raise RuntimeErrorSafe("Connection approval is missing, expired, or already used. Review the launch details again.")
        definition = self.get_integration(approval.integration_id)
        if not hmac.compare_digest(
            approval.definition_hash,
            _canonical_hash(definition.model_dump(mode="json", by_alias=True)),
        ):
            raise RuntimeErrorSafe("Integration changed after approval. Review the launch details again.")
        transport = definition.transport
        if not isinstance(transport, StdioTransport):
            raise RuntimeErrorSafe("Only STDIO integrations are supported in this demo.")
        if not hmac.compare_digest(self._resolve_command(transport.command), approval.command):
            raise RuntimeErrorSafe("Executable changed after approval. Review the launch details again.")
        if self._resolve_working_directory(transport.working_directory) != approval.cwd:
            raise RuntimeErrorSafe("Working directory changed after approval. Review the launch details again.")

        environment = dict(approval.environment)
        for variable, secret_key in approval.secret_keys.items():
            secret_value = os.environ.get(secret_key)
            if secret_value is None:
                raise RuntimeErrorSafe(f"Required environment secret '{secret_key}' is not set.")
            environment[variable] = secret_value
            if secret_value:
                self._secret_values.add(secret_value)

        try:
            await asyncio.wait_for(self._session_slots.acquire(), timeout=1)
        except TimeoutError as exc:
            raise RuntimeErrorSafe("The two local MCP session slots are in use. Disconnect one and retry.") from exc

        try:
            await asyncio.wait_for(self._session_slots.acquire(), timeout=1)
        except TimeoutError as exc:
            raise RuntimeErrorSafe("The two local MCP session slots are in use. Disconnect one and retry.") from exc

        params = StdioServerParameters(
            command=approval.command,
            args=approval.args,
            env=environment,
            cwd=approval.cwd,
        )
        session = ManagedSession(
            id=str(uuid4()),
            integration_id=approval.integration_id,
            client=None,
            tools={},
        )
        ready: asyncio.Future[ManagedSession] = asyncio.get_running_loop().create_future()
        async with self._guard:
            self.sessions[session.id] = session
        session.worker = asyncio.create_task(self._run_session(session, params, ready))
        try:
            return await asyncio.wait_for(asyncio.shield(ready), timeout=CONNECT_TIMEOUT_SECONDS)
        except TimeoutError as exc:
            session.worker.cancel()
            await asyncio.gather(session.worker, return_exceptions=True)
            raise RuntimeErrorSafe(
                f"The MCP server did not initialize and list tools within {CONNECT_TIMEOUT_SECONDS} seconds."
            ) from exc
        except asyncio.CancelledError:
            session.worker.cancel()
            await asyncio.gather(session.worker, return_exceptions=True)
            raise
        except RuntimeErrorSafe:
            raise
        except Exception as exc:
            raise RuntimeErrorSafe(f"MCP connection failed: {self._redact(f'{type(exc).__name__}: {exc}')}") from exc

    async def _run_session(
        self,
        session: ManagedSession,
        params: StdioServerParameters,
        ready: asyncio.Future[ManagedSession],
    ) -> None:
        close_future: asyncio.Future[Any] | None = None
        try:
            with open(os.devnull, "w", encoding="utf-8") as stderr_handle:
                async with Client(stdio_client(params, errlog=stderr_handle)) as client:
                    session.client = client
                    tools: dict[str, ToolSummary] = {}
                    cursor: str | None = None
                    try:
                        server_info = client.server_info
                        if server_info is not None and self._contains_secret(
                            server_info.model_dump(mode="json")
                        ):
                            raise RuntimeErrorSafe("MCP server metadata contained a configured secret; connection was refused.")

                        async def discover() -> None:
                            nonlocal cursor
                            while True:
                                response = await client.list_tools(cursor=cursor)
                                for tool in response.tools:
                                    schema = tool.input_schema
                                    metadata = {
                                        "name": tool.name,
                                        "description": tool.description,
                                        "input_schema": schema,
                                    }
                                    if self._contains_secret(metadata):
                                        raise RuntimeErrorSafe("MCP tool metadata contained a configured secret; connection was refused.")
                                    if len(json.dumps(schema, ensure_ascii=False).encode("utf-8")) > MAX_RESULT_BYTES:
                                        raise RuntimeErrorSafe("MCP server returned a tool schema larger than the 1 MiB limit.")
                                    tools[tool.name] = ToolSummary(
                                        name=tool.name,
                                        description=tool.description,
                                        input_schema=schema,
                                    )
                                cursor = response.next_cursor
                                if not cursor:
                                    return

                        await asyncio.wait_for(discover(), timeout=CONNECT_TIMEOUT_SECONDS)
                        session.tools = tools
                        if not ready.done():
                            ready.set_result(session)
                    except Exception as exc:
                        if not ready.done():
                            if isinstance(exc, RuntimeErrorSafe):
                                ready.set_exception(exc)
                            elif isinstance(exc, TimeoutError):
                                ready.set_exception(RuntimeErrorSafe(
                                    f"MCP initialization or tool discovery exceeded the {CONNECT_TIMEOUT_SECONDS} second timeout."
                                ))
                            else:
                                ready.set_exception(RuntimeErrorSafe(f"MCP initialization failed: {self._redact(f'{type(exc).__name__}: {exc}') }"))
                        return

                    while True:
                        command = await session.commands.get()
                        session.last_active_at = time.monotonic()
                        if command.action == "close":
                            close_future = command.future
                            break
                        try:
                            if command.action != "call" or command.tool_name is None or command.arguments is None:
                                raise RuntimeErrorSafe("Invalid session operation.")
                            call_task = asyncio.create_task(
                                client.call_tool(command.tool_name, command.arguments)
                            )
                            cancel_task = asyncio.create_task(command.cancelled.wait())
                            done, _ = await asyncio.wait(
                                {call_task, cancel_task},
                                timeout=TOOL_TIMEOUT_SECONDS,
                                return_when=asyncio.FIRST_COMPLETED,
                            )
                            if cancel_task in done and command.cancelled.is_set():
                                call_task.cancel()
                                await asyncio.gather(call_task, return_exceptions=True)
                                raise RuntimeErrorSafe("Tool call was cancelled by the local client.")
                            cancel_task.cancel()
                            await asyncio.gather(cancel_task, return_exceptions=True)
                            if call_task not in done:
                                call_task.cancel()
                                await asyncio.gather(call_task, return_exceptions=True)
                                raise TimeoutError
                            result = call_task.result()
                            if not command.future.done():
                                command.future.set_result(result)
                        except TimeoutError:
                            if not command.future.done():
                                command.future.set_exception(RuntimeErrorSafe("Tool call exceeded the 30 second timeout."))
                        except Exception as exc:
                            if not command.future.done():
                                command.future.set_exception(RuntimeErrorSafe(f"Tool call failed: {self._redact(f'{type(exc).__name__}: {exc}') }"))
        except asyncio.CancelledError:
            if not ready.done():
                ready.cancel()
            raise
        except Exception as exc:
            if not ready.done():
                ready.set_exception(RuntimeErrorSafe(f"MCP connection failed: {self._redact(f'{type(exc).__name__}: {exc}') }"))
        finally:
            session.closed = True
            async with self._guard:
                self.sessions.pop(session.id, None)
            self._session_slots.release()
            if close_future is not None and not close_future.done():
                close_future.set_result(None)
            while not session.commands.empty():
                pending = session.commands.get_nowait()
                if not pending.future.done():
                    pending.future.set_exception(RuntimeErrorSafe("MCP session closed before completing the request."))

    async def get_session(self, session_id: str) -> ManagedSession:
        session = self.sessions.get(session_id)
        if session is None or session.closed:
            raise RuntimeErrorSafe("MCP session is not connected.")
        now = time.monotonic()
        if now - session.created_at > MAX_SESSION_SECONDS or now - session.last_active_at > MAX_IDLE_SECONDS:
            await self.disconnect(session_id)
            raise RuntimeErrorSafe("MCP session expired and was disconnected. Reconnect to continue.")
        session.last_active_at = now
        return session

    async def call_tool(self, session_id: str, tool_name: str, arguments: dict[str, object]) -> Any:
        session = await self.get_session(session_id)
        tool = session.tools.get(tool_name)
        if tool is None:
            raise RuntimeErrorSafe("The requested tool was not discovered in this session.")
        if session.closed or session.worker is None or session.client is None:
            raise RuntimeErrorSafe("MCP session is closed.")
        future = asyncio.get_running_loop().create_future()
        command = _SessionCommand("call", future, tool_name, arguments)
        await session.commands.put(command)
        try:
            result = await asyncio.wait_for(future, timeout=TOOL_TIMEOUT_SECONDS + 2)
        except TimeoutError as exc:
            command.cancelled.set()
            raise RuntimeErrorSafe("Tool call exceeded the 30 second timeout.") from exc
        except asyncio.CancelledError:
            command.cancelled.set()
            raise
        except RuntimeErrorSafe:
            raise
        except Exception as exc:
            raise RuntimeErrorSafe(f"Tool call failed: {self._redact(f'{type(exc).__name__}: {exc}')}") from exc
        payload = {
            "structured_content": getattr(result, "structured_content", None),
            "content": [item.model_dump(mode="json") for item in result.content],
        }
        if len(json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")) > MAX_RESULT_BYTES:
            raise RuntimeErrorSafe("The tool returned more than the 1 MiB response limit.")
        return _RedactedResult(
            structured_content=self._redact_json(payload["structured_content"]),
            content=self._redact_json(payload["content"]),
            is_error=bool(result.is_error),
        )

    def _redact(self, value: str) -> str:
        for secret in self._secret_values:
            value = value.replace(secret, "[REDACTED]")
        return value

    def _contains_secret(self, value: Any) -> bool:
        serialized = json.dumps(value, ensure_ascii=False, default=str)
        return any(secret in serialized for secret in self._secret_values)

    def _redact_json(self, value: Any) -> Any:
        serialized = json.dumps(value, ensure_ascii=False, default=str)
        for secret in self._secret_values:
            serialized = serialized.replace(secret, "[REDACTED]")
        return json.loads(serialized)

    async def disconnect(self, session_id: str) -> None:
        session = self.sessions.get(session_id)
        if session is None or session.closed:
            return
        if session.worker is None or session.worker.done():
            return
        if session.closing_future is None:
            session.closing_future = asyncio.get_running_loop().create_future()
            await session.commands.put(_SessionCommand("close", session.closing_future))
        await session.closing_future

    async def close_all(self) -> None:
        if self._reaper is not None:
            self._reaper.cancel()
            try:
                await self._reaper
            except asyncio.CancelledError:
                pass
        for session_id in list(self.sessions):
            try:
                await self.disconnect(session_id)
            except Exception:
                # The SDK's stdio close performs bounded process cleanup; continue closing peers.
                continue
