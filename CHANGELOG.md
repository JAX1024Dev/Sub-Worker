# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- Prevented iOS public IPv6 destinations from entering an unavailable direct IPv6 route.
- Enabled VLESS UDP with XUDP by removing the incorrect TCP-only outbound restriction.
- Replaced the ineffective iOS `route_exclude_address_set` with generated explicit China IPv6
  exclusions. This prevents domestic IPv4 and IPv6 requests in one app session from using
  different geographic exits.

### Validated

- Confirmed the production iOS and macOS configurations with sing-box 1.14.0 and official
  clients, including the UDP/WebRTC regression scenario.
- Confirmed the explicit IPv6 bypass on the official iOS client over IPv6 Wi-Fi: YouTube,
  WeChat, Douyin, Didi, and Didi Wallet all work concurrently.

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
