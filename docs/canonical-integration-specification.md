# MCPilot Canonical Integration Specification

## Status and scope

**Design only.** No canonical integration API, MCP connection, or MCP SDK dependency is implemented in the current repository. The current backend exposes only `GET /api/health` and `POST /api/test`. This document defines a proposed portable JSON contract for one MCP server definition. It is not a client configuration format and it is not an approval to execute that definition.

The existing [integration specification](integration-specification.md) remains useful background. This file is the normative proposed model for the first implementation; update both documents if the design changes before implementation.

## Design principles

- JSON is the canonical storage and API representation. YAML, if retained in the UI, must be parsed by a YAML library and converted to this model; never build YAML with string concatenation.
- MCPilot's `specVersion`, an MCP protocol version, a server version, and a client-adapter version are separate version domains.
- Transport is a tagged union. A STDIO server has an executable and argv; Streamable HTTP has an endpoint URL. A definition cannot mix these transport fields.
- Arguments are ordered arrays of strings. A command is one executable identifier/path, never a shell command line.
- Portable definitions contain no developer home paths, resolved executable paths, credentials, or client config paths. Machine-specific approvals and runtime resolutions belong in local session state.
- Unknown fields are rejected by default. Extensions use a namespaced `extensions` object and have no effect unless a later implementation explicitly recognizes them.

## Proposed Pydantic-compatible shape

Use strict Pydantic models with `extra="forbid"`, validation of default values, and a discriminated union for the transport and value-source variants. Python attributes may use snake_case with explicit camel-case JSON aliases (`spec_version` ↔ `specVersion`, `working_directory` ↔ `workingDirectory`). Keep JSON Schema generated from, or parity-tested against, these models.

Conceptually:

```text
IntegrationDefinition
  specVersion: Literal["1.0"]
  id: portable identifier
  name: display name
  description?: string
  metadata?: IntegrationMetadata
  transport: StdioTransport | StreamableHttpTransport  # discriminator: type
  extensions?: map[string, JSON value]

StdioTransport
  type: Literal["stdio"]
  command: string
  args: list[string] = []
  workingDirectory?: workspace-relative path
  env: map[environment name, ValueSource] = {}

StreamableHttpTransport
  type: Literal["streamable-http"]
  url: HTTP(S) URL
  headers: map[header name, ValueSource] = {}
  authentication: NoAuthentication | BearerAuthentication = {type: "none"}

ValueSource
  LiteralValue {kind: "literal", value: string}
  | SecretReference {kind: "secretRef", provider: "environment", key: string}
```

The v1 authentication union deliberately supports only `none` and a bearer token referenced from the local environment. OAuth, client certificates, credential-store providers, and custom authentication flows require a later explicit design; v1 validators must reject them rather than silently drop them.

## Field reference

| Field | Required | Rules and meaning |
|---|---:|---|
| `specVersion` | Yes | Literal `"1.0"` for this version. Reject unsupported major versions. |
| `id` | Yes | Stable portable identifier, e.g. `demo-arithmetic`; lowercase ASCII letters, digits, and hyphens, with a leading letter and bounded length. It is not a resolved path or secret. |
| `name` | Yes | Non-empty trimmed display name. Unicode is permitted. Never used as a command. |
| `description` | No | Human-readable text; render as text and treat imported content as untrusted. |
| `metadata` | No | Non-secret descriptive data such as publisher, release label, or tags. It is not passed to the server. |
| `transport` | Yes | Exactly one tagged transport object. |
| `extensions` | No | Namespaced, JSON-compatible data reserved for forward-compatible extensions. Unknown extensions are preserved only as inert data and surfaced to the user. |
| `transport.type` | Yes | `stdio` or `streamable-http`. This tag selects all other transport fields. |
| `transport.command` | STDIO | Required, non-empty executable name. It is never split, expanded as a shell, or treated as a command line. A machine-local absolute executable override is held outside the portable definition. The resolved executable must be shown and explicitly approved before launch. |
| `transport.args` | STDIO | Ordered string array; defaults to `[]`. Preserve spaces, Unicode, and empty arguments exactly. Reject NUL characters. |
| `transport.workingDirectory` | STDIO | Optional path relative to the explicitly approved workspace. Use `/` separators in portable definitions. Reject absolute paths and `..`; resolve symlinks and enforce workspace containment at launch. If omitted, the user still selects/approves the workspace root; never use MCPilot's implicit process cwd. |
| `transport.env` | STDIO | Optional map from environment variable names to `ValueSource`. Do not inherit the complete MCPilot environment. |
| `transport.url` | HTTP | Required URL with `http` or `https` scheme; reject URL user-info and fragments. HTTPS is required for non-loopback hosts. Loopback HTTP is allowed only for an explicitly approved local endpoint. URL policy/DNS checks are connection-time checks, not schema validation. |
| `transport.headers` | HTTP | Optional, case-insensitive HTTP token names mapped to `ValueSource`. Do not put credentials in URL parameters. `Authorization` is supplied by the authentication variant, not duplicated here. Secret-like headers must use secret references. |
| `transport.authentication` | HTTP | Optional; defaults to `{ "type": "none" }`. `{ "type": "bearer", "token": { ...secretRef... } }` is the only credential mode in v1. Never serialize the resolved token. |
| `ValueSource.kind` | Value source | `literal` or `secretRef`, as a discriminator. |
| `ValueSource.value` | Literal | Non-secret string value. Reject NUL. Literal values are visible in previews and must never be used for credentials. |
| `ValueSource.provider` | Secret reference | Literal `environment` in v1. Future providers require a versioned capability and local user setup. |
| `ValueSource.key` | Secret reference | Environment variable name, not its contents; validate with a portable identifier pattern. Resolve only immediately before an approved connection. |

For every nested model, reject extra keys and invalid types. Environment keys use a portable identifier pattern such as `[A-Za-z_][A-Za-z0-9_]*`. HTTP header names use the HTTP token syntax and comparisons are case-insensitive. No validator may launch a process, read a secret, or make a network request.

## JSON example: local STDIO demo

This is a portable definition example, not a claim that the runtime or demo server is implemented. `python` is an executable name to resolve on the developer's machine; the approval screen must show the actual resolved executable path before it launches.

```json
{
  "specVersion": "1.0",
  "id": "mcpilot-demo-tools",
  "name": "MCPilot Demo Tools",
  "description": "A local demonstration server with deterministic and time-based tools.",
  "metadata": {
    "publisher": "MCPilot",
    "release": "0.1.0",
    "tags": ["demo", "local"]
  },
  "transport": {
    "type": "stdio",
    "command": "python",
    "args": ["-m", "mcpilot_demo_server"],
    "workingDirectory": ".",
    "env": {
      "MCPILOT_DEMO_MODE": {
        "kind": "literal",
        "value": "safe"
      }
    }
  },
  "extensions": {}
}
```

The demo needs no token or network credentials. Secret-reference syntax is demonstrated by the HTTP example below.

## JSON example: Streamable HTTP

```json
{
  "specVersion": "1.0",
  "id": "team-docs",
  "name": "Team Documentation",
  "description": "Connect to the team's MCP endpoint.",
  "transport": {
    "type": "streamable-http",
    "url": "https://mcp.example.org/mcp",
    "headers": {
      "X-Workspace": {
        "kind": "literal",
        "value": "engineering"
      }
    },
    "authentication": {
      "type": "bearer",
      "token": {
        "kind": "secretRef",
        "provider": "environment",
        "key": "MCPILOT_TEAM_DOCS_TOKEN"
      }
    }
  }
}
```

The token value exists only in the developer's environment. Validation checks the structure and URL syntax; a separate, user-approved connection resolves the reference and attempts TLS/network access.

## Validation and approval rules

1. Parse JSON with duplicate-key detection where available. YAML input, if supported, must first be parsed safely, converted to JSON-compatible values, then validated by the exact same model.
2. Reject unknown spec versions, invalid IDs, unknown fields outside `extensions`, non-string argv entries, non-mapping environment/header values, NULs, and transport-incompatible fields.
3. STDIO requires `command`; it forbids URL, headers, and HTTP authentication. Streamable HTTP requires `url`; it forbids command, args, working directory, and process environment.
4. An HTTP URL must not include username/password or a credential query parameter. Enforce endpoint, DNS resolution, redirect, TLS, and private-address policy at connection time to reduce SSRF and DNS-rebinding exposure.
5. A working directory is portable workspace-relative data. At launch, canonicalize the chosen workspace and the resolved directory, follow symlinks for containment checks, and reject escape from the approved root.
6. Command availability is a separate diagnostic. At launch resolve one executable, show its canonical path and full argv, and require explicit approval. Never run through a shell.
7. Resolve `secretRef` only after the user approves the connection. Missing references report the variable name only. Redact resolved values from logs, errors, API responses, telemetry, and result previews.
8. Return structured validation issues with a JSON path, stable code, safe message, and optional remediation. Validation itself is side-effect free.
9. Tool names, descriptions, input schemas, content blocks, and structured results received later from a server are untrusted runtime data, not part of integration validation.

## Versioning and extensibility

- Use `major.minor` for `specVersion`. Compatible optional fields can increment the minor version; changed semantics, removed fields, or incompatible union variants require a major version.
- Version MCP protocol negotiation separately. The official SDK owns protocol negotiation for the selected SDK release; do not manually build JSON-RPC frames in application code.
- Version each client adapter by client/harness, destination/scope, client version range, and adapter version. A canonical definition does not certify client configuration compatibility.
- Check in schema examples and fixtures for every supported version. Test Pydantic/JSON Schema parity and migration behavior before changing the contract.
- Keep extension data under namespaced keys (for example, `com.example.audit`). It is inert unless an explicitly versioned implementation handles it. Extensions cannot bypass command approval, secret rules, or transport validation.
- Store local resolved executable paths, approved working roots, runtime secret values, and session tokens outside portable definitions. They are local-only operational state, not exportable integration data.
