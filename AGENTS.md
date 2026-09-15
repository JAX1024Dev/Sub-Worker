# Repository Guidelines

## Project Structure & Module Organization

Requirements and boundaries live in `docs/PROJECT.md` and `docs/ARCHITECTURE.md`. `docs/CONFIGURATION.md` defines remote composition. `docs/DNS.md` and `docs/RULES.md` define DNS and routing behavior. Security requirements are in `docs/SECURITY.md`; decisions are under `docs/adr/`.

Place Worker code in `src/` by responsibility: `api/`, `application/`, `domain/`, `sources/`, `parsers/`, `renderers/`, `config/`, and `security/`. Put editable fragments under `example/sing-box/`; never hand-edit `published/` bundles. Put tests in `test/unit/`, `test/integration/`, `test/e2e/`, and sanitized fixtures in `test/fixtures/`.

## Build, Test, and Development Commands

The following commands are the project interface:

- `pnpm dev`: run the Worker locally with Wrangler.
- `pnpm test`: run unit and integration tests.
- `pnpm test:config`: validate generated files with sing-box 1.14.0.
- `pnpm lint` / `pnpm format:check`: enforce source and formatting rules.
- `pnpm typecheck`: run strict TypeScript checks.
- `pnpm build`: type-check and build the Worker bundle.
- `pnpm deploy:staging`: deploy before any production release.

## Coding Style & Naming Conventions

Use TypeScript strict mode, two-space indentation, and repository-configured ESLint and Prettier. Prefer small modules with explicit dependencies. Use `PascalCase` for types, `camelCase` for values/functions, and kebab-case filenames such as `subscription-decoder.ts`. Avoid `any`, unsafe double casts, floating promises, and request-scoped mutable globals. Generate Worker binding types with Wrangler rather than maintaining duplicate `Env` definitions.

## Testing Guidelines

Use Vitest and the Cloudflare Workers test environment. Name tests `*.test.ts`. Every parser, validator, DNS/rules generator, and platform overlay needs unit coverage. Regular integration tests must mock 3x-ui; only the opt-in E2E suite may contact a dedicated real test instance. All five platform fixtures must pass `sing-box check` with version 1.14.0. Never commit live subscription IDs or node credentials.

## Commit & Pull Request Guidelines

The repository has no commit history yet. Use Conventional Commits, for example `docs: clarify DNS generator contract` or `feat(parser): add VLESS reality parsing`. Keep commits focused. Pull requests must explain the change, affected specifications/ADRs, validation performed, and any security impact; link related issues. Include screenshots only for future UI changes.

## Security & Configuration

Store `THREE_X_UI_SUB_BASE_URL` in `.dev.vars` locally and as a Cloudflare Secret in deployed environments. Never log full request paths, subscription IDs, links, generated configurations, or full remote-config URLs. Never let request input select a repository, branch, or bundle URL. Do not introduce caching, new upstream hosts, protocols, sing-box versions, or composition semantics without updating the relevant specification and ADR first.
