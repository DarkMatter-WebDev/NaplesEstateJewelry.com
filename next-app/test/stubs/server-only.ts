// Test-only stub. Next.js's real `server-only` package throws unless resolved
// with Next's own bundler conditions, which Vitest doesn't set — this no-op
// stands in so lib/etsy/* modules (which import 'server-only' as a real
// client-bundle safety guard in the app) can be unit-tested directly.
// Aliased in vitest.config.ts; never used by the actual Next.js build.
export {};
