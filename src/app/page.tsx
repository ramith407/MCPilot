import Link from "next/link";
import { Icon } from "@/components/icon";

const workflow = [
  { number: "01", title: "Define", description: "Describe your MCP server", icon: "builder" as const },
  { number: "02", title: "Compile", description: "Shape config per client", icon: "compiler" as const },
  { number: "03", title: "Test", description: "Check the connection", icon: "playground" as const },
  { number: "04", title: "Diagnose", description: "Find what needs fixing", icon: "doctor" as const },
];

const targets = ["Claude Code", "Cursor", "VS Code"];

export default function OverviewPage() {
  return (
    <div className="content-wrap overview-page">
      <div className="page-kicker"><span className="kicker-line" /> DEVELOPER WORKSPACE <span className="kicker-separator">/</span> OVERVIEW</div>

      <section className="hero-section">
        <div className="hero-copy">
          <div className="release-label"><span className="release-dot" /> MCP INTEGRATION TOOLKIT</div>
          <h1>One server definition.<br /><span>Every client in sync.</span></h1>
          <p className="hero-description">
            MCPilot gives your MCP servers one clear source of truth. Define once,
            prepare client-ready configurations, and troubleshoot from the same workspace.
          </p>
          <div className="hero-actions">
            <Link href="/builder" className="button-primary">
              Start an integration <Icon name="arrow" />
            </Link>
            <a className="button-quiet" href="#workflow">See how it works <span aria-hidden="true">↓</span></a>
          </div>
          <div className="hero-footnote"><span className="footnote-check"><Icon name="check" /></span> Local-first by design <span className="footnote-divider" /> No account or cloud service needed</div>
        </div>

        <div className="definition-visual" aria-label="Illustrative MCP server definition and client configuration flow">
          <div className="visual-grid code-grid" />
          <div className="definition-window soft-shadow">
            <div className="window-topline">
              <div className="window-file"><span className="file-glyph">&#123; &#125;</span><span>server.definition.json</span></div>
              <span className="example-badge">EXAMPLE</span>
            </div>
            <div className="definition-code" aria-label="Example MCP server configuration">
              <div className="code-line"><span className="syntax-brace">&#123;</span></div>
              <div className="code-line code-indent"><span className="syntax-key">&quot;mcpServers&quot;</span><span className="syntax-punctuation">: &#123;</span></div>
              <div className="code-line code-indent-more"><span className="syntax-key">&quot;filesystem&quot;</span><span className="syntax-punctuation">: &#123;</span></div>
              <div className="code-line code-indent-deep"><span className="syntax-key">&quot;command&quot;</span><span className="syntax-punctuation">: </span><span className="syntax-string">&quot;npx&quot;</span><span className="syntax-punctuation">,</span></div>
              <div className="code-line code-indent-deep"><span className="syntax-key">&quot;args&quot;</span><span className="syntax-punctuation">: [</span></div>
              <div className="code-line code-indent-max"><span className="syntax-string">&quot;-y&quot;</span><span className="syntax-punctuation">,</span></div>
              <div className="code-line code-indent-max"><span className="syntax-string">&quot;@modelcontextprotocol/server-filesystem&quot;</span><span className="syntax-punctuation">,</span></div>
              <div className="code-line code-indent-max"><span className="syntax-string">&quot;./workspace&quot;</span></div>
              <div className="code-line code-indent-deep"><span className="syntax-punctuation">],</span></div>
              <div className="code-line code-indent-deep"><span className="syntax-key">&quot;env&quot;</span><span className="syntax-punctuation">: &#123;&#125;</span></div>
              <div className="code-line code-indent-more"><span className="syntax-brace">&#125;</span></div>
              <div className="code-line code-indent"><span className="syntax-brace">&#125;</span></div>
              <div className="code-line"><span className="syntax-brace">&#125;</span></div>
            </div>
            <div className="window-footer"><span><span className="tiny-status-dot" /> EXAMPLE ONLY</span><span>JSON</span></div>
          </div>
          <div className="flow-connector" aria-hidden="true"><span /><span /><span /></div>
          <div className="client-output soft-shadow">
            <div className="output-topline"><span className="output-icon"><Icon name="compiler" /></span><span>Client-ready config</span></div>
            <div className="output-targets">
              {targets.map((target) => <span key={target} className="output-target"><Icon name="check" />{target}</span>)}
            </div>
            <div className="output-caption">Illustrative targets · Nothing has been compiled</div>
          </div>
          <div className="visual-caption"><span>01</span> A portable definition at the center of your workflow</div>
        </div>
      </section>

      <section className="workflow-section" id="workflow" aria-labelledby="workflow-heading">
        <div className="section-heading-row">
          <div>
            <p className="section-eyebrow">A CLEAR PATH FROM SERVER TO SESSION</p>
            <h2 id="workflow-heading">The MCPilot workflow</h2>
          </div>
          <span className="workflow-note"><span className="workflow-note-dot" /> Four steps, one workspace</span>
        </div>
        <div className="workflow-track">
          {workflow.map((step, index) => (
            <div className="workflow-step" key={step.number}>
              <div className="step-icon-wrap"><Icon name={step.icon} /></div>
              <div className="step-copy">
                <span className="step-number">{step.number} <span className="step-divider">/</span> 04</span>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
              {index < workflow.length - 1 && <span className="step-connector" aria-hidden="true"><Icon name="arrow" /></span>}
            </div>
          ))}
        </div>
        <div className="workflow-bottomline"><span>This workspace is being built one step at a time.</span><Link href="/builder">Go to Integration Builder <Icon name="arrow" /></Link></div>
      </section>
    </div>
  );
}
