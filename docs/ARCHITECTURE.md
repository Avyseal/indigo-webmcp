# Architecture

## Purpose

Indigo WebMCP is a browser interoperability layer. It makes selected, authorized Indigo capabilities discoverable to WebMCP-compatible agents without turning the browser adapter into a second business-logic or authorization system.

## Ownership

```text
External agent
    |
    v
WebMCP browser API
    |
    v
indigo-webmcp                 public repository
    |                          - API feature detection
    |                          - registration lifecycle
    |                          - neutral capability contracts
    |                          - validation and tests
    v
Indigo authenticated API      private product boundary
    |
    v
Indigo canonical tool layer   source of truth
    |
    v
Domain handlers/services
```

## Canonical rules

The public adapter must consume explicit capability projections from Indigo. It must not reconstruct permissions from UI state, duplicate backend tool registries, or import Avery-specific presentation metadata as authority.

Avery and WebMCP are sibling consumers of Indigo capabilities. Neither owns the underlying business tools.

## Runtime model

Registration is client-side and cheap. Loading a page may register tool metadata, but it must not execute business operations or wake backend compute merely because WebMCP support exists.

Backend work starts only when an agent invokes a tool and the adapter performs the corresponding authenticated request.

## Contextual exposure

The final Indigo integration will expose only tools valid for the current authenticated context. Relevant inputs include the active surface, route/module, tenant, branch, permissions, and server-projected capability policy.

The browser may reduce the visible tool set for usability, but the backend remains the final enforcement point.

## Side effects

Read operations can execute directly when server policy permits. Mutations must preserve Indigo's existing confirmation, ownership, lock, rate-limit, idempotency, and audit requirements.

## Failure behavior

If `document.modelContext` or `registerTool` is unavailable, Indigo must continue working normally with no WebMCP behavior. WebMCP is progressive enhancement, not a boot dependency for the admin or storefront.

If a tool becomes invalid because route, tenant, branch, permissions, or session state changes, its registration must be removed or replaced before further use.

## Repository boundary

This repository must remain independently understandable, testable, and open source. It must never require disclosure of Indigo's private core to explain how the WebMCP adapter works.

## Browser registration lifecycle

`registerWebMcpToolSet` owns only browser registration. The Indigo host passes an already-authorized tool set plus an execution callback that uses Indigo's existing authenticated transport.

The registration layer:

- validates every tool before the first browser registration;
- enforces the WebMCP tool-name grammar (`1..128`, ASCII alphanumeric plus `_`, `-`, `.`);
- registers through `document.modelContext.registerTool()`;
- owns registrations with one `AbortController` and unregisters them on disposal;
- rolls back earlier registrations if a later registration fails;
- forwards the agent-provided execution `AbortSignal` to the host executor;
- does not make HTTP requests, resolve permissions, or bypass server confirmation policy;
- treats an empty authorized tool set as a valid no-op for progressive enhancement.

Cross-origin exposure is opt-in through `exposedTo`; same-origin/browser-agent exposure remains the default.
