"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import "./playground.css";

const API_BASE = (process.env.NEXT_PUBLIC_MCPILOT_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

type Phase = "loading" | "disconnected" | "registered" | "connecting" | "ready" | "failed" | "closing";
type ToolInfo = { name: string; description?: string | null; input_schema: Record<string, unknown> };
type SessionInfo = {
  id: string;
  integration_id: string;
  status: "ready" | "closed" | "failed";
  server_name?: string | null;
  server_version?: string | null;
  protocol_version?: string | null;
  tools: ToolInfo[];
};
type LaunchApproval = {
  approval_token: string;
  expires_in_seconds: number;
  command: string;
  args: string[];
  working_directory: string;
  environment_keys: string[];
};
type ToolApproval = {
  approval_token: string;
  expires_in_seconds: number;
  tool_name: string;
  arguments: Record<string, unknown>;
};
type ToolResult = {
  tool_name: string;
  is_error: boolean;
  structured_content?: unknown;
  content: Array<Record<string, unknown>>;
};

async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("X-MCPilot-Request-Token", token);
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof data.detail === "string" ? data.detail : `Request failed (${response.status}).`;
    throw new Error(detail);
  }
  return data as T;
}

function pretty(value: unknown) {
  return JSON.stringify(value, null, 2);
}

export function PlaygroundClient() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [requestToken, setRequestToken] = useState("");
  const [error, setError] = useState("");
  const [registered, setRegistered] = useState(false);
  const [launchApproval, setLaunchApproval] = useState<LaunchApproval | null>(null);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [selectedTool, setSelectedTool] = useState("");
  const [argumentsText, setArgumentsText] = useState('{"a": 10, "b": 20}');
  const [toolApproval, setToolApproval] = useState<ToolApproval | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);
  const [busy, setBusy] = useState(false);

  const selected = useMemo(
    () => session?.tools.find((tool) => tool.name === selectedTool) ?? null,
    [session, selectedTool],
  );

  useEffect(() => {
    let active = true;
    api<{ token: string }>("/api/v1/security/token")
      .then(({ token }) => {
        if (!active) return;
        setRequestToken(token);
        setPhase("disconnected");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Could not reach the local API.");
        setPhase("failed");
      });
    return () => { active = false; };
  }, []);

  const run = useCallback(async (operation: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "The request failed.");
      setPhase((current) => current === "connecting" || current === "closing" ? "failed" : current);
    } finally {
      setBusy(false);
    }
  }, []);

  const register = () => run(async () => {
    const definition = await api<Record<string, unknown>>("/api/v1/demo");
    await api("/api/v1/integrations", requestToken, { method: "POST", body: JSON.stringify(definition) });
    setRegistered(true);
    setPhase("registered");
    setError("");
  });

  const prepareConnection = () => run(async () => {
    const prepared = await api<LaunchApproval>("/api/v1/sessions/prepare", requestToken, {
      method: "POST",
      body: JSON.stringify({ integration_id: "mcpilot-demo-tools" }),
    });
    setLaunchApproval(prepared);
  });

  const approveConnection = () => run(async () => {
    if (!launchApproval) return;
    setPhase("connecting");
    const connected = await api<SessionInfo>("/api/v1/sessions", requestToken, {
      method: "POST",
      body: JSON.stringify({ approval_token: launchApproval.approval_token }),
    });
    setSession(connected);
    setSelectedTool(connected.tools[0]?.name ?? "");
    setLaunchApproval(null);
    setPhase("ready");
  });

  const denyConnection = () => {
    setLaunchApproval(null);
    setPhase(registered ? "registered" : "disconnected");
  };

  const prepareTool = () => run(async () => {
    if (!session || !selected) return;
    const args: unknown = JSON.parse(argumentsText);
    if (!args || typeof args !== "object" || Array.isArray(args)) {
      throw new Error("Tool arguments must be a JSON object.");
    }
    const prepared = await api<ToolApproval>(`/api/v1/sessions/${session.id}/tools/${encodeURIComponent(selected.name)}/approval`, requestToken, {
      method: "POST",
      body: JSON.stringify({ arguments: args }),
    });
    setToolApproval(prepared);
  });

  const approveTool = () => run(async () => {
    if (!session || !toolApproval) return;
    const called = await api<ToolResult>(`/api/v1/sessions/${session.id}/tools/${encodeURIComponent(toolApproval.tool_name)}/call`, requestToken, {
      method: "POST",
      body: JSON.stringify({ arguments: toolApproval.arguments, approval_token: toolApproval.approval_token }),
    });
    setResult(called);
    setToolApproval(null);
  });

  const disconnect = () => run(async () => {
    if (!session) return;
    setPhase("closing");
    await api(`/api/v1/sessions/${session.id}`, requestToken, { method: "DELETE" });
    setSession(null);
    setSelectedTool("");
    setToolApproval(null);
    setResult(null);
    setPhase("registered");
  });

  const selectTool = (name: string) => {
    setSelectedTool(name);
    setResult(null);
    setToolApproval(null);
    setArgumentsText(name === "add_numbers" ? '{"a": 10, "b": 20}' : name === "echo_message" ? '{"message": "Hello from MCPilot"}' : "{}");
  };

  return (
    <div className="content-wrap section-page playground-page">
      <div className="page-kicker"><span className="kicker-line" /> MCP WORKFLOW <span className="kicker-separator">/</span> TEST</div>
      <div className="section-page-heading playground-heading">
        <div>
          <div className="section-stage-label">STEP 03 <span>/</span> 04</div>
          <h1>MCP Playground</h1>
          <p>Connect to MCPilot’s local demo server, inspect its live tools, and review each call before execution.</p>
        </div>
        <span className={`playground-status status-${phase}`}><span /> {phase.replaceAll("-", " ").toUpperCase()}</span>
      </div>

      {error && <div className="playground-alert" role="alert"><strong>Request failed</strong><span>{error}</span></div>}

      <section className="playground-card setup-card" aria-labelledby="setup-title">
        <div className="playground-card-heading"><div><span className="playground-step">01</span><h2 id="setup-title">Register the demo integration</h2></div><span className="playground-caption">In-memory · no files written</span></div>
        <p>Registers a portable STDIO definition. This step validates data only; it does not launch a process.</p>
        <button className="button-primary" type="button" disabled={!requestToken || busy || registered} onClick={register}>
          {busy && !registered ? "Working…" : registered ? "Integration registered" : "Register demo integration"}
        </button>
      </section>

      <section className="playground-card connection-card" aria-labelledby="connection-title">
        <div className="playground-card-heading"><div><span className="playground-step">02</span><h2 id="connection-title">Local MCP connection</h2></div><span className="playground-caption">STDIO · loopback backend</span></div>
        <p>The backend starts the server only after you review and approve the resolved executable and arguments.</p>
        {!session ? (
          <button className="button-primary" type="button" disabled={!registered || busy || phase === "loading"} onClick={prepareConnection}>
            Prepare connection approval
          </button>
        ) : (
          <div className="connection-live">
            <div><strong>{session.server_name ?? "MCP server"}</strong><span>{session.protocol_version ? `Protocol ${session.protocol_version}` : "Initialized by the MCP SDK"}</span></div>
            <button className="button-danger" type="button" disabled={busy} onClick={disconnect}>{phase === "closing" ? "Closing…" : "Disconnect"}</button>
          </div>
        )}
      </section>

      {launchApproval && (
        <section className="approval-card" aria-labelledby="launch-approval-title">
          <div className="playground-card-heading"><div><span className="playground-step approval-step">!</span><h2 id="launch-approval-title">Approve local process launch</h2></div><span className="approval-expiry">Expires in {launchApproval.expires_in_seconds}s</span></div>
          <p>Review the exact launch request. Approval permits this process to start under your user account; it is not an OS sandbox.</p>
          <dl className="approval-details">
            <div><dt>Executable</dt><dd><code>{launchApproval.command}</code></dd></div>
            <div><dt>Arguments</dt><dd>{launchApproval.args.map((arg, index) => <code key={`${index}-${arg}`} className="argument-chip">{arg || "(empty)"}</code>)}</dd></div>
            <div><dt>Working directory</dt><dd><code>{launchApproval.working_directory}</code></dd></div>
            <div><dt>Environment keys</dt><dd>{launchApproval.environment_keys.length ? launchApproval.environment_keys.join(", ") : "No integration-specific variables"}</dd></div>
          </dl>
          <div className="approval-actions"><button className="button-primary" type="button" disabled={busy} onClick={approveConnection}>Approve and connect</button><button className="button-secondary" type="button" disabled={busy} onClick={denyConnection}>Deny</button></div>
        </section>
      )}

      {session && phase === "ready" && (
        <section className="playground-card tools-card" aria-labelledby="tools-title">
          <div className="playground-card-heading"><div><span className="playground-step">03</span><h2 id="tools-title">Live discovered tools</h2></div><span className="playground-caption">{session.tools.length} returned by server</span></div>
          {!session.tools.length ? <p>The connected server returned no tools.</p> : <>
            <div className="tool-tabs" role="tablist" aria-label="Discovered tools">
              {session.tools.map((tool) => <button key={tool.name} type="button" role="tab" aria-selected={selectedTool === tool.name} className={selectedTool === tool.name ? "tool-tab tool-tab-active" : "tool-tab"} onClick={() => selectTool(tool.name)}>{tool.name}</button>)}
            </div>
            {selected && <div className="tool-workspace">
              <div className="tool-description"><div><h3>{selected.name}</h3><p>{selected.description || "No description supplied by the server."}</p></div><span className="live-badge"><span /> LIVE</span></div>
              <label htmlFor="tool-arguments">Arguments (JSON)</label>
              <textarea id="tool-arguments" spellCheck={false} value={argumentsText} onChange={(event) => setArgumentsText(event.target.value)} aria-describedby="tool-schema" />
              <details id="tool-schema"><summary>Input schema discovered from server</summary><pre>{pretty(selected.input_schema)}</pre></details>
              <button className="button-primary" type="button" disabled={busy} onClick={prepareTool}>Review tool call</button>
            </div>}
          </>}
        </section>
      )}

      {toolApproval && session && (
        <section className="approval-card tool-approval" aria-labelledby="tool-approval-title">
          <div className="playground-card-heading"><div><span className="playground-step approval-step">!</span><h2 id="tool-approval-title">Approve this exact tool call</h2></div><span className="approval-expiry">Expires in {toolApproval.expires_in_seconds}s</span></div>
          <p>The backend approval is bound to this discovered tool and these exact JSON arguments.</p>
          <div className="call-preview"><span>{toolApproval.tool_name}</span><pre>{pretty(toolApproval.arguments)}</pre></div>
          <div className="approval-actions"><button className="button-primary" type="button" disabled={busy} onClick={approveTool}>Approve and execute</button><button className="button-secondary" type="button" disabled={busy} onClick={() => setToolApproval(null)}>Deny</button></div>
        </section>
      )}

      {result && (
        <section className={result.is_error ? "playground-card result-card result-error" : "playground-card result-card"} aria-live="polite">
          <div className="playground-card-heading"><div><span className="playground-step">04</span><h2>{result.is_error ? "Tool returned an error" : "Actual tool result"}</h2></div><span className="playground-caption">{result.tool_name}</span></div>
          <pre>{pretty(result.structured_content ?? result.content)}</pre>
        </section>
      )}

      <p className="playground-footnote">The demo server performs no external network, filesystem, or credential access. Disconnect ends its local MCP session.</p>
    </div>
  );
}
