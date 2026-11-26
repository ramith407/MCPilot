# MCPilot Canonical Integration Specification

> This earlier design note is retained as background. The normative proposed model for the first implementation is [canonical-integration-specification.md](canonical-integration-specification.md).

## Status

This is a proposed, deliberately small, versioned format. The current UI has a local Builder form, but no shared canonical model, backend validation, or live MCP connection. The existing TypeScript type supports only `stdio`, while the Builder UI also offers `http`; this document resolves that mismatch at the design level, not in application code.

The specification describes how to launch or reach one MCP server. It is not a copy of any single AI client's config format. Client adapters translate it into target-specific config and report fields they cannot represent.

## Design choices

- **JSON is canonical.** It is broadly supported by validation tooling and by MCP client configuration formats. YAML may be imported/exported using a YAML parser/serializer, but parsed YAML must be converted to and validated as the canonical model. Never generate YAML with string concatenation.
- **`specVersion` versions MCPilot's data contract.** MCP protocol versions and client adapter versions are separate concepts.
- **Transport is a tagged choice.** `stdio` has a command and argv; `streamable-http` has a URL and optional headers. The model must not pretend an HTTP definition has a local command.
- **Arguments are arrays.** This preserves spaces and prevents shell parsing assumptions.
- **Secrets are references.** Definitions can name a local environment variable to resolve later; the secret value itself does not belong in a committed spec.
- **Unknown fields are rejected or surfaced.** Silent field loss is unsafe, especially when importing a client config.

## Field reference

| Field | Required | Meaning and validation |
|---|---|---|
| `specVersion` | Yes | MCPilot format version, initially `1.0`. Validate supported major version. |
| `name` | Yes | Stable server key; non-empty, trimmed, and restricted to a documented portable identifier pattern. |
| `description` | No | Human-readable purpose; never executable. |
| `transport` | Yes | Exactly `stdio` or `streamable-http` in v1. |
| `command` | For `stdio` | Executable name or user-selected path. No shell syntax. Resolve against current OS `PATH` at validation/launch time. |
| `args` | For `stdio` | Ordered array of strings passed as argv. |
| `workingDirectory` | No; stdio only | Optional cwd. Prefer a project-relative path; an absolute path is machine-local and must be approved/resolved on that machine. |
| `url` | For `streamable-http` | MCP endpoint URL. Require `https` for remote endpoints; permit `http` for loopback/local development with explicit policy. Reject credentials in URL user-info. |
| `env` | No; stdio only | Mapping of environment variable names to non-secret literal values or secret references. Do not inherit the entire parent environment without need. |
| `headers` | No; HTTP only | Mapping of header names to non-secret values or secret references. Never put bearer credentials in a URL or logs. |
| `metadata` | No | Optional descriptive, non-secret local metadata. Do not pass it to the MCP server unless an adapter explicitly maps it. |

Transport-specific fields are mutually exclusive: stdio definitions require `command` and cannot contain `url`/`headers`; Streamable HTTP definitions require `url` and cannot contain `command`/`args`/`workingDirectory`/`env`.

## Secret representation

In `env` and `headers`, allow either a non-secret literal string or a secret reference object:

```json
{
  "GITHUB_TOKEN": { "secretRef": "MCPILOT_GITHUB_TOKEN" }
}
```

`secretRef` names an environment variable in the user's local MCPilot process environment. It is not a credential. The backend resolves it only when an approved connection is started, and reports a missing reference by name without printing its value. The same machine-local convention applies to HTTP authorization headers.

Do not resolve references while showing normal previews or saving canonical definitions. When generating another client's config, emit a target-supported reference only if that client's documented format supports it; otherwise leave a clear placeholder/warning or ask the user to export a local-only config with explicit approval. Never silently substitute a live secret into a downloaded/shared file.

## Validation rules

1. Parse JSON/YAML safely; reject empty input, duplicate keys where detectable, invalid root types, and unknown schema versions.
2. Validate with the checked-in JSON Schema and mirror semantic rules in Pydantic. Keep both validations aligned through shared fixtures.
3. Enforce transport-specific required/forbidden fields and strict field types. `args` must be a list of strings; environment/header keys must match a safe identifier/token pattern.
4. Do not execute commands, resolve credentials, or contact a URL during schema validation.
5. Validate portable IDs, but do not over-restrict legitimate Unicode in display names or descriptions. Derive client keys only by explicit, deterministic rules and show the result to the user.
6. For path fields, parse with OS-aware APIs on the current machine. Relative `workingDirectory` paths resolve from the user-selected project/workspace root associated with the definition, never from an implicit process cwd. Do not attempt to reinterpret a Windows absolute path as Unix or vice versa. Report foreign-platform absolute paths as requiring user selection/review. Absolute paths are machine-local and must not be treated as portable definitions.
7. Check command availability only in a separate environment diagnostic. Distinguish “not found” from “not yet checked.”
8. For Streamable HTTP, validate URL syntax and policy separately from schema validity. Do not fetch it during validation.
9. Return structured issues with a JSON pointer/path, code, message, and optional remediation. Never include raw secret values in errors.

## Versioning strategy

- `specVersion` uses a simple major/minor form. Compatible optional additions may increment the minor version; field meaning changes or removals require a new major version.
- The schema lives at `spec/integration.schema.json` and is versioned with the code. Each release declares supported spec versions and migrations, if any.
- Client adapter support is versioned independently by client/harness, configuration destination, and client version range. Do not encode client-specific fields into the canonical model without a demonstrated cross-client concept.
- MCP protocol negotiation is performed by the SDK during connection; it is not specified by `specVersion`.
- Keep old examples and schema fixtures; test migrations and adapters against them before changing support.

## Example: local stdio server

This illustrates the format only. It does not install the named runtime or server package, and this example should not be treated as verified for a particular MCP client.

```json
{
  "specVersion": "1.0",
  "name": "filesystem",
  "description": "Restrict a filesystem MCP server to a selected workspace.",
  "transport": "stdio",
  "command": "npx",
  "args": [
    "--yes",
    "@modelcontextprotocol/server-filesystem",
    "./workspace"
  ],
  "workingDirectory": "./",
  "env": {
    "LOG_LEVEL": "info"
  }
}
```

The user must have Node/npm available for `npx`, approve the launch, and review the server package and workspace access before running it. MCPilot must detect a missing `npx` and explain the next step; it must not assume installation.

## Example: remote Streamable HTTP server

```json
{
  "specVersion": "1.0",
  "name": "team-docs",
  "description": "Read-only access to the team's documentation MCP service.",
  "transport": "streamable-http",
  "url": "https://mcp.example.org/mcp",
  "headers": {
    "Authorization": {
      "secretRef": "MCPILOT_TEAM_DOCS_TOKEN"
    }
  }
}
```

The endpoint and credential belong to the developer's environment. A connection is a separate, user-approved operation; validation must not make a network request.

## Relationship to client configs

Each adapter maps only the fields supported by the selected client's specific configuration destination. It returns generated content plus warnings for unsupported concepts such as secret references, cwd, or transport. Adapters must not claim that a config is accepted by a client until it is tested against that client's documented format and version range.
