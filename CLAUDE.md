# CLAUDE.md — Claude Code Operational Adapter

Operational adapter for Claude Code. FollowLens uses a single source of truth architecture. **Do not duplicate knowledge here.**

---

## 🧭 Source of Truth & Context Routing

1. **Master Operating Guide:** [AGENTS.md](AGENTS.md) *(Read this first)*
2. **Shared Knowledge Base (OKF v0.2):** [docs/knowledge/index.md](docs/knowledge/index.md)
   - Architecture & Files: [docs/knowledge/architecture.md](docs/knowledge/architecture.md)
   - Privacy Model: [docs/knowledge/privacy-and-security.md](docs/knowledge/privacy-and-security.md)
   - Data Flow & Parsers: [docs/knowledge/data-flow.md](docs/knowledge/data-flow.md)
   - Development & Tests: [docs/knowledge/development.md](docs/knowledge/development.md)

---

## ⚡ Fast Command Reference

- `npm test`: Run 14 unit tests (`node --test lib/relationships.test.ts`).
- `npm run typecheck`: Strict TypeScript typecheck (`tsc --noEmit`).
- `npm run build`: Production compilation (`vinext build`).
- `npm run dev`: Development server (`vinext dev`).

---

## 🛡️ Non-Negotiable Invariants

- **100% Client-Side:** No backend uploads, no external APIs, no cloud functions for user data.
- **Zero Telemetry:** Never add network calls transmitting personal data or follower lists.
- **Strict Archival Filtering:** `fflate` must only extract followers and following JSONs; ignore media and messages.
- **Opt-in Storage:** IndexedDB storage (`followlens-local`) requires explicit user consent.
- **License Compliance:** FollowLens is licensed under **PolyForm Noncommercial 1.0.0** (source-available, noncommercial).
