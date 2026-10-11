# AGENTS.md — Repository Operating Guide for FollowLens

> Operational guide for AI coding agents and human maintainers working on **FollowLens — Instagram Relationship Analyzer**.  
> Designed for high signal density, token efficiency, and progressive disclosure.

---

## 1. Project Overview

**FollowLens** is a client-side web application built with **React 19**, **TypeScript**, and **Vinext** (Next.js-compatible framework on **Vite 8**).  
It analyzes Instagram relationships (followers, following, mutuals, unreciprocated, and historical changes) directly from official user data exports (ZIP / JSON) **without credentials, without Instagram API access, and without backend servers for personal data**.

---

## 2. Read First (Progressive Disclosure)

Do NOT load all repository files at once. The shared technical knowledge base is organized under **Open Knowledge Format (OKF v0.2)**:

- **Master Knowledge Index:** [docs/knowledge/index.md](docs/knowledge/index.md)
- **For Architecture & Component Boundaries:** [docs/knowledge/architecture.md](docs/knowledge/architecture.md)
- **For Privacy Rules & Security Bounds:** [docs/knowledge/privacy-and-security.md](docs/knowledge/privacy-and-security.md) *(Mandatory before modifying imports/network/storage)*
- **For Types, Groups & Relationship Logic:** [docs/knowledge/domain-model.md](docs/knowledge/domain-model.md)
- **For ZIP/JSON Extraction & Ingestion:** [docs/knowledge/data-flow.md](docs/knowledge/data-flow.md)
- **For Commands, Tooling & Testing:** [docs/knowledge/development.md](docs/knowledge/development.md)
- **For Architectural Decisions (ADRs):** [docs/knowledge/decisions/](docs/knowledge/decisions/)
  - [ADR-0001: Client-Side Privacy Boundary](docs/knowledge/decisions/0001-client-side-privacy-boundary.md)
  - [ADR-0002: Snapshot Observation Model](docs/knowledge/decisions/0002-snapshot-observation-model.md)
  - [ADR-0003: Optional Local Persistence](docs/knowledge/decisions/0003-optional-local-persistence.md)
  - [ADR-0004: Incremental ZIP Processing (Target)](docs/knowledge/decisions/0004-incremental-zip-processing.md)
- **Specialized Repository Skills:**
  - Import Workflow & ZIP Handling: [.agents/skills/instagram-zip-import/SKILL.md](.agents/skills/instagram-zip-import/SKILL.md)
  - Change & Quality Verification: [.agents/skills/change-verification/SKILL.md](.agents/skills/change-verification/SKILL.md)
  - OKF Documentation Synchronization: [.agents/skills/okf-documentation-sync/SKILL.md](.agents/skills/okf-documentation-sync/SKILL.md)

> [!NOTE]
> **Tool Discovery Protocol for Skills:**
> - **Antigravity IDE / Gemini:** Automatically discovers skills under `.agents/skills/` via workspace customizations root `.agents`.
> - **Gemini CLI:** Does not index `.agents/` automatically; requires explicit skill path or directory configuration.
> - **Claude Code:** Does not auto-discover `.agents/skills/`; tools and agents must navigate explicitly through links in `CLAUDE.md`.
> - **GitHub Copilot:** Does not support the `.agents/skills/` standard; relies on `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md` with explicit links.

---

## 3. Core Invariants (Do Not Break)

1. **100% Client-Side Processing:** All parsing, normalization, set math, and rendering happen strictly in the browser's JavaScript engine. Never introduce server uploads, cloud functions, or remote database persistence for user data.
2. **Zero Telemetry / Zero External Transmission:** Never transmit usernames, follower lists, or exported metadata to third-party endpoints, logging services, or analytics tools.
3. **No Instagram API / No Credentials:** The application does not ask for, accept, or handle Instagram passwords, cookies, or OAuth tokens.
4. **Selective Archive Extraction & Scope Boundary:**
   - The first functional version targets **followers and following relationships exclusively** (`followers_*.json`, `following.json`).
   - The system inspects archive structure to locate only required entries. It must never extract, buffer, or deserialize media (photos, videos, reels, stories), private direct messages, or unrelated metadata.
   - Accepting a complete official ZIP export does NOT mean extracting all contained files.
   - The total archive size of a legitimate ZIP export (e.g. >200 MB) is not, by itself, a valid reason to reject an import.
   - Reading the full ZIP into memory before extraction is a **current implementation constraint** in `lib/importer.ts`, not the desired architectural model. Future evolution must process archives incrementally.
   - Future data categories must be added through distinct, independent analyzers with formal architectural decisions.
5. **Persistence is Explicit and Local:** Data lives in React state by default. Storage in IndexedDB (`followlens-local`) requires voluntary, explicit user opt-in via the import dialog checkbox.
6. **Strict Account Scoping:** Different accounts (`account`) must never have their snapshots compared, merged, or aggregated together.
7. **Observational Snapshot Model:** Changes between snapshots are mathematical differences between discrete export dates, not real-time events or instant unfollow notifications.

---

## 4. Current State vs. Target Architecture

Agents must explicitly distinguish between what is currently implemented and what is planned:

| Aspect | Current Implementation (`lib/importer.ts`) | Target Architecture (Fases 2–4 / ADR-0004) |
|---|---|---|
| **Archive Ingestion** | In-memory buffering via `File.arrayBuffer()`. | Progressive stream/chunked inspection. |
| **Archive Size Limit** | Arbitrary fixed threshold (`MAX_ARCHIVE = 200 MB`). | No arbitrary total archive size rejection; resource-aware handling. |
| **Decompression API** | `fflate.unzip` callback with entry filter. | Incremental selective entry extraction. |
| **JSON Decompression** | Memory cap of 30 MB / 1.000 files decompressed. | Dynamic bounded buffer per target JSON entry. |
| **Parsing Strategy** | Monolithic `JSON.parse` per extracted JSON. | Evaluated in Phase 2 for scale vs. streaming parser. |
| **Functional Scope** | Followers (`followers_*.json`) + Following (`following.json`). | Followers + Following preserved; modular analyzer pipeline prepared. |

> [!IMPORTANT]
> Never state or imply that the incremental streamer or large ZIP support is already implemented until the functional code and tests have been written and validated in their authorized phase.

---

## 5. Operational Commands

Derived directly from `package.json`:

| Task | Command | Purpose | Notes |
|---|---|---|---|
| **Install** | `npm install` | Install workspace dependencies. | Requires Node `>=24`. |
| **Development** | `npm run dev` | Start Vite/Vinext dev server with HMR. | |
| **Build** | `npm run build` | Compile production client and SSR bundles. | `vinext build` (Vite 8.2.2). |
| **Testing** | `npm test` | Run 14 unit test suites. | `node --test lib/relationships.test.ts`. |
| **Typecheck** | `npm run typecheck` | Run strict TypeScript validation. | `tsc --noEmit`. |
| **Formatting** | `npm run format` | Run code formatter via `oxfmt`. | |
| **Linting** | `npm run lint` | Run linter via `oxlint`. | Pre-existing typeAware lint findings in `components/ui/*` and `node:test` (see [development.md](docs/knowledge/development.md)). |
| **Wrangler** | `npm run start` | Start Cloudflare/Wrangler local emulation. | |

---

## 6. Change Workflow

### Before Modifying:
1. Locate the responsible file in the [Architecture Map](docs/knowledge/architecture.md).
2. Consult the relevant knowledge document ([data-flow.md](docs/knowledge/data-flow.md) for parsers, [domain-model.md](docs/knowledge/domain-model.md) for sets/types, [privacy-and-security.md](docs/knowledge/privacy-and-security.md) for data handling).
3. Confirm that the proposed change does NOT violate any of the 7 Core Invariants.
4. For import-related changes, review [.agents/skills/instagram-zip-import/SKILL.md](.agents/skills/instagram-zip-import/SKILL.md).

### After Modifying:
1. Run automated unit tests: `npm test` (must pass 100%).
2. Run TypeScript check: `npm run typecheck` (0 errors).
3. Run build verification: `npm run build` (successful compilation).
4. Review documentation synchronization via [.agents/skills/okf-documentation-sync/SKILL.md](.agents/skills/okf-documentation-sync/SKILL.md).
5. Verify changes through [.agents/skills/change-verification/SKILL.md](.agents/skills/change-verification/SKILL.md).

---

## 7. License and Usage Model

- FollowLens source code is publicly available under the **PolyForm Noncommercial License 1.0.0** (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).
- Noncommercial research, personal study, modification, and experimentation are permitted.
- Commercial use or distribution as part of a commercial product requires separate written authorization from the copyright holder.
