"use client";

import { useState, useCallback, useRef } from "react";
import { Icon } from "@/components/icon";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CheckStatus = "passed" | "warning" | "failed";
type ScenarioType = "broken" | "working";

interface FixDetail {
  whatWentWrong: string;
  whyItHappened: string;
  howToFix: string;
  fixSnippet?: string;
}

interface DiagnosticCheck {
  id: string;
  name: string;
  category: "SCHEMA" | "ENVIRONMENT" | "TRANSPORT" | "RUNTIME";
  status: CheckStatus;
  description: string;
  fix?: FixDetail;
}

type ToastState = { message: string; type: "success" | "error" } | null;

// ---------------------------------------------------------------------------
// Deterministic Mock Data
// ---------------------------------------------------------------------------

const BROKEN_CHECKS: DiagnosticCheck[] = [
  {
    id: "check-syntax",
    name: "Configuration Syntax",
    category: "SCHEMA",
    status: "passed",
    description: "Configuration syntax is valid JSON and adheres to MCP schema specifications.",
  },
  {
    id: "check-required-fields",
    name: "Required Fields",
    category: "SCHEMA",
    status: "passed",
    description: "All required fields (command, transport, and server identifier) are present.",
  },
  {
    id: "check-transport",
    name: "Transport Configuration",
    category: "TRANSPORT",
    status: "passed",
    description: "STDIO transport is configured and channel communication parameters are standard.",
  },
  {
    id: "check-command",
    name: "Command Availability",
    category: "RUNTIME",
    status: "failed",
    description: "The configured command could not be found in this example scenario.",
    fix: {
      whatWentWrong: "The configured executable command 'npx' could not be located in your system environment PATH.",
      whyItHappened: "The process was launched without Node.js binaries in the PATH variable, or Node.js is not installed in the execution environment.",
      howToFix: "Install Node.js (version 20 or later), verify 'npx' is accessible from your terminal, or specify the absolute binary path in your server definition.",
      fixSnippet: "# 1. Verify Node and npx are installed in your shell:\nnode --version\nnpx --version\n\n# 2. Or install Node.js via your package manager or nvm:\n# https://nodejs.org/en/download\n\n# 3. If npx is in a custom path, use the absolute path in command:\n# e.g., /usr/local/bin/npx or C:\\Program Files\\nodejs\\npx.cmd",
    },
  },
  {
    id: "check-env-vars",
    name: "Environment Variables",
    category: "ENVIRONMENT",
    status: "warning",
    description: "One optional environment variable has not been configured.",
    fix: {
      whatWentWrong: "Recommended environment variable 'WORKSPACE_ROOT' is missing from the server configuration.",
      whyItHappened: "Without 'WORKSPACE_ROOT', the server falls back to the current working directory, which may expose unintended parent directory paths.",
      howToFix: "Define 'WORKSPACE_ROOT' inside the 'env' object to explicitly restrict the server to your designated workspace directory.",
      fixSnippet: '{\n  "mcpServers": {\n    "filesystem": {\n      "env": {\n        "WORKSPACE_ROOT": "./workspace"\n      }\n    }\n  }\n}',
    },
  },
  {
    id: "check-server-connection",
    name: "Server Connection",
    category: "RUNTIME",
    status: "passed",
    description: "Sample connection check completed successfully via local STDIO pipe.",
  },
  {
    id: "check-tool-discovery",
    name: "Tool Discovery",
    category: "RUNTIME",
    status: "passed",
    description: "Two tools were discovered in the demo scenario (read_file, list_directory).",
  },
  {
    id: "check-tool-execution",
    name: "Tool Execution",
    category: "RUNTIME",
    status: "passed",
    description: "Sample tool execution completed with valid response payload.",
  },
];

const WORKING_CHECKS: DiagnosticCheck[] = [
  {
    id: "check-syntax",
    name: "Configuration Syntax",
    category: "SCHEMA",
    status: "passed",
    description: "Configuration syntax is valid JSON and strictly adheres to MCP schema specifications.",
  },
  {
    id: "check-required-fields",
    name: "Required Fields",
    category: "SCHEMA",
    status: "passed",
    description: "All required fields (command, transport, and server identifier) are present and verified.",
  },
  {
    id: "check-transport",
    name: "Transport Configuration",
    category: "TRANSPORT",
    status: "passed",
    description: "STDIO transport is correctly configured with standard input/output stream pipes.",
  },
  {
    id: "check-command",
    name: "Command Availability",
    category: "RUNTIME",
    status: "passed",
    description: "The command 'npx' was located successfully in the system environment PATH (v20.9.0).",
  },
  {
    id: "check-env-vars",
    name: "Environment Variables",
    category: "ENVIRONMENT",
    status: "passed",
    description: "All required and recommended environment variables ('WORKSPACE_ROOT') are configured.",
  },
  {
    id: "check-server-connection",
    name: "Server Connection",
    category: "RUNTIME",
    status: "passed",
    description: "Sample server handshake and connection test completed with 0 ms latency.",
  },
  {
    id: "check-tool-discovery",
    name: "Tool Discovery",
    category: "RUNTIME",
    status: "passed",
    description: "All advertised server tools were successfully parsed and validated by client schema.",
  },
  {
    id: "check-tool-execution",
    name: "Tool Execution",
    category: "RUNTIME",
    status: "passed",
    description: "Sample tool execution completed with valid JSON response payload.",
  },
];

// ---------------------------------------------------------------------------
// Toast Notification Component
// ---------------------------------------------------------------------------

function Toast({ message, type }: { message: string; type: "success" | "error" }) {
  return (
    <div className={`doc-toast doc-toast-${type}`} role="alert" aria-live="polite">
      <span className="doc-toast-icon">
        {type === "success" ? <Icon name="check" /> : <Icon name="close" />}
      </span>
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function DoctorClient() {
  const [scenario, setScenario] = useState<ScenarioType>("broken");
  const [checks, setChecks] = useState<DiagnosticCheck[]>(BROKEN_CHECKS);
  const [running, setRunning] = useState(false);
  const [expandedFixes, setExpandedFixes] = useState<Record<string, boolean>>({
    "check-command": true, // Default open the failed fix for immediate visibility
  });
  const [toast, setToast] = useState<ToastState>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    setToast({ message, type });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  // Compute live summary metrics
  const totalChecks = checks.length;
  const passedChecks = checks.filter((c) => c.status === "passed").length;
  const warningChecks = checks.filter((c) => c.status === "warning").length;
  const failedChecks = checks.filter((c) => c.status === "failed").length;

  const toggleFix = (id: string) => {
    setExpandedFixes((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Switch scenario (Working vs Broken)
  const handleSelectScenario = (newScenario: ScenarioType) => {
    if (newScenario === scenario) return;
    setScenario(newScenario);
    const targetChecks = newScenario === "working" ? WORKING_CHECKS : BROKEN_CHECKS;
    setChecks(targetChecks);
    if (newScenario === "working") {
      setExpandedFixes({});
      showToast("Loaded Working Configuration: all 8 checks passed.");
    } else {
      setExpandedFixes({ "check-command": true });
      showToast("Loaded Broken Configuration: 1 failed check, 1 warning.");
    }
  };

  // Run Diagnostics with simulated loading animation
  const handleRunDiagnostics = () => {
    setRunning(true);
    setTimeout(() => {
      const targetChecks = scenario === "working" ? WORKING_CHECKS : BROKEN_CHECKS;
      setChecks([...targetChecks]);
      setRunning(false);
      if (scenario === "working") {
        showToast("Diagnostics complete: all 8 checks passed successfully.");
      } else {
        showToast("Diagnostics complete: 1 failed check, 1 warning detected.");
      }
    }, 650);
  };

  const handleCopySnippet = async (snippet: string) => {
    try {
      await navigator.clipboard.writeText(snippet);
      showToast("Fix snippet copied to clipboard.");
    } catch {
      showToast("Could not copy snippet to clipboard.", "error");
    }
  };

  return (
    <div className="content-wrap doc-page">
      {toast && <Toast message={toast.message} type={toast.type} />}

      {/* ── Page Header ── */}
      <div className="page-kicker">
        <span className="kicker-line" /> MCP WORKFLOW{" "}
        <span className="kicker-separator">/</span> DIAGNOSE
      </div>

      <div className="doc-page-heading">
        <div>
          <div className="section-stage-label">STEP 04 <span>/</span> 04</div>
          <h1>MCP Doctor</h1>
          <p>
            Identify configuration issues and understand how to fix them.
          </p>
        </div>
        <div className="doc-heading-actions">
          <span className="doc-demo-chip">
            <Icon name="spark" /> Demo diagnostics — simulated results
          </span>
        </div>
      </div>

      {/* ── Scenario Selector Bar ── */}
      <div className="doc-scenario-bar">
        <div className="doc-scenario-group">
          <span className="doc-scenario-label">DIAGNOSTIC SCENARIO</span>
          <div className="doc-scenario-toggle" role="group" aria-label="Configuration Scenario">
            <button
              type="button"
              className={`doc-scenario-btn${scenario === "broken" ? " doc-scenario-btn-active" : ""}`}
              onClick={() => handleSelectScenario("broken")}
              aria-pressed={scenario === "broken"}
            >
              <span className="doc-scenario-dot doc-scenario-dot-broken" />
              Broken Configuration
              <span className="doc-scenario-tag">Issues Found</span>
            </button>
            <button
              type="button"
              className={`doc-scenario-btn${scenario === "working" ? " doc-scenario-btn-active" : ""}`}
              onClick={() => handleSelectScenario("working")}
              aria-pressed={scenario === "working"}
            >
              <span className="doc-scenario-dot doc-scenario-dot-working" />
              Working Configuration
              <span className="doc-scenario-tag doc-scenario-tag-ok">Healthy</span>
            </button>
          </div>
        </div>

        <div className="doc-scenario-actions">
          <button
            type="button"
            className={`doc-btn-run${running ? " doc-btn-running" : ""}`}
            onClick={handleRunDiagnostics}
            disabled={running}
          >
            {running ? (
              <>
                <span className="doc-spinner" aria-hidden="true" />
                Running Diagnostics…
              </>
            ) : (
              <>
                <Icon name="doctor" />
                Run Diagnostics
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Summary Metrics ── */}
      <div className="doc-metrics-grid">
        <div className="doc-metric-card">
          <div className="doc-metric-header">
            <span className="doc-metric-label">TOTAL CHECKS</span>
            <span className="doc-metric-badge doc-badge-neutral">{totalChecks}</span>
          </div>
          <div className="doc-metric-value">{totalChecks}</div>
          <div className="doc-metric-sub">Full system verification</div>
        </div>

        <div className="doc-metric-card">
          <div className="doc-metric-header">
            <span className="doc-metric-label">PASSED</span>
            <span className="doc-metric-badge doc-badge-success">
              <Icon name="check" /> OK
            </span>
          </div>
          <div className="doc-metric-value doc-value-success">{passedChecks}</div>
          <div className="doc-metric-sub">Checks verified successfully</div>
        </div>

        <div className="doc-metric-card">
          <div className="doc-metric-header">
            <span className="doc-metric-label">WARNINGS</span>
            <span className="doc-metric-badge doc-badge-warning">! Review</span>
          </div>
          <div className="doc-metric-value doc-value-warning">{warningChecks}</div>
          <div className="doc-metric-sub">Non-blocking recommendations</div>
        </div>

        <div className="doc-metric-card">
          <div className="doc-metric-header">
            <span className="doc-metric-label">FAILED</span>
            <span className="doc-metric-badge doc-badge-failed">× Attention</span>
          </div>
          <div className="doc-metric-value doc-value-failed">{failedChecks}</div>
          <div className="doc-metric-sub">Action required to connect</div>
        </div>
      </div>

      {/* ── Diagnostic Results Section ── */}
      <div className="doc-results-card">
        <div className="doc-results-header">
          <div className="doc-results-title">
            <span className="doc-results-icon"><Icon name="doctor" /></span>
            Diagnostic Results
          </div>
          <div className="doc-results-meta">
            <span>Server: <strong>filesystem-server</strong></span>
            <span className="doc-meta-separator">•</span>
            <span>Scenario: <strong>{scenario === "broken" ? "Broken Configuration" : "Working Configuration"}</strong></span>
            <span className="doc-meta-separator">•</span>
            <span>Target: <strong>Cursor / STDIO</strong></span>
          </div>
        </div>

        <div className="doc-checklist">
          {checks.map((check, index) => {
            const isExpanded = !!expandedFixes[check.id];
            const hasFix = (check.status === "warning" || check.status === "failed") && !!check.fix;

            return (
              <div
                key={check.id}
                className={`doc-check-item doc-check-${check.status}${isExpanded ? " doc-check-expanded" : ""}`}
              >
                <div className="doc-check-main">
                  <div className="doc-check-left">
                    <span className="doc-check-num">{String(index + 1).padStart(2, "0")}</span>
                    <span className={`doc-status-icon doc-status-icon-${check.status}`}>
                      {check.status === "passed" && <Icon name="check" />}
                      {check.status === "warning" && <span className="doc-symbol">!</span>}
                      {check.status === "failed" && <span className="doc-symbol">×</span>}
                    </span>
                    <div className="doc-check-info">
                      <div className="doc-check-name-row">
                        <span className="doc-check-name">{check.name}</span>
                        <span className="doc-check-category">{check.category}</span>
                      </div>
                      <p className="doc-check-desc">{check.description}</p>
                    </div>
                  </div>

                  <div className="doc-check-right">
                    <span className={`doc-status-chip doc-chip-${check.status}`}>
                      <span className="doc-chip-dot" />
                      {check.status === "passed" && "Passed"}
                      {check.status === "warning" && "Warning"}
                      {check.status === "failed" && "Failed"}
                    </span>

                    {hasFix && (
                      <button
                        type="button"
                        className={`doc-btn-fix${isExpanded ? " doc-btn-fix-active" : ""}`}
                        onClick={() => toggleFix(check.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? "Hide Fix" : "View Fix"}
                        <span className="doc-fix-arrow" aria-hidden="true">
                          <Icon name="arrow" />
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Fix detail drawer with 3 structured parts: What went wrong, Why it happened, How to fix it */}
                {hasFix && isExpanded && check.fix && (
                  <div className="doc-fix-panel">
                    <div className="doc-fix-topbar">
                      <div className="doc-fix-heading">
                        <span className="doc-fix-bulb"><Icon name="spark" /></span>
                        Suggested Fix & Diagnosis
                      </div>
                      {check.fix.fixSnippet && (
                        <button
                          type="button"
                          className="doc-btn-copy-fix"
                          onClick={() => handleCopySnippet(check.fix!.fixSnippet!)}
                        >
                          <Icon name="external" />
                          Copy Solution
                        </button>
                      )}
                    </div>

                    <div className="doc-fix-sections">
                      {/* 1. What went wrong */}
                      <div className="doc-fix-section">
                        <div className="doc-fix-sec-label">
                          <span className="doc-fix-sec-dot doc-sec-dot-red" />
                          What went wrong
                        </div>
                        <p className="doc-fix-sec-text">{check.fix.whatWentWrong}</p>
                      </div>

                      {/* 2. Why it happened */}
                      <div className="doc-fix-section">
                        <div className="doc-fix-sec-label">
                          <span className="doc-fix-sec-dot doc-sec-dot-amber" />
                          Why it happened
                        </div>
                        <p className="doc-fix-sec-text">{check.fix.whyItHappened}</p>
                      </div>

                      {/* 3. How to fix it */}
                      <div className="doc-fix-section">
                        <div className="doc-fix-sec-label">
                          <span className="doc-fix-sec-dot doc-sec-dot-blue" />
                          How to fix it
                        </div>
                        <p className="doc-fix-sec-text">{check.fix.howToFix}</p>
                      </div>
                    </div>

                    {check.fix.fixSnippet && (
                      <div className="doc-fix-code-wrap">
                        <div className="doc-fix-code-top">
                          <span>RECOMMENDED FIX SNIPPET</span>
                        </div>
                        <pre className="doc-fix-code">
                          <code>{check.fix.fixSnippet}</code>
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="doc-results-footer">
          <span className="doc-results-note">
            <Icon name="spark" />
            Simulated diagnostic environment · No live server connection executed
          </span>
          <button
            type="button"
            className="doc-btn-rerun"
            onClick={handleRunDiagnostics}
            disabled={running}
          >
            Re-run Diagnostics
          </button>
        </div>
      </div>

      {/* ── Workflow navigation ── */}
      <div className="doc-nav-row">
        <a href="/compiler" className="text-link">
          <span aria-hidden="true">←</span> Config Compiler
        </a>
        <a href="/playground" className="text-link">
          Playground <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}
