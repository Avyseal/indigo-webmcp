# Public capability projection wire protocol

`parseIndigoWebMcpProjection()` accepts a deliberately small, neutral JSON document. The protocol exists so a host can transport browser-facing capability definitions without exposing or duplicating its private authorization model.

## Shape

```json
{
  "revision": "catalog-42",
  "context": {
    "route": "/products",
    "workspace": "admin"
  },
  "capabilities": [
    {
      "name": "catalog.search",
      "title": "Search catalog",
      "description": "Search products visible in the current workspace.",
      "inputSchema": {
        "type": "object",
        "properties": {
          "query": { "type": "string" }
        }
      },
      "annotations": {
        "readOnlyHint": true,
        "untrustedContentHint": false
      },
      "metadata": {
        "domain": "catalog"
      }
    }
  ]
}
```

## Contract

`revision` identifies the host projection snapshot. The adapter treats it as opaque.

`context` is an arbitrary JSON object captured with the projection and passed back to the host executor. It is not interpreted as authorization by this package.

`capabilities` contains browser-facing tool definitions. Each capability supports `name`, optional `title`, `description`, optional `inputSchema`, optional WebMCP `annotations`, and optional opaque JSON `metadata`.

The parser rejects unknown capability and annotation fields. This is intentional: a typo or an accidental private-server field must not silently become part of the public interoperability contract.

## What is intentionally absent

The wire protocol does not define tenant IDs, RBAC roles, owner flags, locks, confirmation tokens, proposal IDs, rate limits, credentials, or business-specific execution semantics. Those remain host concerns.

A host may include non-sensitive display/execution hints inside `metadata`, but must still revalidate all security properties when executing a tool.
