# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server with HMR
npm run build     # Type-check then bundle for production (tsc -b && vite build)
npm run lint      # Run ESLint
npm run preview   # Serve the production build locally
```

No test runner is configured yet.

## Architecture

React 19 + TypeScript SPA built with Vite. Entry point is `src/main.tsx`, which mounts `<App />` inside a Radix UI `<Theme>` wrapper.

**UI library:** [@radix-ui/themes](https://www.radix-ui.com/themes/docs/overview/getting-started) — the global stylesheet is imported once in `main.tsx` (`@radix-ui/themes/styles.css`). Use Radix Themes components for all UI rather than raw HTML where possible.

**TypeScript config:** Split into `tsconfig.app.json` (src files, bundler module resolution) and `tsconfig.node.json` (vite config). The root `tsconfig.json` references both.
