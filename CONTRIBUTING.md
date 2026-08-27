# Contributing

## Requirements

- Node.js 26.8.1
- pnpm 11.24.0

## Local gate

```bash
nvm use
corepack enable
corepack prepare pnpm@11.24.0 --activate
pnpm install
pnpm check
```

Run the browser reference host with `pnpm demo`.

## Repository rules

- Keep this repository public and independent of private Indigo source.
- Do not copy private tools, credentials, tenant data, or authorization logic here.
- Treat host callbacks as the integration boundary.
- Keep WebMCP behavior progressive: unsupported browsers must continue to work normally.
- Add tests for behavioral changes.
- Do not add GitHub Actions or `.github/workflows`.
