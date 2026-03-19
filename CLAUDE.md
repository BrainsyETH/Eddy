# Eddy - Missouri Float Trip Planner

## Stitch Design Integration

This project uses Google Stitch via MCP for AI-powered UI/UX design workflows.

### Setup

1. **Stitch MCP server** is configured in `.mcp.json` using `@_davideast/stitch-mcp`
2. **stitch-design skill** is installed globally via `npx skills add google-labs-code/stitch-skills --skill stitch-design --global`

### Authentication

Before using Stitch design tools, authenticate with Google Cloud:

```bash
npx @_davideast/stitch-mcp init
```

Or set the `STITCH_API_KEY` environment variable directly.

### Design Workflows

- **Generate a screen**: Describe a page and Stitch generates high-fidelity HTML
- **Edit a screen**: Modify existing screens with text prompts
- **Generate DESIGN.md**: Analyze existing Stitch project screens to synthesize a `.stitch/DESIGN.md` design system document

### Tech Stack

- Next.js 14 with App Router
- React 18, TypeScript
- Tailwind CSS 3.4
- MapLibre GL for maps
- Supabase for backend
- Deployed on Vercel
