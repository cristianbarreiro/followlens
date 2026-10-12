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
   - Selective ZIP Processing (ADR-0004): [docs/knowledge/decisions/0004-incremental-zip-processing.md](docs/knowledge/decisions/0004-incremental-zip-processing.md)
3. **Specialized Skills (.agents/skills/):**
   - ZIP Import & Memory Strategy: [.agents/skills/instagram-zip-import/SKILL.md](.agents/skills/instagram-zip-import/SKILL.md)
   - Verification Standards: [.agents/skills/change-verification/SKILL.md](.agents/skills/change-verification/SKILL.md)
   - OKF Documentation Synchronization: [.agents/skills/okf-documentation-sync/SKILL.md](.agents/skills/okf-documentation-sync/SKILL.md)
   *(Natively auto-discovered in Antigravity IDE via workspace customizations and in Gemini CLI via `.agents/skills` alias)*

---

## ⚡ Fast Command Reference

- `npm test`: Run 34 unit tests (`node --test lib/relationships.test.ts`).
- `npm run benchmark:importer`: Run synthetic Node.js importer performance scenarios.
- `npm run benchmark:importer:browser`: Run isolated medium, high-cardinality and near-limit Chromium import scenarios.
- `npm run benchmark:importer:stages`: Compare DEFLATE/STORE and measure browser import stages.
- `npm run benchmark:importer:realistic`: Compare realistic high-cardinality JSON imports at three scales in Chromium.
- `npm run benchmark:importer:optimization`: Compare the current importer with a benchmark-only direct-Set parser prototype.
- `npm run benchmark:importer:crc32`: Compare production CRC32 with an isolated slicing-by-8 benchmark candidate.
- `npm run benchmark:importer:worker`: Compare main-thread imports with an isolated Worker; optional diagnostic only.
- `npm run benchmark:importer:render`: Profile React dashboard subtrees and a real filter interaction; opt-in development-server benchmark only.
- `npm run profile:importer:browser`: Profile repeated medium/near-limit imports through Chrome DevTools Protocol.
- `npm run typecheck`: Strict TypeScript check (`tsc --noEmit`).
- `npm run build`: Production compilation (`vinext build`).
- `npm run dev`: Development server (`vinext dev`).

---

## 🛡️ Critical Invariants

- **Client-Side Isolation:** 100% in-browser processing. Never introduce remote APIs, functions, or servers for personal data.
- **Zero Telemetry:** Do not transmit Instagram usernames or exported data over any network connection.
- **Selective Extraction & Scope Boundary:** Current functional scope targets followers and following relationships (`followers_*.json`, `followers_*.html`, `following.json`, `following.html`). ZIP imports inspect the central directory and use `File.slice()` to read relevant ranges only; unrelated media and DMs are not extracted. There is no fixed total archive-size rejection, but relevant compressed/decompressed data and standalone files have 30 MiB limits. DEFLATE decompression is chunked; parsing remains per file, not fully streaming.
- **Optional Local Persistence:** IndexedDB (`followlens-local`) only with explicit user opt-in.
- **Account Isolation:** Snapshots from different accounts (`account`) must never be mixed or compared.
- **PolyForm Noncommercial 1.0.0:** Source-available model for personal, educational, and research use. Commercial use requires explicit permission.
