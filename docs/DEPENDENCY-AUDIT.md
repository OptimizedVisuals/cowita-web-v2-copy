# Dependency audit — 2026-10-10

`npm audit` reports 51 vulnerabilities (2 low, 25 moderate, 23 high, 1 critical).
Triage below; none require action before launch.

## Root causes

All 51 issues trace to three sources:

1. `vercel@37` (devDependency — local CLI only, not deployed)
   — @fastify/busboy, @tootallnate/once, ajv, braces, debug, esbuild,
     path-to-regexp, semver, uuid
2. `sharp` → `@mapbox/node-pre-gyp` → `tar` (devDependency — build-time
     image optimisation only)
3. `@sentry/node@8` → `@opentelemetry/*` (production dependency, but the
     vulnerable code paths — Baggage propagation, Knex/MySQL/Tedious
     instrumentation — are never executed by this API)

## Why no action now

- Nothing in the Vercel CLI bundle ships to users.
- Nothing in the sharp bundle ships to users.
- The Sentry/OTel vulnerabilities require specific request shapes or
  database drivers that the CoWiTa API does not use.

## When to revisit

- When upgrading `vercel` past v63 (major bump — test first)
- When upgrading `@sentry/node` past v10 (major bump — API changes)
- When `sharp` releases a version with an updated `node-pre-gyp`
- On any security advisory that names a package actually in the
  production runtime (dependencies, not devDependencies)