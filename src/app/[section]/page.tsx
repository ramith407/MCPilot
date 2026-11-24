import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/icon";

const sections = {
  builder: {
    number: "01",
    label: "Integration Builder",
    eyebrow: "DEFINE",
    description: "Create a portable definition for the MCP server you want to use.",
    previous: { href: "/", label: "Overview" },
    next: { href: "/compiler", label: "Config Compiler" },
  },
  compiler: {
    number: "02",
    label: "Config Compiler",
    eyebrow: "COMPILE",
    description: "Prepare one server definition for the AI coding clients in your workflow.",
    previous: { href: "/builder", label: "Integration Builder" },
    next: { href: "/playground", label: "Playground" },
  },
  playground: {
    number: "03",
    label: "Playground",
    eyebrow: "TEST",
    description: "Check an MCP connection and inspect how a server responds.",
    previous: { href: "/compiler", label: "Config Compiler" },
    next: { href: "/doctor", label: "MCP Doctor" },
  },
  doctor: {
    number: "04",
    label: "MCP Doctor",
    eyebrow: "DIAGNOSE",
    description: "Find and understand issues that prevent an MCP server from connecting.",
    previous: { href: "/playground", label: "Playground" },
    next: { href: "/", label: "Overview" },
  },
} as const;

type SectionKey = keyof typeof sections;

export function generateStaticParams() {
  return Object.keys(sections).map((section) => ({ section }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}): Promise<Metadata> {
  const { section } = await params;
  if (!Object.hasOwn(sections, section)) return { title: "Not found" };
  return { title: sections[section as SectionKey].label };
}

export default async function SectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(sections, section)) notFound();
  const item = sections[section as SectionKey];

  return (
    <div className="content-wrap section-page">
      <div className="page-kicker"><span className="kicker-line" /> MCP WORKFLOW <span className="kicker-separator">/</span> {item.eyebrow}</div>
      <div className="section-page-heading">
        <div>
          <div className="section-stage-label">STEP {item.number} <span>/</span> 04</div>
          <h1>{item.label}</h1>
          <p>{item.description}</p>
        </div>
        <span className="not-ready-chip"><span /> NOT IMPLEMENTED</span>
      </div>

      <div className="section-empty-state">
        <div className="empty-state-icon"><Icon name={section === "builder" ? "builder" : section === "compiler" ? "compiler" : section === "playground" ? "playground" : "doctor"} /></div>
        <p className="empty-state-eyebrow">WORKSPACE STAGE {item.number}</p>
        <h2>This tool is not implemented yet.</h2>
        <p className="empty-state-description">MCPilot is being built incrementally. This section will become available when its functionality is ready.</p>
        <div className="empty-state-rule" />
        <div className="empty-state-footer">
          <Link href={item.previous.href} className="text-link"><span aria-hidden="true">←</span> {item.previous.label}</Link>
          <Link href={item.next.href} className="text-link">{item.next.label} <span aria-hidden="true">→</span></Link>
        </div>
      </div>

      <div className="section-sequence-note"><Icon name="spark" /> Navigation is ready. This workflow stage has no active tools yet.</div>
    </div>
  );
}
