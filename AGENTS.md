# AGENTS.md — Repository Operating Guide for FollowLens

> Operational guide for AI coding agents and human maintainers working on **FollowLens — Instagram Relationship Analyzer**.  
> Designed for high signal density, token efficiency, and progressive disclosure.

---

## 1. Project Overview

**FollowLens** is a client-side web application built with **React 19**, **TypeScript**, and **Vinext** (Next.js-compatible framework on **Vite 8**).  
It analyzes Instagram relationships (followers, following, mutuals, unreciprocated, and historical changes) directly from official user data exports (ZIP / JSON / HTML) **without credentials, without Instagram API access, and without backend servers for personal data**.

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
  - [ADR-0004: Selective ZIP Processing](docs/knowledge/decisions/0004-incremental-zip-processing.md)
- **Specialized Repository Skills:**
  - Import Workflow & ZIP Handling: [.agents/skills/instagram-zip-import/SKILL.md](.agents/skills/instagram-zip-import/SKILL.md)
  - Change & Quality Verification: [.agents/skills/change-verification/SKILL.md](.agents/skills/change-verification/SKILL.md)
  - OKF Documentation Synchronization: [.agents/skills/okf-documentation-sync/SKILL.md](.agents/skills/okf-documentation-sync/SKILL.md)

> [!NOTE]
> **Tool Discovery Protocol for Skills:**
> - **Specification & Format:** All repository skills located under `.agents/skills/` follow the open Agent Skills specification (`SKILL.md` with YAML frontmatter `name` and `description`).
> - **Antigravity IDE & Gemini CLI:** Natively recognize `.agents/skills/` (in Gemini CLI, `.agents/skills` is an officially recognized standard alias alongside `.gemini/skills/`) with progressive discovery and activation based on task descriptions.
> - **GitHub Copilot:** In environments with Agent Skills support (such as Copilot Agent Mode), `.agents/skills/` is automatically discovered alongside `.github/skills/` and `.claude/skills/`. In standard completion or classic chat modes, Copilot relies on instructions in `.github/copilot-instructions.md` and `.github/instructions/*.instructions.md`.
> - **Claude Code:** Supports the Agent Skills standard with native discovery under `.claude/skills/`; for shared repository skills located in `.agents/skills/`, tools and agents navigate via explicit references in `CLAUDE.md`.

---

## 3. Core Invariants (Do Not Break)

1. **100% Client-Side Processing:** All parsing, normalization, set math, and rendering happen strictly in the browser's JavaScript engine. Never introduce server uploads, cloud functions, or remote database persistence for user data.
2. **Zero Telemetry / Zero External Transmission:** Never transmit usernames, follower lists, or exported metadata to third-party endpoints, logging services, or analytics tools.
3. **No Instagram API / No Credentials:** The application does not ask for, accept, or handle Instagram passwords, cookies, or OAuth tokens.
4. **Selective Archive Extraction & Scope Boundary:**
   - The first functional version targets **followers and following relationships exclusively** (`followers_*.json`, `followers_*.html`, `following.json`, `following.html`).
   - The system inspects archive structure to locate only required entries. It must never extract, buffer, or deserialize media (photos, videos, reels, stories), private direct messages, or unrelated metadata.
   - Accepting a complete official ZIP export does NOT mean extracting all contained files.
   - The total archive size of a legitimate ZIP export (e.g. >200 MB) is not, by itself, a valid reason to reject an import.
   - ZIP imports use central-directory inspection and `File.slice()` range reads to extract only relevant entries; the full ZIP is not loaded into memory. Standalone relevant files are read individually with a cumulative 30 MiB limit. Relevant ZIP entries and their cumulative compressed/decompressed data are also bounded to 30 MiB.
   - DEFLATE entries are decompressed in chunks under the output limit. JSON and HTML are still parsed per file (`JSON.parse` / `DOMParser`); this is not a fully streaming parser or sequential whole-archive streaming implementation.
   - Future data categories must be added through distinct, independent analyzers with formal architectural decisions.
5. **Persistence is Explicit and Local:** Data lives in React state by default. Storage in IndexedDB (`followlens-local`) requires voluntary, explicit user opt-in via the import dialog checkbox.
6. **Strict Account Scoping:** Different accounts (`account`) must never have their snapshots compared, merged, or aggregated together.
7. **Observational Snapshot Model:** Changes between snapshots are mathematical differences between discrete export dates, not real-time events or instant unfollow notifications.

---

## 4. Current State vs. Target Architecture

Agents must explicitly distinguish between what is currently implemented and what is planned:

| Aspect | Current Implementation (`lib/importer.ts`, `lib/zip.ts`) | Further Evolution |
|---|---|---|
| **ZIP Ingestion** | EOCD and central-directory inspection followed by `File.slice()` reads of relevant entry ranges; unrelated entry data is not read. | Preserve selective reads while evaluating browser-friendly progress and cancellation. |
| **Standalone Files** | Relevant files are read individually with `File.arrayBuffer()` and a 30 MiB cumulative limit. | Any change must retain bounded resource use. |
| **Total ZIP Size** | No arbitrary total archive-size rejection; the central directory and relevant entry data have independent limits. | Continue resource-aware handling without a fixed container-size cap. |
| **Decompression** | STORE is copied directly; DEFLATE is expanded in chunks with a 30 MiB per-entry and cumulative output budget. | Further reduce transient memory where justified. |
| **Parsing Strategy** | `JSON.parse` / `DOMParser` processes each relevant file after bounded extraction. | Evaluate streaming parsers only if scale warrants their complexity. |
| **Functional Scope** | Followers and following, in JSON or HTML, with sequential follower-part validation. | Future analyzers require independent design decisions. |

> [!IMPORTANT]
> Selective ZIP range reading and chunked DEFLATE decompression are implemented. Do not describe the importer as a fully sequential streaming archive reader or a streaming JSON/HTML parser.

---

## 5. Operational Commands

Derived directly from `package.json`:

| Task | Command | Purpose | Notes |
|---|---|---|---|
| **Install** | `npm install` | Install workspace dependencies. | Requires Node `>=24`. |
| **Development** | `npm run dev` | Start Vite/Vinext dev server with HMR. | |
| **Build** | `npm run build` | Compile production client and SSR bundles. | `vinext build` (Vite 8.2.2). |
| **Testing** | `npm test` | Run 34 unit tests. | `node --test lib/relationships.test.ts`. |
| **Importer benchmark** | `npm run benchmark:importer` | Measure synthetic import stages and resource snapshots in Node.js. | Optional local benchmark; no timing thresholds. |
| **Browser-scale benchmark** | `npm run benchmark:importer:browser` | Measure synthetic medium, high-cardinality and near-limit imports in Chromium. | Standalone opt-in run; includes limit rejection/recovery. |
| **Browser stage comparison** | `npm run benchmark:importer:stages` | Compare DEFLATE/STORE and instrument browser import stages. | Two repetitions per synthetic scenario; opt-in, no thresholds. |
| **Realistic browser benchmark** | `npm run benchmark:importer:realistic` | Compare high-cardinality official-schema JSON imports in Chromium. | Three scales and two repetitions; synthetic, opt-in, no thresholds. |
| **Importer optimization experiment** | `npm run benchmark:importer:optimization` | Compare current import path with an isolated direct-Set parser prototype. | Three repetitions after warm-up at three scales; benchmark-only. |
| **CRC32 alternative benchmark** | `npm run benchmark:importer:crc32` | Compare production CRC32 with a benchmark-only slicing-by-8 implementation. | Five repetitions per ZIP entry and scale; synthetic Chromium run, no thresholds. |
| **Browser CPU profile** | `npm run profile:importer:browser` | Profile medium and near-limit imports with CDP. | Standalone opt-in; summary only, no raw profile files. |
| **Browser E2E** | `npm run test:e2e` | Run importer regressions in Chromium. | Install once with `npx playwright install chromium`. |
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
