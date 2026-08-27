# Security and trust boundaries

WebMCP lets an agent invoke JavaScript callbacks supplied by a web page. Treat every registered tool as a new programmatic entry point into the application.

## Authority

`indigo-webmcp` is a projection and lifecycle adapter. It does not grant permission to perform an operation.

The host must:

- authenticate the user/session independently of WebMCP;
- project only capabilities appropriate to the current context;
- re-authorize every execution server-side or in the canonical application layer;
- preserve confirmation, ownership, lock, idempotency, rate-limit, and audit rules for mutations;
- invalidate projected tools when session, permission, route, workspace, or other relevant context changes.

## Prompt injection and untrusted output

Tool descriptions and schemas should be narrow and factual. A tool that returns data influenced by external users, documents, web pages, messages, or other untrusted sources should set:

```js
annotations: { untrustedContentHint: true }
```

This is a hint to the user agent, not a sanitizer. The application remains responsible for output encoding, content validation, and safe rendering.

## Cross-origin exposure

By default, do not provide `exposedTo`. If a host intentionally exposes tools to an author-provided cross-origin agent, pass only explicitly trusted, potentially trustworthy origins.

The browser remains authoritative for WebMCP Permissions Policy and origin validation.

## Cancellation

Registration `AbortSignal`s own tool lifetime. Execution `AbortSignal`s represent individual tool calls. The adapter forwards execution cancellation to the host and also cancels executions when their capability projection is invalidated.

Host executors should propagate the signal into cancellable I/O where possible.

## Secrets

Never include credentials, tokens, private policy snapshots, internal authorization hashes, or sensitive tenant data in tool descriptions, schemas, projection context, or capability metadata merely for WebMCP convenience.
