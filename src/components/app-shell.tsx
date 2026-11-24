"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";

const navigation: { label: string; href: string; icon: IconName }[] = [
  { label: "Overview", href: "/", icon: "overview" },
  { label: "Integration Builder", href: "/builder", icon: "builder" },
  { label: "Config Compiler", href: "/compiler", icon: "compiler" },
  { label: "MCP Doctor", href: "/doctor", icon: "doctor" },
  { label: "Playground", href: "/playground", icon: "playground" },
];

function Brand() {
  return (
    <Link href="/" className="brand-lockup" aria-label="MCPilot overview">
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="brand-name">MCP<span>ilot</span></span>
    </Link>
  );
}

function Navigation({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="primary-nav" aria-label="Main navigation">
      <p className="nav-label">WORKSPACE</p>
      {navigation.map((item) => {
        const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`nav-link${active ? " nav-link-active" : ""}`}
          >
            <Icon name={item.icon} className="nav-icon" />
            <span>{item.label}</span>
            {item.label === "Integration Builder" && <span className="nav-step">01</span>}
            {item.label === "Config Compiler" && <span className="nav-step">02</span>}
            {item.label === "Playground" && <span className="nav-step">03</span>}
            {item.label === "MCP Doctor" && <span className="nav-step">04</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function PathNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <Navigation pathname={pathname} onNavigate={onNavigate} />;
}

function Sidebar({
  mobile = false,
  onNavigate,
}: {
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <div className={`sidebar-inner${mobile ? " sidebar-inner-mobile" : ""}`}>
      <div className="sidebar-brand"><Brand /></div>
      <Suspense fallback={<Navigation pathname="" onNavigate={onNavigate} />}>
        <PathNavigation onNavigate={onNavigate} />
      </Suspense>
      <div className="sidebar-bottom">
        <div className="local-note">
          <span className="local-note-icon"><Icon name="terminal" /></span>
          <div>
            <p>Built for local workflows</p>
            <span>No account required</span>
          </div>
        </div>
        <div className="sidebar-version"><span> MCPILOT</span><span>v0.1.0</span></div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-frame">
      <aside className="sidebar desktop-sidebar">
        <Sidebar />
      </aside>

      {menuOpen && (
        <div className="mobile-navigation-layer">
          <button
            className="mobile-navigation-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="sidebar mobile-sidebar">
            <Sidebar mobile onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <div className="app-column">
        <header className="topbar">
          <button
            type="button"
            className="mobile-menu-button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? "close" : "menu"} />
          </button>
          <div className="mobile-brand"><Brand /></div>
          <div className="topbar-context"><span className="context-slash">/</span> MCP integration workspace</div>
          <div className="runtime-status" aria-label="Local development environment active">
            <span className="runtime-dot" />
            <span className="runtime-label">Local environment</span>
            <span className="runtime-value">Active</span>
          </div>
        </header>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
