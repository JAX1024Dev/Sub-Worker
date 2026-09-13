# sub-worker

Cloudflare Worker that converts 3x-ui subscriptions into platform-specific sing-box
1.14.0 configurations. The MVP supports VLESS Reality nodes and generates DNS, routing,
outbound, selector, and TUN settings for iOS, Android, macOS, Windows, and Linux. VLESS
outbounds support TCP and XUDP traffic.

## Quick start

```bash
corepack enable
pnpm install --frozen-lockfile
cp .dev.vars.example .dev.vars
pnpm dev
```

Verify the scaffold:

```bash
curl http://127.0.0.1:8787/health
pnpm check
```

Fetch a generated configuration:

```bash
curl --fail-with-body \
  http://127.0.0.1:8787/v1/sing-box/linux/example-subscription-id
```

Run the opt-in live subscription test after configuring both values in `.dev.vars`:

```bash
pnpm test:e2e
```

The live test exercises the complete Worker endpoint and never stores or prints subscription
contents.

Read [docs/PROJECT.md](./docs/PROJECT.md) for scope, [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
for module boundaries, [docs/RELEASE.md](./docs/RELEASE.md) for the release checklist, and
[AGENTS.md](./AGENTS.md) before contributing. Release notes are maintained in
[CHANGELOG.md](./CHANGELOG.md).

## License

Released under the [MIT License](./LICENSE).
