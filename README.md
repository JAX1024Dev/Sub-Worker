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

## Remote configuration refactor

Static TUN, DNS, routing, outbound policy, and platform settings now have reviewed source fragments
under `example/sing-box/`. Run `pnpm config:validate`, `pnpm config:build`, and
`pnpm config:diff` to validate them, build immutable per-platform bundles, and compare them with the
current generator. The Worker now verifies one published bundle and combines it with live 3x-ui
nodes. The bounded, fail-closed GitHub adapter and deterministic composer are connected to the
subscription request path and match the current production generator for all five clients. This
will let compatible configuration changes and rollbacks ship through GitHub channels without
redeploying Worker code. Publishing the first immutable staging manifest remains a prerequisite for
the staging cutover. Repository workflows generate staging manifests from committed Git objects
and promote the exact verified staging URLs and digests through an approval-gated production PR.

Read [docs/PROJECT.md](./docs/PROJECT.md) for scope, [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
for module boundaries, [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for the remote bundle
contract, [docs/RELEASE.md](./docs/RELEASE.md) for the release checklist, and
[AGENTS.md](./AGENTS.md) before contributing. Release notes are maintained in
[CHANGELOG.md](./CHANGELOG.md).

## License

Released under the [MIT License](./LICENSE).
