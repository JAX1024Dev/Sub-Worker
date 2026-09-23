# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
