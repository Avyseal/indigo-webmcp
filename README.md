# Indigo WebMCP

Open-source WebMCP interoperability layer for Indigo.

This repository is the public competition surface for exposing authorized Indigo business capabilities to WebMCP-compatible agents. It does **not** contain Indigo's private application core, Avery runtime, tenant data, credentials, or private business logic.

## Status

Canonical foundation for the 2026 WebMCP hackathon. The repository owns browser interoperability, validation, tests, and public documentation. Functional Indigo tool exposure is added here only when it can remain auditable without duplicating private implementation details.

## Architecture boundary

```text
WebMCP-compatible agent
        |
        v
Browser WebMCP adapter        <- this repository
        |
        v
Authenticated Indigo API
        |
        v
Canonical Indigo capabilities <- private Indigo repository
        |
        v
Domain handlers / services
```

The browser adapter is not an authorization boundary. Indigo remains authoritative for authentication, tenant and branch scope, RBAC, confirmations, rate limits, locks, and side effects.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/PRIOR_WORK.md`](docs/PRIOR_WORK.md).

## Toolchain

- Node.js 26.8.1
- pnpm 11.24.0
- TypeScript 7.0.2
- Biome 2.5.10
- Node built-in test runner

## Local setup

```bash
nvm use
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install
pnpm check
```

`pnpm check` runs Biome validation, strict type checking, tests, and production compilation.

## Development rules

1. Do not copy private Indigo source into this repository.
2. Do not create a second source of truth for Indigo tools or permissions.
3. WebMCP registration must be derived from explicit, authorized capability contracts.
4. Registration must not execute business operations or wake backend compute.
5. Side-effecting operations must preserve Indigo's server-side authorization and confirmation policies.
6. Every behavioral change requires tests.
7. Do not add GitHub Actions or files under `.github/workflows`.

## Prior work

Indigo, Avery, Indigo's canonical agent tools, plugins, RBAC, tenancy, and domain handlers existed before the competition window. This repository contains the WebMCP-specific work. The boundary is documented in [`docs/PRIOR_WORK.md`](docs/PRIOR_WORK.md).

## License

MIT. See [`LICENSE`](LICENSE).
