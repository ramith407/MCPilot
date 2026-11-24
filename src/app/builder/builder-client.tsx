"use client";

import { useState, useCallback, useRef } from "react";
import { parse as yamlParse } from "yaml";
import { Icon } from "@/components/icon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EnvVar {
  id: string;
  key: string;
  value: string;
}

interface FormState {
  name: string;
  description: string;
  transport: "stdio" | "http";
  command: string;
  args: string;
  envVars: EnvVar[];
}

type ViewMode = "json" | "yaml";

type ToastState = { message: string; type: "success" | "error" } | null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(): string {
  return Math.random().toString(36).slice(2, 9);
}

const DEFAULT_FORM: FormState = {
  name: "Filesystem Server",
  description: "Allows an AI client to interact with a local filesystem.",
  transport: "stdio",
  command: "npx",
  args: "-y @modelcontextprotocol/server-filesystem ./workspace",
  envVars: [{ id: "init-0", key: "WORKSPACE_ROOT", value: "./workspace" }],
};

// ---- serialisers ----

function serverKey(form: FormState): string {
  return form.name ? form.name.toLowerCase().replace(/\s+/g, "-") : "my-server";
}

function buildJsonPreview(form: FormState): string {
  const argArray = form.args.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const envObj: Record<string, string> = {};
  for (const ev of form.envVars) {
    if (ev.key.trim()) envObj[ev.key.trim()] = ev.value;
  }
  const obj = {
    mcpServers: {
      [serverKey(form)]: {
        ...(form.description ? { description: form.description } : {}),
        transport: form.transport,
        command: form.command || "npx",
        args: argArray,
        env: envObj,
      },
    },
  };
  return JSON.stringify(obj, null, 2);
}

function buildYaml(form: FormState): string {
  const argArray = form.args.split(/\s+/).map((s) => s.trim()).filter(Boolean);
  const key = serverKey(form);
  const lines: string[] = ["mcpServers:", `  ${key}:`];
  if (form.description) lines.push(`    description: "${form.description}"`);
  lines.push(`    transport: ${form.transport}`);
  lines.push(`    command: ${form.command || "npx"}`);
  if (argArray.length) {
    lines.push("    args:");
    for (const a of argArray) lines.push(`      - ${a}`);
  }
  const envEntries = form.envVars.filter((e) => e.key.trim());
  if (envEntries.length) {
    lines.push("    env:");
    for (const e of envEntries) lines.push(`      ${e.key.trim()}: "${e.value}"`);
  }
  return lines.join("\n");
}

// ---- YAML → FormState ----

interface ParseResult {
  form: FormState | null;
  error: string | null;
}

function parseYamlToForm(text: string): ParseResult {
  if (!text.trim()) return { form: null, error: "YAML is empty." };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = yamlParse(text) as any;
    if (!doc || typeof doc !== "object")
      return { form: null, error: "YAML did not parse to an object." };
    if (!doc.mcpServers || typeof doc.mcpServers !== "object")
      return { form: null, error: 'Missing required key "mcpServers".' };

    const keys = Object.keys(doc.mcpServers);
    if (!keys.length)
      return { form: null, error: "No server entries found under mcpServers." };

    const key = keys[0];
    const srv = doc.mcpServers[key] ?? {};

    const rawArgs = srv.args;
    const argsStr = Array.isArray(rawArgs)
      ? rawArgs.join(" ")
      : typeof rawArgs === "string"
      ? rawArgs
      : "";

    const rawEnv = srv.env;
    const envVars: EnvVar[] =
      rawEnv && typeof rawEnv === "object"
        ? Object.entries(rawEnv).map(([k, v]) => ({
            id: uid(),
            key: k,
            value: String(v ?? ""),
          }))
        : [];

    const transport =
      String(srv.transport ?? "stdio") === "http" ? "http" : "stdio";

    return {
      form: {
        name: key.replace(/-/g, " "),
        description: String(srv.description ?? ""),
        transport,
        command: String(srv.command ?? ""),
        args: argsStr,
        envVars,
      },
      error: null,
    };
  } catch (err) {
    return {
      form: null,
      error: err instanceof Error ? err.message : "Invalid YAML.",
    };
  }
}

// ---------------------------------------------------------------------------
// Syntax highlighting (JSON read-only pane)
// ---------------------------------------------------------------------------

type TokenKind = "brace" | "bracket" | "punct" | "num" | "key" | "str" | "plain";
interface Token { kind: TokenKind; text: string }

function tokenizeJsonLine(line: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      let j = i + 1;
      while (j < line.length && !(line[j] === '"' && line[j - 1] !== "\\")) j++;
      const raw = line.slice(i, j + 1);
      const rest = line.slice(j + 1).trimStart();
      tokens.push({ kind: rest.startsWith(":") ? "key" : "str", text: raw });
      i = j + 1;
      continue;
    }
    if ("{}".includes(line[i])) { tokens.push({ kind: "brace", text: line[i] }); i++; continue; }
    if ("[]".includes(line[i])) { tokens.push({ kind: "bracket", text: line[i] }); i++; continue; }
    const nm = line.slice(i).match(/^-?\d+(\.\d+)?/);
    if (nm) { tokens.push({ kind: "num", text: nm[0] }); i += nm[0].length; continue; }
    if (":,".includes(line[i])) { tokens.push({ kind: "punct", text: line[i] }); i++; continue; }
    const sp = line.slice(i).search(/\S/);
    if (sp === -1) { tokens.push({ kind: "plain", text: line.slice(i) }); break; }
    if (sp > 0) { tokens.push({ kind: "plain", text: line.slice(i, i + sp) }); i += sp; }
    else { tokens.push({ kind: "plain", text: line[i] }); i++; }
  }
  return tokens;
}

function HighlightedJson({ code }: { code: string }) {
  return (
    <code className="bld-code-block">
      {code.split("\n").map((line, idx) => (
        <div key={idx} className="bld-code-row">
          <span className="bld-code-ln">{String(idx + 1).padStart(2, "0")}</span>
          <span className="bld-code-line">
            {tokenizeJsonLine(line).map((tok, ti) => (
              <span key={ti} className={`bld-tok bld-tok-${tok.kind}`}>{tok.text}</span>
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
    <div className={`bld-toast bld-toast-${type}`} role="alert" aria-live="polite">
      <span className="bld-toast-icon">
        {type === "success" ? <Icon name="check" /> : <Icon name="close" />}
      </span>
      {message}
    </div>
  );
}

function FormField({
  label, hint, children, required,
}: {
  label: string; hint?: string; children: React.ReactNode; required?: boolean;
}) {
  return (
    <div className="bld-field">
      <label className="bld-label">
        {label}
        {required && <span className="bld-required"> *</span>}
      </label>
      {hint && <p className="bld-hint">{hint}</p>}
      {children}
    </div>
  );
}

function EnvVarRow({
  ev, onChange, onRemove,
}: {
  ev: EnvVar;
  onChange: (id: string, field: "key" | "value", val: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="bld-env-row">
      <input
        className="bld-input bld-env-key bld-mono"
        placeholder="KEY"
        value={ev.key}
        onChange={(e) => onChange(ev.id, "key", e.target.value)}
        spellCheck={false}
      />
      <span className="bld-env-sep">=</span>
      <input
        className="bld-input bld-env-val bld-mono"
        placeholder="value"
        value={ev.value}
        onChange={(e) => onChange(ev.id, "value", e.target.value)}
        spellCheck={false}
      />
      <button
        type="button"
        className="bld-env-remove"
        aria-label="Remove environment variable"
        onClick={() => onRemove(ev.id)}
      >
        <Icon name="close" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Preview / YAML editor panel
// ---------------------------------------------------------------------------

interface PreviewPanelProps {
  form: FormState;
  viewMode: ViewMode;
  yamlText: string;
  yamlError: string | null;
  copied: boolean;
  onViewMode: (m: ViewMode) => void;
  onYamlChange: (text: string) => void;
  onCopy: (text: string) => void;
  onApplyYaml: () => void;
}

function PreviewPanel({
  form, viewMode, yamlText, yamlError,
  copied, onViewMode, onYamlChange, onCopy, onApplyYaml,
}: PreviewPanelProps) {
  const isJson = viewMode === "json";
  const copyText = isJson ? buildJsonPreview(form) : yamlText;
  const lineCount = yamlText.split("\n").length;

  return (
    <div className="bld-preview-panel">
      {/* Top bar */}
      <div className="bld-preview-topbar">
        <div className="bld-preview-title">
          <span className="bld-preview-file-icon"><Icon name="compiler" /></span>
          Configuration Preview
        </div>
        <div className="bld-preview-controls">
          <div className="bld-view-toggle" role="group" aria-label="View format">
            <button
              type="button"
              className={`bld-toggle-btn${isJson ? " bld-toggle-active" : ""}`}
              onClick={() => onViewMode("json")}
              aria-pressed={isJson}
            >
              JSON
            </button>
            <button
              type="button"
              className={`bld-toggle-btn${!isJson ? " bld-toggle-active" : ""}`}
              onClick={() => onViewMode("yaml")}
              aria-pressed={!isJson}
            >
              YAML
            </button>
          </div>
          <button
            type="button"
            className={`bld-copy-btn${copied ? " bld-copy-success" : ""}`}
            onClick={() => onCopy(copyText)}
            title="Copy to clipboard"
          >
            {copied ? <Icon name="check" /> : <Icon name="external" />}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="bld-code-editor">
        {isJson ? (
          /* JSON — read-only, syntax-highlighted */
          <HighlightedJson code={buildJsonPreview(form)} />
        ) : (
          /* YAML — editable textarea with line-number gutter */
          <div className="bld-yaml-editor-wrap">
            <div className="bld-yaml-gutter" aria-hidden="true">
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className="bld-code-ln">{String(i + 1).padStart(2, "0")}</div>
              ))}
            </div>
            <textarea
              className="bld-yaml-textarea"
              value={yamlText}
              onChange={(e) => onYamlChange(e.target.value)}
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              aria-label="Editable YAML configuration"
            />
          </div>
        )}
      </div>

      {/* YAML: error banner + apply button */}
      {!isJson && (
        <div className="bld-yaml-actions">
          {yamlError ? (
            <span className="bld-yaml-error-msg">
              <Icon name="doctor" /> {yamlError}
            </span>
          ) : (
            <span className="bld-yaml-ok-msg">
              <Icon name="check" /> Valid YAML
            </span>
          )}
          <button
            type="button"
            className="bld-btn-apply"
            onClick={onApplyYaml}
            disabled={!!yamlError}
            title={yamlError ? "Fix YAML errors first" : "Apply YAML changes to the form"}
          >
            <Icon name="arrow" /> Apply to Form
          </button>
        </div>
      )}

      {/* Footer */}
      <div className="bld-preview-footer">
        <span className="bld-preview-hint">
          <Icon name="spark" />
          {isJson
            ? "Preview updates as you type · Read-only"
            : "Edit YAML directly · Changes sync to form on Apply"}
        </span>
        <span className="bld-preview-lang">{isJson ? "JSON" : "YAML"}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main exported client component
// ---------------------------------------------------------------------------

export function BuilderClient() {
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [viewMode, setViewMode] = useState<ViewMode>("json");

  // YAML editor state — kept in sync when switching tabs
  const [yamlText, setYamlText] = useState<string>(() => buildYaml(DEFAULT_FORM));
  const [yamlError, setYamlError] = useState<string | null>(null);

  // UI state
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  // used to auto-dismiss toast
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Toast helper ──────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // ── Validation ────────────────────────────────────────────────────────────

  const validate = (f: FormState): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!f.name.trim()) errs.name = "Integration name is required.";
    if (!f.command.trim()) errs.command = "Command is required.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Form-field updates (always reflect instantly in JSON preview) ──────────

  const setField = <K extends keyof FormState>(key: K, val: FormState[K]) => {
    setForm((prev) => {
      const next = { ...prev, [key]: val };
      // keep yaml text in sync only when json tab is active
      if (viewMode === "json") setYamlText(buildYaml(next));
      return next;
    });
    setSaved(false);
    if (fieldErrors[key]) setFieldErrors((e) => ({ ...e, [key]: undefined }));
  };

  const addEnvVar = () => setForm((f) => {
    const next = { ...f, envVars: [...f.envVars, { id: uid(), key: "", value: "" }] };
    if (viewMode === "json") setYamlText(buildYaml(next));
    return next;
  });

  const updateEnvVar = (id: string, field: "key" | "value", val: string) =>
    setForm((f) => {
      const next = { ...f, envVars: f.envVars.map((e) => e.id === id ? { ...e, [field]: val } : e) };
      if (viewMode === "json") setYamlText(buildYaml(next));
      return next;
    });

  const removeEnvVar = (id: string) =>
    setForm((f) => {
      const next = { ...f, envVars: f.envVars.filter((e) => e.id !== id) };
      if (viewMode === "json") setYamlText(buildYaml(next));
      return next;
    });

  // ── Tab switching ─────────────────────────────────────────────────────────

  const handleViewMode = (mode: ViewMode) => {
    if (mode === viewMode) return;

    if (mode === "yaml") {
      // Entering YAML view: regenerate fresh YAML from current form
      const freshYaml = buildYaml(form);
      setYamlText(freshYaml);
      setYamlError(null);
    } else {
      // Leaving YAML view → try to apply pending edits to form
      if (yamlError) {
        showToast("Fix YAML errors before switching back to JSON view.", "error");
        return; // stay in yaml mode
      }
      const { form: parsed } = parseYamlToForm(yamlText);
      if (parsed) setForm(parsed);
    }
    setViewMode(mode);
  };

  // ── YAML textarea change ──────────────────────────────────────────────────

  const handleYamlChange = (text: string) => {
    setYamlText(text);
    setSaved(false);
    const { form: parsed, error } = parseYamlToForm(text);
    setYamlError(error);
    // Live-sync form silently (no form-errors reset) so the ref-card updates
    if (parsed) setForm(parsed);
  };

  // ── "Apply to Form" button ────────────────────────────────────────────────

  const handleApplyYaml = () => {
    const { form: parsed, error } = parseYamlToForm(yamlText);
    if (error || !parsed) {
      showToast("YAML is invalid — cannot apply to form.", "error");
      return;
    }
    setForm(parsed);
    setFieldErrors({});
    setSaved(false);
    showToast("YAML applied to form.");
    setViewMode("json"); // switch to JSON view to show the update
    setYamlText(buildYaml(parsed));
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSave = () => {
    // If in YAML mode, apply first
    if (viewMode === "yaml") {
      if (yamlError) {
        showToast("Fix YAML errors before saving.", "error");
        return;
      }
      const { form: parsed } = parseYamlToForm(yamlText);
      if (parsed) setForm(parsed);
    }
    const currentForm = viewMode === "yaml"
      ? (parseYamlToForm(yamlText).form ?? form)
      : form;
    if (!validate(currentForm)) {
      showToast("Please fix the highlighted errors before saving.", "error");
      return;
    }
    setSaved(true);
    showToast("Integration definition saved.");
  };

  // ── Reset ─────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setForm(DEFAULT_FORM);
    setYamlText(buildYaml(DEFAULT_FORM));
    setYamlError(null);
    setSaved(false);
    setFieldErrors({});
    if (viewMode === "yaml") setViewMode("json");
    showToast("Form reset to example values.");
  };

  // ── Copy ──────────────────────────────────────────────────────────────────

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast("Configuration copied to clipboard.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast("Could not access clipboard.", "error");
    }
  };

  // ── Short display of args for ref card ────────────────────────────────────

  const argTokens = form.args.split(/\s+/).filter(Boolean);
  const argsDisplay = argTokens.length > 2
    ? argTokens.slice(0, 2).join(", ") + " …"
    : argTokens.join(", ") || "—";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="content-wrap bld-page">
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ── Page header ── */}
      <div className="page-kicker">
        <span className="kicker-line" /> MCP WORKFLOW{" "}
        <span className="kicker-separator">/</span> DEFINE
      </div>

      <div className="bld-page-heading">
        <div>
          <div className="section-stage-label">
            STEP 01 <span>/</span> 04
          </div>
          <h1>Integration Builder</h1>
          <p>
            Define your MCP server in one place. The definition becomes the
            source of truth for the Config Compiler.
          </p>
        </div>
        <div className="bld-status-row">
          {saved && (
            <span className="bld-saved-chip">
              <Icon name="check" /> Saved
            </span>
          )}
          <span className="bld-demo-chip">
            <Icon name="spark" /> Local demo — not persisted
          </span>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="bld-layout">

        {/* ── LEFT: form ── */}
        <div className="bld-form-col">
          <div className="bld-card">
            <div className="bld-card-header">
              <span className="bld-card-icon"><Icon name="builder" /></span>
              <div>
                <h2 className="bld-card-title">Integration Details</h2>
                <p className="bld-card-subtitle">
                  Describe the MCP server you want to integrate.
                </p>
              </div>
            </div>

            <div className="bld-card-body">

              {/* Name */}
              <FormField label="Integration Name" required>
                <input
                  className={`bld-input${fieldErrors.name ? " bld-input-error" : ""}`}
                  value={form.name}
                  placeholder="e.g. Filesystem Server"
                  onChange={(e) => setField("name", e.target.value)}
                  spellCheck={false}
                />
                {fieldErrors.name && (
                  <span className="bld-error-msg" role="alert">{fieldErrors.name}</span>
                )}
              </FormField>

              {/* Description */}
              <FormField label="Description" hint="A short note about what this server does.">
                <textarea
                  className="bld-input bld-textarea"
                  value={form.description}
                  placeholder="e.g. Allows an AI client to interact with a local filesystem."
                  onChange={(e) => setField("description", e.target.value)}
                  rows={2}
                />
              </FormField>

              {/* Transport */}
              <FormField label="Transport" hint="How the client communicates with this server.">
                <div className="bld-radio-group">
                  {(["stdio", "http"] as const).map((t) => (
                    <label
                      key={t}
                      className={`bld-radio-option${form.transport === t ? " bld-radio-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="transport"
                        value={t}
                        checked={form.transport === t}
                        onChange={() => setField("transport", t)}
                        className="bld-radio-input"
                      />
                      <span className="bld-radio-mark" />
                      <span className="bld-radio-label">{t.toUpperCase()}</span>
                      <span className="bld-radio-note">
                        {t === "stdio" ? "Standard I/O — most common" : "HTTP streaming"}
                      </span>
                    </label>
                  ))}
                </div>
              </FormField>

              {/* Command */}
              <FormField label="Command" hint="The executable used to launch the server." required>
                <input
                  className={`bld-input bld-mono${fieldErrors.command ? " bld-input-error" : ""}`}
                  value={form.command}
                  placeholder="e.g. npx"
                  onChange={(e) => setField("command", e.target.value)}
                  spellCheck={false}
                />
                {fieldErrors.command && (
                  <span className="bld-error-msg" role="alert">{fieldErrors.command}</span>
                )}
              </FormField>

              {/* Arguments */}
              <FormField label="Arguments" hint="Space-separated arguments passed to the command.">
                <input
                  className="bld-input bld-mono"
                  value={form.args}
                  placeholder="e.g. -y @modelcontextprotocol/server-filesystem ./workspace"
                  onChange={(e) => setField("args", e.target.value)}
                  spellCheck={false}
                />
              </FormField>

              {/* Environment Variables */}
              <FormField
                label="Environment Variables"
                hint="Key-value pairs injected into the server process environment."
              >
                <div className="bld-env-list">
                  {form.envVars.length === 0 && (
                    <p className="bld-env-empty">No environment variables defined.</p>
                  )}
                  {form.envVars.map((ev) => (
                    <EnvVarRow key={ev.id} ev={ev} onChange={updateEnvVar} onRemove={removeEnvVar} />
                  ))}
                </div>
                <button type="button" className="bld-add-env-btn" onClick={addEnvVar}>
                  <Icon name="arrow" />
                  Add Environment Variable
                </button>
              </FormField>

            </div>

            {/* Footer actions */}
            <div className="bld-card-footer">
              <button type="button" className="bld-btn-secondary" onClick={handleReset}>
                Reset
              </button>
              <button type="button" className="bld-btn-primary" onClick={handleSave}>
                <Icon name="check" />
                Save Definition
              </button>
            </div>
          </div>

          {/* Nav row */}
          <div className="bld-nav-row">
            <a href="/" className="text-link">
              <span aria-hidden="true">←</span> Overview
            </a>
            <a href="/compiler" className="text-link">
              Config Compiler <span aria-hidden="true">→</span>
            </a>
          </div>
        </div>

        {/* ── RIGHT: preview + ref card ── */}
        <div className="bld-preview-col">
          <PreviewPanel
            form={form}
            viewMode={viewMode}
            yamlText={yamlText}
            yamlError={yamlError}
            copied={copied}
            onViewMode={handleViewMode}
            onYamlChange={handleYamlChange}
            onCopy={handleCopy}
            onApplyYaml={handleApplyYaml}
          />

          {/* Quick reference summary card */}
          <div className="bld-ref-card">
            <div className="bld-ref-header">
              <Icon name="doctor" />
              MCP Server Reference
            </div>
            <div className="bld-ref-grid">
              {[
                { label: "Name",      value: form.name || "—" },
                { label: "Transport", value: form.transport.toUpperCase() },
                { label: "Command",   value: form.command || "—", mono: true },
                { label: "Args",      value: argsDisplay,         mono: true },
                { label: "Env Vars",  value: `${form.envVars.filter((e) => e.key.trim()).length} defined` },
              ].map(({ label, value, mono }) => (
                <div key={label} className="bld-ref-row">
                  <span className="bld-ref-label">{label}</span>
                  <span className={`bld-ref-value${mono ? " bld-mono" : ""}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
