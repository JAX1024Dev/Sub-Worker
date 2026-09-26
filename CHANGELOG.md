# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Improved

- Set generated sing-box configurations to log only `error` and above by default; clients can
  change the level locally when troubleshooting.
- Cancel rejected 3x-ui response streams, including oversized declared bodies, without replacing
  the original upstream error if cancellation fails.
- Extend bundle regression checks to cover the global selector, Kraken UK-only choices and fallback,
  removed groups, GitHub rule precedence, and `kraken.zendesk.com` routing.
- Align project, architecture, routing, security, development, and release documentation with the
  deployed GitHub-bundle architecture and 2026-09-26 release state.

## [Production: simplified selectors and restricted Kraken] - 2026-09-26

### Changed

- Removed the `auto` speed-test selector and separate UK group. The global selector lists live nodes
  directly; Kraken/Krak offers only UK-labelled nodes, the global selector, and block.
- Added `kraken.zendesk.com` to the Kraken domain list and placed GitHub routing before Microsoft.
- Unique node names no longer receive identity suffixes; duplicates and reserved tags still do.
- Staging and production manifests now reference bundle commit `852233cac5d9781781b7194f53dd7e0fb9692442`.

### Validated

- Five-platform configuration checks and live response shape checks passed. Latest client-device
  behavior and UK exit IP require separate verification.

## [Production: selectable service policies] - 2026-09-23

### Added

- Added independently selectable AI, YouTube, streaming, Google, Telegram, Apple, Microsoft,
  ad-blocking, Netflix, Disney+, Spotify, TikTok, GitHub, and Kraken/Krak groups. Each service
  can follow the global selector or use a specific available node.
- Enabled client-side `cache_file` selection persistence with a per-subscription/platform cache ID
  derived without exposing the Subscription ID. Node tags remain stable across upstream reordering.
- Added pinned DustinWin service rule sets, MetaCubeX global service categories, and a daily
  DustinWin update workflow designed to propose review PRs without automatic production promotion;
  its first scheduled run and repository permissions remain unverified.

### Changed

- Microsoft now defaults to direct, Apple to global proxy, ads to block, and Kraken/Krak to UK
  nodes; unmatched non-China traffic uses `🚀 节点选择` as `route.final`.
- Updated DNS detours and service-rule precedence while retaining platform TUN behavior.

### Validated

- Passed 141 tests, all five sing-box 1.14.0 configuration checks, Worker dry-run, and pinned
  rule-set checks. All five production subscriptions returned the new selectors and defaults.
- Deployment was explicitly authorized without staging device validation. Client-device behavior,
  selection persistence, and UK exit IP still require real-device checks.

## [Production: previous fixed service routing] - 2026-09-23

### Added

- Added pinned service rule sets for Apple, Microsoft, Google, YouTube, OpenAI, Netflix, and
  Telegram, plus a UK-only Kraken/Krak selector that blocks if no UK-labelled node is available.
- Added sing-box 1.14.0 validation for all five assembled remote-bundle profiles.
- Added reviewed sing-box source fragments, deterministic per-platform bundles, strict schemas,
  channel manifests, and GitHub Actions promotion workflows.
- Added bounded GitHub configuration loading with immutable commit URLs, SHA-256 verification,
  strict JSON parsing, platform validation, and fail-closed error handling.

### Changed

- Switched the Worker request path from hard-coded platform generators to verified remote bundles
  combined with live 3x-ui nodes.
- Replaced iOS/macOS routing-mode bindings with staging and production manifest URLs.

### Fixed

- Prevented iOS public IPv6 destinations from entering an unavailable direct IPv6 route.
- Enabled VLESS UDP with XUDP by removing the incorrect TCP-only outbound restriction.
- Replaced the ineffective iOS `route_exclude_address_set` with generated explicit China IPv6
  exclusions. This prevents domestic IPv4 and IPv6 requests in one app session from using
  different geographic exits.
- Promoted the validated iOS TUN dual-stack profile so China IPv4 and IPv6 use the same routing
  rules, with Apple `hybrid` network selection on the direct outbound.
- Forced IPv4 DNS answers on macOS after logs showed China IPv6 direct connections failing with
  `no route to host` on an IPv4-only physical interface.

### Validated

- Confirmed the production iOS and macOS configurations with sing-box 1.14.0 and official
  clients, including the UDP/WebRTC regression scenario.
- Confirmed the explicit IPv6 bypass on the official iOS client over IPv6 Wi-Fi: YouTube,
  WeChat, Douyin, Didi, and Didi Wallet all work concurrently.
- Confirmed the iOS TUN dual-stack staging profile works normally before production promotion.
- Confirmed all five remote profiles return valid configurations from staging and production, with
  byte-identical output across both channels for the promoted bundle.

## [0.1.0] - 2026-09-09

### Added

- Cloudflare Worker API for generating sing-box 1.14.0 configurations.
- VLESS Reality subscription parsing with incompatible-node filtering.
- iOS, Android, macOS, Windows, and Linux platform overlays.
- Encrypted DNS, China-direct/global-proxy routing, and pinned rule sets.
- Unit, integration, golden configuration, live subscription, and rule-set integrity tests.

### Security

- Bounded upstream reads, strict Subscription ID validation, redirect rejection, and no-store responses.
- Disabled platform invocation URL logs and automatic traces to protect path-based bearer secrets.
