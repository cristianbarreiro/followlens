# GEMINI.md — Gemini & Antigravity Operational Adapter

Operational adapter for Google Gemini and Antigravity IDE. FollowLens uses a single source of truth architecture. **Do not duplicate knowledge here.**

---

## 🧭 Source of Truth & Context Routing

1. **Master Operating Guide:** [AGENTS.md](AGENTS.md) *(Read this first)*
2. **Shared Knowledge Base (OKF v0.2):** [docs/knowledge/index.md](docs/knowledge/index.md)
   - Architecture & Map: [docs/knowledge/architecture.md](docs/knowledge/architecture.md)
   - Privacy Boundaries: [docs/knowledge/privacy-and-security.md](docs/knowledge/privacy-and-security.md)
   - Domain Model: [docs/knowledge/domain-model.md](docs/knowledge/domain-model.md)
   - Testing & Development: [docs/knowledge/development.md](docs/knowledge/development.md)

---

## ⚡ Fast Command Reference

- `npm test`: Run 14 unit tests (`node --test lib/relationships.test.ts`).
- `npm run typecheck`: Strict TypeScript typecheck (`tsc --noEmit`).
- `npm run build`: Production compilation (`vinext build`).
- `npm run dev`: Development server (`vinext dev`).

---

## 🛡️ Critical Invariants

- **Client-Side Isolation:** Never introduce remote APIs or backends for personal data.
- **Zero Telemetry:** Do not transmit Instagram usernames or exported data over the network.
- **Selective Decompression:** Only extract `followers_*.json` and `following.json`; ignore photos, videos, and DMs.
- **Persistencia Opcional:** IndexedDB (`followlens-local`) only with user opt-in.
- **PolyForm Noncommercial 1.0.0:** Source-available model for personal, educational, and research use. Commercial use requires explicit permission.
