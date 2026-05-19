# Despia Local AI Demo

A React 19 + TypeScript + Vite single-page app that demonstrates how to talk to
an **on-device LLM** through the Despia `window.intelligence` bridge.

The app (`src/ChatApp.tsx`) is a streaming chat client that runs a local model
(Gemma 3 1B IT), supports **function/tool calling** (a live OpenWeatherMap
lookup), and manages model download state. Everything under `src/lib/` is the
reusable integration layer — copy that folder into another project to wire up
the same bridge.

## How it works

The native Despia runtime injects a global object, `window.intelligence`, into
the web view. The web app drives inference by calling methods on it
(`completion`, `listModels`, `downloadModel`, …) and receives results through
**callback slots** it assigns on the same object (`onMLToken`, `onMLComplete`,
`onDownloadProgress`, …).

```
┌────────────┐   completion() / listModels() / downloadModel()   ┌──────────────┐
│  Web app   │ ───────────────────────────────────────────────►  │   Native     │
│  (React)   │                                                    │  runtime /   │
│            │ ◄───────────────────────────────────────────────  │  FakeBridge  │
└────────────┘   onMLToken / onMLComplete / onDownloadProgress    └──────────────┘
```

> **Callback slots are single global properties, not an event emitter.** Each
> `on*` handler is one assignable slot on `window.intelligence`. Only one
> component may own a given slot at a time — assign it on mount and clear it
> (`= undefined`) on unmount, as `ChatApp` does.

When there is no native runtime (i.e. running in a plain browser during
development), `installFakeBridge()` installs a mock implementation so the full
UI flow still works. It is enabled automatically in `main.tsx` under
`import.meta.env.DEV`.

## Commands

```bash
npm run dev       # Start dev server with HMR (installs the FakeBridge)
npm run build     # Type-check then bundle for production (tsc -b && vite build)
npm run lint      # Run ESLint
npm run preview   # Serve the production build locally
```

No test runner is configured yet.

## Project layout

```
src/
  main.tsx            App entry: Theme → IntelligenceGuard → IntelligenceProvider → ChatApp
  ChatApp.tsx         Reference chat client (streaming + tool calling + model download)
  SinglePromptApp.tsx Minimal single-prompt example
  lib/                Reusable Despia intelligence integration layer  ← documented below
```

## `src/lib/` — reusable components

### `global.d.ts` — the bridge contract

Ambient TypeScript declarations for `window.intelligence`. This is the single
source of truth for the entire native ↔ web API and the only file you must keep
in sync with the runtime. It declares:

- **Block types** — `ContentBlock` and `ToolBlock`, the elements of the
  `Block[]` snapshot streamed back during inference. `ToolBlock.status` is
  `loading | ready` when emitted by native and is set to `done | failed` by the
  app after it executes the tool.
- **Tool types** — `ToolSchema`, `Tool`, and the OpenAI-shaped
  `CompletionToolSchema` escape hatch.
- **`CompletionMessage`** — the conversation message shape sent to
  `completion()` (`system` / `user` / `assistant` / `tool`).
- **`Model`**, **`MLError`**.
- **`Window.intelligence`** — every method (`completion`, `listModels`,
  `downloadModel`, `removeModel`, `cancel`) and every callback slot, including
  the full set of optional `completion()` tuning fields.

### `intelligence.ts` — `defineTool(fn, schema)`

Pairs an implementation function with its JSON-schema so it can be registered
in the tool registry. The schema is what the model sees; the function is what
the app runs when the model calls the tool.

```ts
window.intelligence.tools.get_weather_by_city = defineTool(
  async (args: { location: string }) => { /* ... return result ... */ },
  {
    description: "Get weather for a city.",
    parameters: {
      type: "object",
      properties: { location: { type: "string", description: "city" } },
      required: ["location"],
    },
  },
);
```

`window.intelligence.tools` is the registry the native runtime reads at
`completion()` time. Omit `completion({ tools })` to expose all registered
tools, pass `[]` to disable them, or pass names/raw schemas to restrict.

### `useIntelligence.ts` — `useIntelligence()` hook

Owns model-list state. It assigns the `onInstalledModelsLoaded` /
`onAvailableModelsLoaded` callback slots and exposes:

| Member                  | Description                                            |
| ----------------------- | ------------------------------------------------------ |
| `installedModels`       | Models currently installed on device (state).          |
| `availableModels`       | Models available to download (state).                  |
| `getInstalledModels()`  | Request the installed list (`listModels`).             |
| `getAllModels()`        | Request the full catalog (`listModels`).               |
| `isModelInstalledById`  | Check installation by model id.                        |
| `isModelInstalledByName`| Check installation by model name.                      |

The `UseIntelligenceAPI` type is exported for typing the context.

### `IntelligenceContext.ts` + `IntelligenceProvider.tsx`

`IntelligenceProvider` calls `useIntelligence()` once and publishes the result
through `IntelligenceContext`, so any descendant can read installed/available
models without re-wiring callbacks. Consume it with
`useContext(IntelligenceContext)`.

### `IntelligenceGuard.tsx`

Renders its children only when `window.intelligence` exists; otherwise shows a
fallback ("No Intelligence API found!"). Pass `disable` to bypass the check.
Place it above the provider so the rest of the tree can assume the bridge is
present.

### `FakeBridge.ts` — `installFakeBridge()`

Installs a mock `window.intelligence` for browser development when no native
runtime is present. It simulates token streaming, a weather tool call, and the
model list/download/remove flows, so the entire UI works end-to-end without a
device. It is a no-op if a bridge already exists.

## Integrating the library

1. Copy `src/lib/` into your project (keep `global.d.ts` in the TS include
   path).
2. In dev only, call `installFakeBridge()` before rendering.
3. Wrap your tree: `<IntelligenceGuard>` → `<IntelligenceProvider>` → your app
   (see `src/main.tsx`).
4. Register tools with `defineTool` into `window.intelligence.tools`.
5. Assign `onMLToken` / `onMLComplete` (and download callbacks if needed),
   then call `window.intelligence.completion({ id, model, messages, stream })`.
6. Handle the tool round-trip: when `onMLComplete` delivers `ToolBlock`s with
   `status: "ready"`, execute them, append the results to the conversation as
   `{ role: "tool", content: JSON.stringify({ name, content }) }` messages, and
   call `completion()` again to let the model finish the turn.

`src/ChatApp.tsx` is the annotated reference implementation of steps 4–6.
