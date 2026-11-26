# MCPilot First Vertical Slice

## Status and goal

**Implemented on `feature/basic-backend` for the bundled demo only.** The Playground now registers a canonical STDIO integration, displays and verifies launch approval, starts the real demo server with the official MCP Python SDK, discovers live tools, requires a separate exact-argument approval for calls, displays actual results, and disconnects. The registry/session state is in memory. Streamable HTTP, external servers, client config generation, database persistence, and general diagnostics remain unimplemented. Builder and Compiler remain prototype flows; Doctor remains mock data. See [architecture](architecture.md) for broader status.

The end-to-end demonstration registers one canonical local integration, launches one controlled STDIO MCP server with the official Python SDK, performs SDK-managed initialization/negotiation, discovers its three real tools, invokes one after explicit approval, shows the returned result, and closes the session. It does not include Streamable HTTP, external MCP servers, client config generation, a database, or broad server discovery.

## Demo MCP server contract

The demo server exposes exactly these tools:

| Tool | Inputs | Successful result |
|---|---|---|
| `add_numbers` | Required JSON numbers `a` and `b`. | Structured result `{ "sum": 5 }` for `2` and `3`. |
| `echo_message` | Required string `message`. | Text result equal to the supplied message. |
| `get_current_time` | No required arguments. | Current UTC time as an ISO 8601/RFC 3339 string ending in `Z`. |

The demo server performs no filesystem, network, or credential access. `add_numbers` should reject non-numeric inputs through the SDK/Pydantic-generated tool schema and explicitly reject non-finite values; `echo_message` returns the actual submitted text; `get_current_time` reads the clock at invocation time. The Playground must not substitute frontend fixtures for any result.

## Proposed file boundaries

These are likely implementation locations, not current files or a required final layout:

```text
backend/
  src/
    mcpilot_api/
      api/routes/integrations.py
      api/routes/sessions.py
      schemas/integration.py
      schemas/session.py
      services/integrations/registry.py
      services/sessions/manager.py
      security/approval.py
    mcpilot_demo_server/
      __init__.py
      server.py
  tests/
    test_integration_schema.py
    test_demo_server.py
    test_stdio_session.py
    test_session_api.py
src/
  app/playground/page.tsx
  features/playground/
  lib/api/
```

The backend pins the official MCP Python SDK at `mcp==2.3.0`. The demo server is packaged in the same Python project; the portable `python` alias resolves to the active backend interpreter and displays its resolved path for approval. Do not commit an absolute venv path. Validate this resolution on each OS before claiming platform support.

## Ordered demonstration workflow

### 1. Register the integration

1. Start FastAPI bound to `127.0.0.1` and load the new Playground page.
2. Register the credential-free canonical STDIO definition from [the canonical spec](canonical-integration-specification.md). It uses `command: "python"`, `args: ["-m", "mcpilot_demo_server"]`, and a workspace-relative working directory. Command and argv remain separate fields.
3. Backend validates and stores the definition in an in-memory registry. It returns a registered ID and validation notices. Nothing starts yet; a backend restart clears the definition.
4. Reject invalid definitions with a field path and clear message. Never report “registered” if validation failed.

### 2. Approve and launch over STDIO

1. User selects **Connect**. Backend resolves `python` to one concrete executable in the project venv, checks the selected working directory remains inside the approved workspace, prepares the minimal child environment, and returns a connection-approval summary.
2. The UI displays the exact resolved executable, each argv element, cwd/workspace, and environment variable names. It does not display resolved secret values. The user approves or denies.
3. On approval, the session manager creates the official SDK `StdioServerParameters` and enters an SDK `Client` async context. Do not invoke a shell and do not manually frame JSON-RPC.
4. SDK transport starts the child and connects its stdin/stdout protocol streams. Ordinary child logs belong on stderr; stdout must contain MCP messages only.
5. SDK performs the protocol-version-appropriate initialize/negotiation. Mark the session `ready` only after that succeeds and store protocol/server metadata when present. A subprocess starting is not proof that MCP initialization succeeded.

### 3. Discover actual tools

1. Request `list_tools()` through the connected SDK client and follow any pagination cursors.
2. Return the discovered tool names, descriptions, and input JSON Schemas from the live server. Do not use the demo tool list as frontend mock data.
3. UI shows `add_numbers`, `echo_message`, and `get_current_time` only if the server returned them. If a tool is absent or discovery fails, display that actual result instead of silently inserting it.
4. Treat server-provided descriptions and schemas as untrusted text/data. Render safely; validate schemas/size before sending them to the browser.

### 4. Invoke a selected tool

1. User selects one discovered tool. The UI renders the discovered input schema and shows the entered JSON arguments.
2. Backend validates the arguments, then creates a short-lived one-use approval challenge bound to the session, tool name, exact arguments, and current discovered definition. A change to any bound value invalidates it.
3. UI presents a distinct confirmation with the server/integration, tool, and exact arguments. A user denial sends no call.
4. Only after approval does the backend call the SDK's `call_tool(name, arguments)`.
5. Backend returns typed content blocks, optional structured content, and `is_error` status. UI renders text and JSON as inert content; it does not execute returned markup or commands.

### 5. Close the session

The user can select **Disconnect** at any time. Disconnect, timeout, failed connection, process exit, and backend shutdown all converge on an idempotent cleanup path. Close the SDK context, await child shutdown, then perform bounded terminate/kill cleanup if required. The session state changes to `closed` only after cleanup is confirmed; otherwise display `cleanup_failed` with safe remediation.

## Expected successful Playground output

After registration, connection, and discovery, the screen should show a live session status and the three tool definitions returned by the server. Example invocation:

```text
Tool: add_numbers
Arguments: {"a": 2, "b": 3}
Result: {"sum": 5}
Source: live MCP server response
```

`echo_message` with `{"message":"Hello from MCPilot"}` returns `Hello from MCPilot`. `get_current_time` returns a newly generated UTC time string for that invocation; tests verify its parseable UTC format and reasonable call-time window, not one hardcoded timestamp. UI labels the result as server output and indicates tool errors separately from session failures.

## Failure scenarios and UI behavior

| Failure | Backend behavior | Playground behavior |
|---|---|---|
| Invalid canonical definition | Reject registration with stable code and JSON path. | Show the invalid field and correction; show no registered/connected status. |
| Missing Python runtime or demo module | Do not launch, or report child startup failure with a safe diagnostic. | Actionable message naming the missing runtime/module; offer setup guidance, never a fake successful connection. |
| Executable/cwd changed after approval | Invalidate approval and do not launch. | Ask for a new approval showing the new resolved details. |
| User denies connection approval | No child process or HTTP request is created. | Show “Connection not started” as a neutral state. |
| Launch timeout, immediate exit, or malformed stdout | Mark connection failed and run SDK cleanup. Child stderr is discarded to the platform null device. | Show a safe stage-specific error; stdout is never displayed as ordinary logs. |
| MCP protocol/version initialization fails | Close the SDK context and process; retain a structured failure code. | Show protocol negotiation failed, not “connected.” |
| `tools/list` fails or returns a different list | Keep no fabricated tools; preserve/close the session based on the SDK error. | Show actual discovered tools or a discovery error. An empty list is not replaced with demo fixtures. |
| Invalid tool arguments | Reject before call when schema validation can establish the problem; do not consume approval for changed arguments. | Show validation details and let the user correct/review again. |
| User denies tool call | Do not call the SDK. | Record/display “Call cancelled by user”; session remains connected. |
| Tool result has `is_error=true` | Return a tool-level error result without claiming transport failure. | Show a tool error while leaving session status intact when possible. |
| Tool call timeout/cancel/process exit | Cancel within deadline, transition state, and clean up if needed. | Show timed out/cancelled/disconnected distinctly; never display partial bytes as a full success. |
| Result exceeds the cap | Stop accepting the oversized result and close/fail the call safely. | Show “result too large” with size-limit guidance, not a truncated success. |
| Cleanup cannot confirm process exit | Escalate through bounded terminate/force-kill policy and report cleanup failure. | Show cleanup status; disable reconnect if a local process may still be alive until reconciled. |

## Acceptance criteria

The planned completion gates are listed below. On this branch, automated backend and build gates pass on Windows 11/Python 3.13.9, but no clean-machine Linux/macOS verification or manual browser smoke test has been recorded. Do not infer cross-platform support.

The slice is fully verified only when all of these are true:

1. A clean developer environment can install the pinned SDK and launch the bundled demo from the documented venv on Windows, Linux, and macOS.
2. Registration validates the canonical definition and does not start a process.
3. Connection is impossible without explicit backend-verified approval; the displayed executable/argv/workspace match what was launched.
4. The official SDK opens a real STDIO connection and completes its supported protocol initialization/negotiation. The session's actual negotiated metadata is reported.
5. Tool discovery is obtained from the server. The three names and their schemas appear, with pagination handled.
6. Each invocation requires approval of exact arguments and returns the demo server's real result through the SDK.
7. Denial, malformed input, missing executable, initialization failure, tool-level error, timeout/cancel, oversized result, process exit, and cleanup failure have distinct safe UI states.
8. No config compiler preview, Doctor mock, or static integration list is described as connection evidence.
9. No secret value is present in test fixtures, UI/API responses, logs, or generated artifacts.
10. Automated backend tests cover models, all three tool contracts, session state transitions, approval checks, subprocess cleanup, and error mapping. A manual browser smoke test confirms the Playground-to-API flow without fixtures. No cross-platform claim is made until the clean-machine OS gates pass.

## Explicitly out of this slice

Streamable HTTP connection UI, OAuth, remote endpoint discovery, config file writing, client adapters, SQLite persistence, multiple workers, arbitrary command entry without policy, general-purpose process sandboxing, and tool approval bypasses are not part of the demo. The canonical model and runtime architecture describe Streamable HTTP as a future separate transport path; this first slice exercises STDIO only.
