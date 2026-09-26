# sub-worker

Cloudflare Worker that converts 3x-ui subscriptions into platform-specific sing-box
1.14.0 configurations. The MVP supports VLESS Reality nodes and generates DNS, routing,
outbound, selector, and TUN settings for iOS, Android, macOS, Windows, and Linux. VLESS
outbounds support TCP and XUDP traffic. Production uses independent, client-selectable service
policies: Microsoft defaults to direct, Apple to proxy, ads to block, Kraken/Krak to UK nodes,
and unmatched non-China traffic to the global node selector. sing-box stores selections locally
through `cache_file`; the Worker never stores subscriptions or user choices.

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

## Remote configuration

Static TUN, DNS, routing, outbound policy, and platform settings now have reviewed source fragments
under `example/sing-box/`. Run `pnpm config:validate`, `pnpm config:build`, and
`pnpm config:diff` to validate them, build immutable per-platform bundles, and check platform and
service-policy invariants. The Worker verifies the production channel manifest and its pinned
bundle, then combines that bundle with live 3x-ui nodes. Compatible configuration changes and
rollbacks can ship through GitHub channels without redeploying Worker code. The normal release path
uses staging followed by a reviewed production promotion. As of 2026-09-26, staging and production
point to the same restricted-Kraken bundle; all five responses passed configuration-level smoke checks.
Latest-policy client-device behavior and UK exit IP still need validation.

The scheduled DustinWin update workflow proposes review PRs; Actions PR creation is enabled for
this repository. The workflow does not automatically promote production.

Official iOS, macOS, and Android apps expose the generated selectors. Windows/Linux core users need
their own local management UI/API to change selections; do not expose such an API publicly.

Read [docs/PROJECT.md](./docs/PROJECT.md) for scope, [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)
for module boundaries, [docs/CONFIGURATION.md](./docs/CONFIGURATION.md) for the remote bundle
contract, [docs/RELEASE.md](./docs/RELEASE.md) for the release checklist, and
[AGENTS.md](./AGENTS.md) before contributing. Release notes are maintained in
[CHANGELOG.md](./CHANGELOG.md).

## License

Released under the [MIT License](./LICENSE).
