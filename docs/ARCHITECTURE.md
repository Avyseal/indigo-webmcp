# Architecture

## Purpose

Indigo WebMCP is a browser interoperability layer. It exposes host-approved capabilities to WebMCP-compatible agents without becoming a second business-logic, transport, or authorization system.

## Ownership

```text
External / browser agent
        |
        v
WebMCP browser API
        |
        v
indigo-webmcp
  - feature detection
  - tool validation
  - registration lifecycle
  - contextual projection
  - on-demand discovery
  - cancellation propagation
        |
        v
host callbacks
  - discover authorized capabilities
  - execute canonical operations
        |
        v
application authority
```

The host can be Indigo or any reference/testing host. This repository does not require private Indigo source to build, test, or understand the adapter.

## Native WebMCP mapping

`registerWebMcpToolSet()` maps `WebMcpToolDefinition` objects directly to `document.modelContext.registerTool()`.

A shared registration `AbortController` owns the lifetime of a set. Aborting that controller unregisters the set through the native WebMCP registration signal. Each browser invocation supplies a separate execution `AbortSignal`, which is forwarded to the host executor.

The adapter validates tool names, non-empty descriptions, serializable schemas, and serializable execution results before allowing silent browser serialization failures.

## Contextual projection

`createIndigoWebMcpSurface()` accepts a projection containing:

- an opaque revision;
- arbitrary JSON context;
- browser-facing capabilities.

Synchronizing a new projection aborts the prior projection and replaces its complete tool set. If a projection is superseded while registration is pending, the obsolete registration is rolled back.

The context is passed back to the executor but is never interpreted as authorization.

## On-demand discovery

`createIndigoWebMcpDiscoverySurface()` initially registers only `indigo.capabilities.discover`. Registering that tool performs no backend or business work.

When an agent invokes discovery, the adapter passes the current host context, optional natural-language intent query, and execution signal to `loadProjection`. The resulting capabilities are then registered as a contextual set.

This pattern avoids eagerly projecting a large tool catalog and allows scale-to-zero hosts to defer work until an agent actually requests capabilities.

## Progressive enhancement

If `document.modelContext.registerTool` is unavailable, the surface returns `unsupported`; the host application continues normally.

An empty authorized projection is also valid and registers no business tools.

## Cross-origin tools

`exposedTo` is optional and forwarded to the native registration API. The browser remains authoritative for trustworthy-origin and Permissions Policy enforcement.

## Security boundary

Annotations such as `readOnlyHint` and `untrustedContentHint` are agent/browser hints. They are not access control.

The host must revalidate authentication, authorization, context, confirmation, locks, rate limits, idempotency, and audit requirements at execution time.
