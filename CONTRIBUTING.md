# Contributing

Contributions must preserve the repository boundary described in `docs/ARCHITECTURE.md` and `docs/PRIOR_WORK.md`.

## Setup

```bash
nvm use
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install
pnpm check
```

## Requirements

Behavior changes require tests. Do not copy private Indigo source, secrets, tenant data, or internal-only implementation into this repository. Do not weaken server-side authorization by treating WebMCP registration or browser state as trusted authority. Do not add GitHub Actions or files under `.github/workflows`.
