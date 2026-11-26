# Development Setup

## Status

The repository's Git root is the `MCPilot` directory. It contains the existing Next.js frontend and a minimal FastAPI backend with health and message-test endpoints. The backend does not implement MCP connections or other future MCP features. These instructions have not been verified on clean machines across Windows, Linux, and macOS, so they are not a cross-platform support claim.

This guide is located at `docs/development-setup.md`; its repository-relative README link is `docs/development-setup.md`.

## Prerequisites

For the current frontend:

- Git
- Node.js **20.9 or newer** and npm. The installed Next.js package declares Node `>=20.9.0`; Next.js documents support for Windows, macOS, and Linux. Prefer a supported Node LTS release. [Next.js installation requirements](https://nextjs.org/docs/app/getting-started/installation)

For the backend:

- Python **3.11 or newer**; Python 3.13 is the tested backend target. The backend's `src/` package is installed editable by `backend/requirements.txt`, so commands run from the repository root do not need `PYTHONPATH` or Uvicorn `--app-dir`.
- A backend virtual environment under the repository (`backend/.venv/`). Do not install MCPilot backend dependencies globally.
- The pinned runtime packages in `backend/requirements.txt`: FastAPI, Pydantic, Uvicorn, python-dotenv, and the editable local package. `backend/requirements-dev.txt` includes those runtime requirements plus pinned pytest and httpx2 test dependencies.

No MCP server, AI client, credential, or user-specific configuration file is a prerequisite for installing the frontend.

## Clone and install the current frontend

Run these commands from a terminal. `MCPilot` is the repository root; do not `cd` into a nested frontend folder.

```sh
git clone https://github.com/ramith407/MCPilot.git
cd MCPilot
npm ci
```

`npm ci` installs from the committed lockfile and reports a package/lock mismatch instead of rewriting the lockfile. [npm `ci` documentation](https://docs.npmjs.com/cli/commands/npm-ci/)

Start the existing frontend:

```sh
npm run dev
```

Then open `http://localhost:3000`. The overview's backend check requires the API to be started separately. The UI and API here only verify basic HTTP connectivity; they do not provide live MCP features.

## Start the backend

Run these commands from the repository root. Copy `.env.example` to `.env` once; it contains local settings and no credentials. The backend uses an isolated virtual environment and Uvicorn is bound to loopback.

### Windows 10/11 — PowerShell

```powershell
py -3.13 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements-dev.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
backend\.venv\Scripts\python.exe -m uvicorn mcpilot_api.main:app --host 127.0.0.1 --port 8000 --reload
```

The commands above invoke the virtual-environment interpreter directly, so activation policy does not need to change.

### Linux and macOS — bash/zsh

```sh
python3.13 -m venv backend/.venv
backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
cp .env.example .env
backend/.venv/bin/python -m uvicorn mcpilot_api.main:app --host 127.0.0.1 --port 8000 --reload
```

If you prefer activation, Python uses `Scripts/Activate.ps1` on Windows PowerShell and `bin/activate` on bash/zsh. [Python `venv` documentation](https://docs.python.org/3/library/venv.html)

Run the frontend in a second terminal from the repository root:

```sh
npm run dev
```

The backend listens on `127.0.0.1:8000`. `MCPILOT_CORS_ORIGINS` configures allowed local frontend origins; `NEXT_PUBLIC_MCPILOT_API_URL` configures the frontend API base URL. Restart both development servers after changing `.env`. Do not bind the backend to a public interface.

Run the backend API tests from the repository root:

```sh
backend/.venv/bin/python -m pytest backend/tests
```

On Windows PowerShell, use `backend\.venv\Scripts\python.exe -m pytest backend\tests` instead.

## Check the connection

On the overview page, enter a message and select **Check backend**. The UI calls `GET /api/health`, then sends the message to `POST /api/test`; it displays the response returned by FastAPI.

You can also call the API directly.

PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod -Uri http://127.0.0.1:8000/api/test -Method Post -ContentType 'application/json' -Body '{"message":"hello"}'
```

Linux/macOS:

```sh
curl http://127.0.0.1:8000/api/health
curl -X POST http://127.0.0.1:8000/api/test \\
  -H 'Content-Type: application/json' \\
  -d '{"message":"hello"}'
```

The test endpoint validates messages as non-empty strings up to 500 characters. It does not connect to an MCP server.

## Environment variables and personal configuration

- Commit `.env.example` with names and safe placeholder values only. It must not contain working credentials.
- Copy it to `.env` only if local configuration is needed. `.env` must be ignored by Git.
- Set actual secrets in the local process environment or a future supported OS credential store. Do not put them in issues, screenshots, config previews, example files, or committed client configs.
- Each developer uses their own MCP server installs, credentials, environment variables, client config paths, and local application data. MCPilot should not require copying a teammate's home directory or config file.
- The present frontend needs no `.env` file to start.

## Troubleshooting

| Symptom | Check |
|---|---|
| `node` or `npm` not found | Install a supported Node.js release and reopen the terminal; verify with `node --version` and `npm --version`. |
| `npm ci` reports lock mismatch | Confirm you're at the repository root and use the committed `package.json` and `package-lock.json`; do not resolve by silently regenerating the lockfile. |
| `py -3.13` unavailable on Windows | Install Python 3.13 and the Python launcher, or use the path to the Python 3.13 interpreter explicitly. |
| `python3.13` unavailable on Linux/macOS | Install Python 3.13 using the OS-appropriate package manager or official installer; keep it separate from system Python if the OS relies on that interpreter. |
| PowerShell blocks venv activation | Follow the note above or invoke `.venv\Scripts\python.exe` directly. |
| Python package installation fails | Use the interpreter under `backend/.venv/`, run installation from the repository root, and confirm both requirement files and `backend/pyproject.toml` are present. |
| Port 3000 is occupied | Stop the other dev server or use the documented Next.js port override. |
| A configured MCP command is missing | MCP runtime detection is not implemented in this backend foundation. |
| Client config path differs by OS | Resolve it using the selected client's documentation and current user's OS paths; do not copy another developer's absolute path. |

## Cross-platform verification policy

Do not advertise Windows, Linux, or macOS support based only on framework support or a developer laptop. Before release, start from clean checkouts on Windows 10/11, a documented Linux distribution, and a documented macOS version. Record Node/Python versions and test:

1. `npm ci` and frontend startup.
2. Python venv creation and pinned backend install.
3. Backend startup bound to loopback and frontend-to-backend communication.
4. Missing runtime and missing credential errors.
5. Path resolution and config import/export.
6. Approved stdio launch, Streamable HTTP connection, cancellation, and process cleanup once those features exist.

Publish only the OS/version combinations and features that passed. A feature not yet implemented cannot pass this gate.
