# Channel manifests

`staging.json` and `production.json` are generated only after immutable bundles have been committed.
They must point to a full 40-character commit SHA and include the bundle SHA-256; placeholder
manifests are intentionally not committed.
