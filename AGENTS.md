# AGENTS.md

This project's agent guide lives in **[CLAUDE.md](./CLAUDE.md)** — read it first.

It is not Claude-specific: it covers what the project is, how to build/test/run
it, the conventions that matter, and the traps that will otherwise cost you an
afternoon (the pre-Babel acorn in the build, the inverted y convention in brush
selections, the document-wide `clip-path` id).

Quick reference:

```bash
npm ci
npm run build      # required before e2e — the e2e suite drives dist/, not src/
npm test           # jest unit tests
npm run test:e2e   # playwright, real browser
npm run test:all   # the full gate
```
