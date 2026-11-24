# MCPilot

MCPilot is an MCP integration compiler for developers. Define an MCP server once, then generate configuration files for multiple AI coding clients, validate configurations, and diagnose connection problems.

This repository contains one Next.js application for both the frontend and backend. The MVP does not use a separate backend service or a database.

## Requirements

- Node.js 20.9 or later
- npm

## Setup

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Available commands

- `npm run dev` — run the local development server
- `npm run build` — create a production build
- `npm run start` — serve the production build
- `npm run lint` — check the source with ESLint

## Project structure

- `src/app/` — App Router pages, layouts, and route handlers
- `public/` — static assets

Product functionality will be added incrementally from this starter.
