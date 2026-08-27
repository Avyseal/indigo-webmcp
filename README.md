# Indigo WebMCP

Open-source WebMCP interoperability layer for Indigo and a runnable WebMCP reference host.

The package turns an already-authorized capability projection into browser-native tools exposed through `document.modelContext.registerTool()`. It deliberately does **not** own authentication, authorization, tenant scope, business logic, confirmations, persistence, or transport.

## What is implemented

- imperative WebMCP tool registration through `document.modelContext.registerTool()`;
- registration ownership and unregistration with `AbortSignal`;
- execution cancellation propagation;
- rollback when a multi-tool registration fails partway through;
- strict tool-name/description/schema preflight;
- fail-closed JSON result validation;
- contextual capability projection and atomic replacement;
- on-demand capability discovery with an optional natural-language intent query;
- progressive enhancement when WebMCP is unavailable;
- optional `exposedTo` forwarding for trusted cross-origin agents;
- a neutral, public JSON projection wire format;
- a runnable interoperability lab where humans and agents operate on the same state.

## Architecture boundary

```text
WebMCP-compatible agent
        |
        v
document.modelContext
        |
        v
indigo-webmcp                 <- this repository
  registration / lifecycle
  projection / discovery
        |
        v
host-provided callbacks
        |
        v
authenticated application API / local application logic
```

The browser adapter is not a security boundary. The host decides which capabilities are projected and remains authoritative for every server-side security decision.

## Toolchain

- Node.js 26.8.1
- pnpm 11.24.0
- TypeScript 7.0.2
- Biome 2.5.10
- Node built-in test runner

## Install and verify

```bash
nvm use
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install
pnpm check
```

No GitHub Actions are used. `pnpm check` is the local quality gate.

## Run the interoperability lab

```bash
pnpm demo
```

Open:

```text
http://127.0.0.1:4173/examples/interoperability-lab/
```

Use ChatGPT's in-app browser, or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled. The page remains usable without WebMCP; the status pill reports whether the browser API is available.

The lab exposes one native status tool directly and uses this package for on-demand contextual tools. A typical agent flow is:

1. invoke `indigo.capabilities.discover` with `{ "query": "find low stock products" }`;
2. inspect the newly registered contextual tools;
3. invoke `indigo.lab.inventory.low_stock`;
4. optionally invoke `indigo.lab.inventory.restock` and observe the same inventory table update for the human.

## Minimal API

```ts
import { createIndigoWebMcpDiscoverySurface } from "indigo-webmcp";

const surface = await createIndigoWebMcpDiscoverySurface({
  document,
  getContext: () => ({ route: location.pathname }),
  loadProjection: async ({ context, input, signal }) => {
    // The host decides what is authorized and relevant.
    return loadAuthorizedProjection({ context, query: input.query, signal });
  },
  execute: async ({ capability, context, input, signal }) => {
    // Reuse the host's existing authenticated execution path.
    return executeAuthorizedCapability({ capability, context, input, signal });
  },
});

// On route/session/permission changes:
surface.invalidate("context-changed");

// On teardown:
surface.dispose("page-unmounted");
```

For direct, non-discovery use, call `registerWebMcpToolSet()` or `createIndigoWebMcpSurface()`.

## Public projection wire format

The optional `parseIndigoWebMcpProjection()` helper validates a neutral camelCase JSON contract owned by this repository. It contains only browser-facing capability metadata plus opaque JSON `context`/`metadata`; it does not encode private authorization rules.

See [`docs/WIRE_PROTOCOL.md`](docs/WIRE_PROTOCOL.md).

## Security model

- Project only capabilities the current host session may discover.
- Revalidate authorization when a capability executes.
- Treat `annotations` as agent hints, never as authorization.
- Do not place credentials or private policy state in capability metadata.
- Mark tools returning external/untrusted data with `untrustedContentHint: true`.
- Use `exposedTo` only for origins the host explicitly trusts.

See [`docs/SECURITY.md`](docs/SECURITY.md).

## Hackathon boundary / prior work

Indigo, Avery, Indigo's private business logic, tenancy, RBAC, and canonical domain tools predate the WebMCP Challenge. This repository contains the WebMCP-specific interoperability work created during the challenge window. See [`docs/PRIOR_WORK.md`](docs/PRIOR_WORK.md).

## Browser testing

See [`docs/TESTING.md`](docs/TESTING.md) for a deterministic manual test script covering discovery, contextual replacement, mutation, cancellation, and progressive enhancement.

## License

MIT. See [`LICENSE`](LICENSE).
