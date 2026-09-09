# Changelog

All notable changes to this project will be documented in this file.

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
