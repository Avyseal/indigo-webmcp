# Prior Work Boundary

## Competition boundary

The WebMCP competition window began on August 25, 2026. This repository was created after that date specifically for the WebMCP integration work.

## Existing before the competition

The following systems are prior work and are not claimed as new hackathon implementation:

- Indigo, the existing product and its admin/storefront applications.
- Avery, Indigo's internal agent runtime.
- Indigo's canonical agent tool registry, tool schemas, bindings, ownership metadata, runtime metadata, plugins, and handlers.
- Existing authentication, tenant and branch scoping, RBAC, confirmation policies, rate limits, and domain services.
- Existing product, order, inventory, appointment, reporting, and other business-domain functionality.

## New WebMCP work

This repository owns the work created for the competition:

- Browser-side WebMCP interoperability primitives.
- WebMCP capability detection and registration adapters.
- Public, auditable mappings from authorized Indigo capability contracts to WebMCP declarations.
- Compatibility tests, security guards, documentation, and the competition demo surface.
- Any Indigo-side adapter endpoints or contract projections added specifically to support WebMCP, when those changes are separately identifiable by post-August-25 commits.

## Source-code boundary

Private Indigo source must not be copied into this repository. The public project may define neutral contracts and adapters, but Indigo remains the source of truth for business behavior and authorization.

A WebMCP tool declaration is never sufficient authority to perform an action. The server must independently authenticate and authorize every request.
