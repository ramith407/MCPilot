"use client";

import { useState, useCallback, useRef } from "react";
import { Icon } from "@/components/icon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClientId = "cursor" | "claude" | "vscode";
type ToastState = { message: string; type: "success" | "error" } | null;

interface Integration {
  id: string;
  name: string;
  description: string;
  command: string;
  args: string[];
  env: Record<string, string>;
}

interface ClientDef {
  id: ClientId;
  label: string;
  tagline: string;
  configPath: string;
  configPathWin?: string;
  format: string;
  downloadName: string;
}

// ---------------------------------------------------------------------------
// Static data
// ---------------------------------------------------------------------------

const INTEGRATIONS: Integration[] = [
  {
    id: "filesystem-server",
    name: "Filesystem Server",
    description: "Local filesystem access via MCP",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem", "./workspace"],
    env: { WORKSPACE_ROOT: "./workspace" },
  },
  {
    id: "calculator-server",
    name: "Calculator MCP Server",
    description: "Basic arithmetic operations over MCP",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-calculator"],
    env: {},
  },
  {
    id: "github-server",
    name: "GitHub MCP Server",
    description: "GitHub repository operations via MCP",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_TOKEN: "<your-token>" },
  },
];

const CLIENTS: ClientDef[] = [
  {
    id: "cursor",
    label: "Cursor",
    tagline: "Project-level config",
    configPath: ".cursor/mcp.json",
    format: "JSON",
    downloadName: "mcp.json",
  },
  {
    id: "claude",
    label: "Claude Code",
    tagline: "User-level config",
    configPath: "~/Library/Application Support/Claude/claude_desktop_config.json",
    configPathWin: "%APPDATA%\\Claude\\claude_desktop_config.json",
    format: "JSON",
    downloadName: "claude_desktop_config.json",
  },
  {
    id: "vscode",
    label: "VS Code",
    tagline: "Workspace config",
    configPath: ".vscode/mcp.json",
    format: "JSON",
    downloadName: "mcp.json",
  },
];

const CLIENT_MAP = Object.fromEntries(CLIENTS.map((c) => [c.id, c])) as Record<ClientId, ClientDef>;
const INTEGRATION_MAP = Object.fromEntries(INTEGRATIONS.map((i) => [i.id, i])) as Record<string, Integration>;

// ---------------------------------------------------------------------------
// Config generators  (illustrative only — not tested against real clients)
// ---------------------------------------------------------------------------

function generateCursorConfig(integ: Integration): object {
  return {
    mcpServers: {
      [integ.id]: {
        command: integ.command,
        args: integ.args,
        ...(Object.keys(integ.env).length ? { env: integ.env } : {}),
      },
    },
  };
}

function generateClaudeConfig(integ: Integration): object {
  return {
    mcpServers: {
      [integ.id]: {
        command: integ.command,
        args: integ.args,
        ...(Object.keys(integ.env).length ? { env: integ.env } : {}),
      },
    },
  };
}

function generateVSCodeConfig(integ: Integration): object {
  return {
    inputs: [],
    servers: {
      [integ.id]: {
        type: "stdio",
        command: integ.command,
        args: integ.args,
        ...(Object.keys(integ.env).length ? { env: integ.env } : {}),
      },
    },
  };
}

function generateConfig(integ: Integration, clientId: ClientId): string {
  let obj: object;
  if (clientId === "cursor") obj = generateCursorConfig(integ);
  else if (clientId === "claude") obj = generateClaudeConfig(integ);
  else obj = generateVSCodeConfig(integ);
  return JSON.stringify(obj, null, 2);
}

// ---------------------------------------------------------------------------
// JSON syntax tokeniser
// ---------------------------------------------------------------------------

type TokenKind = "brace" | "bracket" | "punct" | "num" | "bool" | "null" | "key" | "str" | "plain";
interface Token { kind: TokenKind; text: string }

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    // string
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j - 1] !== "\\")) j++;
      const raw = line.slice(i, j + 1);
      const rest = line.slice(j + 1).trimStart();
      tokens.push({ kind: rest.startsWith(":") ? "key" : "str", text: raw });
      i = j + 1;
      continue;
    }
    // braces
    if ("{}".includes(line[i])) { tokens.push({ kind: "brace", text: line[i] }); i++; continue; }
    if ("[]".includes(line[i])) { tokens.push({ kind: "bracket", text: line[i] }); i++; continue; }
    // number
    const nm = line.slice(i).match(/^-?\d+(\.\d+)?/);
    if (nm) { tokens.push({ kind: "num", text: nm[0] }); i += nm[0].length; continue; }
    // boolean / null keywords
    const kw = line.slice(i).match(/^(true|false|null)\b/);
    if (kw) {
      tokens.push({ kind: kw[0] === "null" ? "null" : "bool", text: kw[0] });
      i += kw[0].length;
      continue;
    }
    // colon / comma
    if (":,".includes(line[i])) { tokens.push({ kind: "punct", text: line[i] }); i++; continue; }
    // whitespace
    const sp = line.slice(i).search(/\S/);
    if (sp === -1) { tokens.push({ kind: "plain", text: line.slice(i) }); break; }
    if (sp > 0) { tokens.push({ kind: "plain", text: line.slice(i, i + sp) }); i += sp; }
    else { tokens.push({ kind: "plain", text: line[i] }); i++; }
  }
  return tokens;
}

function HighlightedJson({ code }: { code: string }) {
  return (
    <code className="cmp-code-block">
      {code.split("\n").map((line, idx) => (
        <div key={idx} className="cmp-code-row">
          <span className="cmp-code-ln">{String(idx + 1).padStart(2, "0")}</span>
          <span className="cmp-code-line">
            {tokenizeLine(line).map((tok, ti) => (
              <span key={ti} className={`cmp-tok cmp-tok-${tok.kind}`}>{tok.text}</span>
            ))}
          </span>
        </div>
      ))}
    </code>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`cmp-toast cmp-toast-${type}`} role="alert" aria-live="polite">
      <span className="cmp-toast-icon">
        {type === "success" ? <Icon name="check" /> : <Icon name="close" />}
      </span>
      {message}
    </div>
  );
}

function ClientCard({
  client, selected, onClick,
}: {
  client: ClientDef; selected: boolean; onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`cmp-client-card${selected ? " cmp-client-card-selected" : ""}`}
      onClick={onClick}
      aria-pressed={selected}
    >
      <span className="cmp-client-icon">
        <Icon name={client.id === "cursor" ? "terminal" : client.id === "claude" ? "spark" : "compiler"} />
      </span>
      <span className="cmp-client-label">{client.label}</span>
      <span className="cmp-client-tagline">{client.tagline}</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main exported component
// ---------------------------------------------------------------------------

export function CompilerClient() {
  const [integrationId, setIntegrationId] = useState("filesystem-server");
  const [clientId, setClientId] = useState<ClientId>("cursor");
  const [configCode, setConfigCode] = useState<string>(() =>
    generateConfig(INTEGRATIONS[0], "cursor")
  );
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Generate ──────────────────────────────────────────────────────────────

  const handleGenerate = () => {
    setGenerating(true);
    // Simulate a brief generation delay for demo effect
    setTimeout(() => {
      const integ = INTEGRATION_MAP[integrationId] || INTEGRATIONS[0];
      setConfigCode(generateConfig(integ, clientId));
      setGenerating(false);
      showToast(`Configuration generated for ${CLIENT_MAP[clientId].label}.`);
    }, 600);
  };

  // ── Copy ──────────────────────────────────────────────────────────────────

  const handleCopy = async () => {
    if (!configCode) return;
    try {
      await navigator.clipboard.writeText(configCode);
      setCopied(true);
      showToast("Configuration copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Could not access clipboard.", "error");
    }
  };

  // ── Download ──────────────────────────────────────────────────────────────

  const handleDownload = () => {
    if (!configCode) return;
    const blob = new Blob([configCode], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = CLIENT_MAP[clientId].downloadName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloaded ${CLIENT_MAP[clientId].downloadName}.`);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const client = CLIENT_MAP[clientId];
  const integration = INTEGRATION_MAP[integrationId] || INTEGRATIONS[0];
  const lineCount = configCode ? configCode.split("\n").length : 0;

  // Update sample config when selectors change
  const changeIntegration = (id: string) => {
    setIntegrationId(id);
    const integ = INTEGRATION_MAP[id];
    if (integ) {
      setConfigCode(generateConfig(integ, clientId));
    }
  };
  const changeClient = (id: ClientId) => {
    setClientId(id);
    const integ = INTEGRATION_MAP[integrationId] || INTEGRATIONS[0];
    setConfigCode(generateConfig(integ, id));
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="content-wrap cmp-page">
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ── Page header ── */}
      <div className="page-kicker">
        <span className="kicker-line" /> MCP WORKFLOW{" "}
        <span className="kicker-separator">/</span> COMPILE
      </div>

      <div className="cmp-page-heading">
        <div>
          <div className="section-stage-label">STEP 02 <span>/</span> 04</div>
          <h1>Config Compiler</h1>
          <p>
            Generate client-specific configurations from one server definition.
            Switch clients to see format differences instantly.
          </p>
        </div>
        <span className="cmp-demo-chip">
          <Icon name="spark" /> Illustrative demo — not tested against real clients
        </span>
      </div>

      {/* ── Selector bar ── */}
      <div className="cmp-selector-bar">

        {/* Integration picker */}
        <div className="cmp-selector-group">
          <label className="cmp-selector-label" htmlFor="integration-select">
            Integration
          </label>
          <div className="cmp-select-wrap">
            <select
              id="integration-select"
              className="cmp-select"
              value={integrationId}
              onChange={(e) => changeIntegration(e.target.value)}
            >
              {INTEGRATIONS.map((i) => (
                <option key={i.id} value={i.id}>{i.name}</option>
              ))}
            </select>
            <span className="cmp-select-chevron" aria-hidden="true">
              <Icon name="arrow" />
            </span>
          </div>
          <p className="cmp-selector-hint">{integration.description}</p>
        </div>

        {/* Client selector cards */}
        <div className="cmp-selector-group cmp-client-group">
          <span className="cmp-selector-label">Target Client</span>
          <div className="cmp-client-cards">
            {CLIENTS.map((c) => (
              <ClientCard
                key={c.id}
                client={c}
                selected={clientId === c.id}
                onClick={() => changeClient(c.id)}
              />
            ))}
          </div>
        </div>

        {/* Generate button */}
        <div className="cmp-selector-group cmp-generate-group">
          <span className="cmp-selector-label">&nbsp;</span>
          <button
            type="button"
            className={`cmp-btn-generate${generating ? " cmp-btn-generating" : ""}`}
            onClick={handleGenerate}
            disabled={generating}
          >
            {generating ? (
              <>
                <span className="cmp-spinner" aria-hidden="true" />
                Generating…
              </>
            ) : (
              <>
                <Icon name="compiler" />
                Generate Configuration
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Main area: editor + info panel ── */}
      <div className="cmp-main">

        {/* Code editor panel */}
        <div className="cmp-editor-panel">
          <div className="cmp-editor-topbar">
            <div className="cmp-editor-title">
              <span className="cmp-editor-file-icon"><Icon name="compiler" /></span>
              <span className="cmp-editor-filename">
                {client.configPath.split("/").pop()}
              </span>
              <span className="cmp-editor-path">{client.configPath}</span>
            </div>
            <div className="cmp-editor-actions">
              {configCode && (
                <>
                  <span className="cmp-line-count">{lineCount} lines</span>
                  <button
                    type="button"
                    className={`cmp-action-btn${copied ? " cmp-action-btn-success" : ""}`}
                    onClick={handleCopy}
                    title="Copy to clipboard"
                  >
                    {copied ? <Icon name="check" /> : <Icon name="external" />}
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <button
                    type="button"
                    className="cmp-action-btn"
                    onClick={handleDownload}
                    title="Download configuration file"
                  >
                    <Icon name="arrow" />
                    Download
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="cmp-editor-body">
            {/* Empty state */}
            {!configCode && !generating && (
              <div className="cmp-empty-state">
                <span className="cmp-empty-icon"><Icon name="compiler" /></span>
                <p className="cmp-empty-title">No configuration generated yet</p>
                <p className="cmp-empty-desc">
                  Select an integration and target client above, then click{" "}
                  <strong>Generate Configuration</strong>.
                </p>
              </div>
            )}

            {/* Loading state */}
            {generating && (
              <div className="cmp-generating-state">
                <span className="cmp-gen-spinner" aria-hidden="true" />
                <p>Compiling configuration for <strong>{client.label}</strong>…</p>
              </div>
            )}

            {/* Code output */}
            {configCode && !generating && (
              <HighlightedJson code={configCode} />
            )}
          </div>

          <div className="cmp-editor-footer">
            <span className="cmp-editor-hint">
              <Icon name="spark" />
              Illustrative demo output · Configuration format may differ from official documentation
            </span>
            <span className="cmp-editor-lang">JSON</span>
          </div>
        </div>

        {/* Info panel */}
        <aside className="cmp-info-panel">
          <div className="cmp-info-header">
            <Icon name="doctor" />
            Configuration Details
          </div>

          <div className="cmp-info-body">
            {/* Client */}
            <div className="cmp-info-row cmp-info-row-stacked">
              <span className="cmp-info-label">Selected Client</span>
              <span className="cmp-info-value cmp-info-client-badge">
                <span className="cmp-client-dot" />
                {client.label}
              </span>
            </div>

            {/* Integration */}
            <div className="cmp-info-row cmp-info-row-stacked">
              <span className="cmp-info-label">Integration</span>
              <span className="cmp-info-value">{integration.name}</span>
            </div>

            {/* Config file */}
            <div className="cmp-info-row cmp-info-row-stacked">
              <span className="cmp-info-label">Config File Location</span>
              <code className="cmp-info-code">{client.configPath}</code>
              {client.configPathWin && (
                <>
                  <span className="cmp-info-os-label">Windows</span>
                  <code className="cmp-info-code">{client.configPathWin}</code>
                </>
              )}
            </div>

            {/* Format */}
            <div className="cmp-info-row">
              <span className="cmp-info-label">Format</span>
              <span className="cmp-info-value cmp-mono">{client.format}</span>
            </div>

            {/* Transport */}
            <div className="cmp-info-row">
              <span className="cmp-info-label">Transport</span>
              <span className="cmp-info-value cmp-mono">STDIO</span>
            </div>

            {/* Status */}
            <div className="cmp-info-row">
              <span className="cmp-info-label">Status</span>
              <span className={`cmp-status-badge${generating ? " cmp-status-idle" : configCode ? " cmp-status-ready" : " cmp-status-idle"}`}>
                <span className="cmp-status-dot" />
                {generating ? "Compiling…" : configCode ? "Generated" : "Not generated"}
              </span>
            </div>
          </div>

          {/* Instructions */}
          <div className="cmp-info-instructions">
            <div className="cmp-instructions-header">
              <Icon name="terminal" /> How to use
            </div>
            <ol className="cmp-steps-list">
              {clientId === "cursor" && (<>
                <li>Generate the configuration above.</li>
                <li>Create <code>.cursor/mcp.json</code> in your project root.</li>
                <li>Paste the JSON into that file.</li>
                <li>Restart Cursor to pick up the changes.</li>
              </>)}
              {clientId === "claude" && (<>
                <li>Generate the configuration above.</li>
                <li>Open your Claude Desktop config file.</li>
                <li>Merge <code>mcpServers</code> into the existing file.</li>
                <li>Restart Claude Desktop.</li>
              </>)}
              {clientId === "vscode" && (<>
                <li>Generate the configuration above.</li>
                <li>Create <code>.vscode/mcp.json</code> in your workspace.</li>
                <li>Paste the JSON into that file.</li>
                <li>Reload the VS Code window.</li>
              </>)}
            </ol>
          </div>

          {/* Disclaimer */}
          <div className="cmp-disclaimer">
            <Icon name="doctor" />
            Demo configurations only. Verify against official client documentation before use.
          </div>
        </aside>
      </div>

      {/* Nav row */}
      <div className="cmp-nav-row">
        <a href="/builder" className="text-link">
          <span aria-hidden="true">←</span> Integration Builder
        </a>
        <a href="/playground" className="text-link">
          Playground <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}

