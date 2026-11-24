# MCPilot 🚀
### The Universal MCP Setup & Management Platform

**Stop configuring MCPs. Start using them.**

MCPilot is a centralized platform designed to simplify how developers discover, configure, validate, test, and manage Model Context Protocol (MCP) integrations across different AI clients.

Instead of manually configuring every MCP server for every supported client, MCPilot aims to provide a unified integration workflow that generates client-specific configurations from a single integration specification.

---

## 💡 The Problem

The Model Context Protocol (MCP) makes it possible for AI applications to connect with external tools, services, and data sources.

However, setting up MCP integrations can be unnecessarily complicated:

- Different AI clients have different configuration formats and setup procedures.
- Developers often need to repeat configuration steps when switching between clients.
- Incorrect paths, missing dependencies, environment variables, and authentication settings can cause connection failures.
- Debugging and testing MCP integrations can require multiple tools and manual steps.

**The result:** Developers spend more time configuring integrations than actually using them.

## 🎯 Our Solution

MCPilot aims to provide one unified platform for managing MCP integrations.

Its central idea is the **MCP Integration Compiler**: define an integration once, then generate the appropriate configuration for supported AI clients.

The platform is designed to bring MCP discovery, configuration generation, validation, and testing into one workflow.

## ✨ Key Features

### 1. MCP Server Discovery
Discover MCP servers and explore their available tools, capabilities, and integration requirements.

### 2. MCP Integration Compiler
The core feature of MCPilot.

- Define an MCP integration using a unified specification.
- Convert the specification into client-specific configuration formats.
- Reduce repetitive manual configuration.
- Support multiple AI clients through a common workflow.

### 3. Multi-Client Configuration Generator
Generate configuration files for supported environments, with an initial focus on:

- Cursor
- Visual Studio Code
- Claude Desktop

The architecture is intended to support additional clients in the future.

### 4. MCP Doctor
A diagnostic system designed to identify common configuration issues, including:

- Missing dependencies
- Invalid configuration structures
- Incorrect server paths
- Missing environment variables
- Potential connection problems

### 5. MCP Testing Playground
A unified environment for testing MCP server connections and inspecting their available tools and responses.

### 6. Security-Aware Configuration
MCPilot is designed with security considerations such as:

- Sensitive environment variable handling
- Secret redaction in logs
- Explicit approval before executing local processes
- Least-privilege configuration practices

---

## 🏗️ Proposed Architecture

MCPilot follows a modular architecture that separates the user interface, integration processing, configuration generation, and MCP communication.

```text
                  ┌──────────────────────┐
                  │      MCPilot UI      │
                  │   Next.js + React   │
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │      Backend API     │
                  │       FastAPI         │
                  └──────────┬───────────┘
                             │
             ┌───────────────┼────────────────┐
             │               │                │
     ┌───────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
     │ Integration  │ │ MCP Doctor   │ │ MCP Testing  │
     │   Compiler   │ │ Diagnostics  │ │  Playground  │
     └───────┬──────┘ └──────────────┘ └──────────────┘
             │
     ┌───────▼──────────────────────────────┐
     │       Configuration Generator        │
     └───────┬───────────────┬───────────────┘
             │               │
       ┌─────▼─────┐   ┌─────▼─────┐
       │  Cursor   │   │ VS Code / │
       │  Config   │   │  Claude   │
       └───────────┘   └───────────┘
```

*This represents the proposed architecture and may evolve during implementation.*

---

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | Next.js |
| UI Framework | React |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Backend | Python, FastAPI |
| Protocol Integration | Official MCP SDKs |
| Configuration | JSON, YAML |
| Database | SQLite (initial MVP) |
| Testing & Inspection | MCP Inspector |
| Version Control | Git & GitHub |

---

## 🔄 How MCPilot Works

1. **Discover:** Find an MCP server you want to integrate.
2. **Select:** Choose the server and the AI client you want to use.
3. **Configure:** Define the integration through a unified specification.
4. **Compile:** MCPilot generates the corresponding client-specific configuration.
5. **Validate:** Run diagnostics to identify configuration issues.
6. **Test:** Verify the integration and inspect the server's available tools.

---

## 🎯 Initial MVP Scope

The initial implementation focuses on delivering a functional demonstration rather than attempting to support every MCP server and AI client immediately.

The proposed MVP includes:

- A working web-based dashboard.
- Integration with 1–2 real MCP servers.
- A unified integration specification.
- Configuration generation for three target clients.
- Basic deterministic configuration validation.
- A basic MCP connection testing workflow.

Additional integrations and advanced management capabilities can be introduced incrementally.

---

## 🚀 Future Roadmap

- Expand support for MCP-compatible AI clients.
- Build a searchable MCP server registry.
- Introduce advanced diagnostics and automated troubleshooting.
- Add integration templates and reusable configurations.
- Improve secret management and security auditing.
- Support team-based integration management.
- Introduce cloud-based configuration management.

---

## 👥 Team GIT GAMBIT

**Institution:** BMS Institute of Technology and Management (BMSIT)  
**Track:** T-1  
**Event:** wHACKiest 2026

| Team Member | USN | Role |
|---|---|---|
| Prithvi | 1TD24CS207 | Team Lead |
| Aryan | 1TD24CS027 | Developer |
| Ramith | 1BY24CS227 | Developer |
| Mudduchethan | 1TD24CS163 | Developer |

---

## 📌 Project Status

MCPilot is currently under development.

The initial focus is on building the integration compiler and demonstrating a reliable end-to-end MCP configuration workflow.

Features described in this README represent the project vision and planned scope; individual capabilities will be marked as implemented as development progresses.

---

## 🤝 Contributing

Contributions, suggestions, and feedback are welcome.

If you would like to contribute:

1. Fork the repository.
2. Create a new feature branch.
3. Make your changes.
4. Submit a pull request with a clear description.

---

## 📄 License

A license will be added as the project moves towards public release.

---

**MCPilot — One integration. Multiple clients. Less configuration.**