# CLAUDE.md — Claude Code Operational Adapter

Operational adapter for Claude Code. FollowLens uses a single source of truth architecture centered on [AGENTS.md](AGENTS.md). **Do not duplicate knowledge here.**

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
   *(Compatible with Agent Skills; native discovery in Claude Code uses .claude/skills/, while shared repository skills under .agents/skills/ are referenced explicitly above)*

---

## ⚡ Fast Command Reference

- `npm test`: Run 34 unit tests (`node --test lib/relationships.test.ts`).
- `npm run typecheck`: Strict TypeScript check (`tsc --noEmit`).
- `npm run build`: Production compilation (`vinext build`).
- `npm run dev`: Development server (`vinext dev`).

---

## 🛡️ Non-Negotiable Invariants

- **100% Client-Side:** No backend uploads, no external APIs, no cloud functions for user data.
- **Zero Telemetry:** Never add network calls transmitting personal data, follower lists, or metadata.
- **Selective Extraction & Scope Boundary:** Current functional scope targets followers and following relationships (`followers_*.json`, `followers_*.html`, `following.json`, `following.html`). Never extract or buffer photos, videos, stories, or DMs. Full legitimate archive size (>200 MB) is not a rejection reason in target architecture; note current in-memory limit (200 MB) in `lib/importer.ts` as pending migration to incremental processing.
- **Opt-in Storage:** IndexedDB storage (`followlens-local`) requires explicit user consent.
- **Account Isolation:** Snapshots from different accounts (`account`) must never be mixed or compared.
- **License Compliance:** FollowLens is licensed under **PolyForm Noncommercial 1.0.0** (source-available, noncommercial).
