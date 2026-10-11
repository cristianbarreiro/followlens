# GEMINI.md — Gemini & Antigravity Operational Adapter

Operational adapter for Google Gemini and Antigravity IDE. FollowLens uses a single source of truth architecture centered on [AGENTS.md](AGENTS.md). **Do not duplicate knowledge here.**

---

## 🧭 Source of Truth & Context Routing

1. **Master Operating Guide:** [AGENTS.md](AGENTS.md) *(Read this first for invariants and workflow)*
2. **Shared Knowledge Base (OKF v0.2):** [docs/knowledge/index.md](docs/knowledge/index.md)
   - Architecture & Component Map: [docs/knowledge/architecture.md](docs/knowledge/architecture.md)
   - Privacy Boundaries & Security: [docs/knowledge/privacy-and-security.md](docs/knowledge/privacy-and-security.md)
   - Data Ingestion & Transformation: [docs/knowledge/data-flow.md](docs/knowledge/data-flow.md)
   - Domain Model & Types: [docs/knowledge/domain-model.md](docs/knowledge/domain-model.md)
   - Testing & Development: [docs/knowledge/development.md](docs/knowledge/development.md)
   - Target Incremental Processing (ADR-0004): [docs/knowledge/decisions/0004-incremental-zip-processing.md](docs/knowledge/decisions/0004-incremental-zip-processing.md)
3. **Specialized Skills (.agents/skills/):**
   - ZIP Import & Memory Strategy: [.agents/skills/instagram-zip-import/SKILL.md](.agents/skills/instagram-zip-import/SKILL.md)
   - Verification Standards: [.agents/skills/change-verification/SKILL.md](.agents/skills/change-verification/SKILL.md)
   - OKF Documentation Synchronization: [.agents/skills/okf-documentation-sync/SKILL.md](.agents/skills/okf-documentation-sync/SKILL.md)
   *(Natively auto-discovered in Antigravity IDE via workspace customizations and in Gemini CLI via `.agents/skills` alias)*

---

## ⚡ Fast Command Reference

- `npm test`: Run 14 unit test suites (`node --test lib/relationships.test.ts`).
- `npm run typecheck`: Strict TypeScript check (`tsc --noEmit`).
- `npm run build`: Production compilation (`vinext build`).
- `npm run dev`: Development server (`vinext dev`).

---

## 🛡️ Critical Invariants

- **Client-Side Isolation:** 100% in-browser processing. Never introduce remote APIs, functions, or servers for personal data.
- **Zero Telemetry:** Do not transmit Instagram usernames or exported data over any network connection.
- **Selective Extraction & Scope Boundary:** Current functional scope targets followers and following relationships (`followers_*.json`, `following.json`). Never extract or buffer photos, videos, stories, or DMs. Legitimate ZIP size (>200 MB) is not a rejection reason in target architecture; distinguish current in-memory buffering limit (200 MB) from target incremental design.
- **Optional Local Persistence:** IndexedDB (`followlens-local`) only with explicit user opt-in.
- **Account Isolation:** Snapshots from different accounts (`account`) must never be mixed or compared.
- **PolyForm Noncommercial 1.0.0:** Source-available model for personal, educational, and research use. Commercial use requires explicit permission.
