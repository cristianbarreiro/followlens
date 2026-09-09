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
- **For Architecture & Component Responsibilities:** [docs/knowledge/architecture.md](docs/knowledge/architecture.md)
- **For Privacy Rules & Security Boundaries:** [docs/knowledge/privacy-and-security.md](docs/knowledge/privacy-and-security.md) *(Mandatory before modifying imports/network/storage)*
- **For Types, Groups & Relationship Logic:** [docs/knowledge/domain-model.md](docs/knowledge/domain-model.md)
- **For ZIP/JSON Extraction & Validation:** [docs/knowledge/data-flow.md](docs/knowledge/data-flow.md)
- **For Commands, Tooling & Testing:** [docs/knowledge/development.md](docs/knowledge/development.md)
- **For Architectural Decisions (Why):** [docs/knowledge/decisions/](docs/knowledge/decisions/)

---

## 3. Core Invariants (Do Not Break)

1. **100% Client-Side Processing:** All parsing, normalization, set math, and rendering happen in the browser's JavaScript engine. Never introduce server uploads, cloud functions, or remote database persistence for user data.
2. **Zero Telemetry / Zero External Transmission:** Never transmit usernames, followers, or exported metadata to third-party endpoints, logging services, or analytics tools.
3. **No Instagram API / No Credentials:** The application does not ask for or handle Instagram passwords or OAuth tokens.
4. **Selective Archive Extraction:** The `fflate` streaming unpacker must only extract `followers_*.json` and `following.json`. Never extract or buffer photos, media, or private messages in memory.
5. **Persistence is Explicit and Local:** Data stays in React state by default. Storage in IndexedDB (`followlens-local`) requires voluntary user consent via the import checkbox.
6. **Strict Account Scoping:** Different accounts (`account`) must never have their snapshots compared or aggregated together.
7. **Observational Model:** Changes between snapshots are discrete observations between export dates, not real-time events or instant unfollow notifications.

---

## 4. Operational Commands

Derived directly from `package.json`:

| Task | Command | Purpose |
|---|---|---|
| **Install** | `npm install` | Install workspace dependencies (requires Node `>=24`). |
| **Development** | `npm run dev` | Start Vite/Vinext dev server with HMR. |
| **Build** | `npm run build` | Compile production client and SSR bundles with `vinext build`. |
| **Testing** | `npm test` | Run 14 unit test suites via `node --test lib/relationships.test.ts`. |
| **Typecheck** | `npm run typecheck` | Run strict TypeScript validation with `tsc --noEmit`. |
| **Formatting** | `npm run format` | Run code formatter via `oxfmt`. |
| **Linting** | `npm run lint` | Run linter via `oxlint` (see note in [development.md](docs/knowledge/development.md)). |
| **Wrangler** | `npm run start` | Start Cloudflare/Wrangler local emulation. |

---

## 5. Change Workflow

### Before Modifying:
1. Locate the responsible file in the [Architecture Map](docs/knowledge/architecture.md).
2. Consult the relevant knowledge document ([data-flow.md](docs/knowledge/data-flow.md) for parsers, [domain-model.md](docs/knowledge/domain-model.md) for sets/types, [privacy-and-security.md](docs/knowledge/privacy-and-security.md) for data handling).
3. Confirm that the proposed change does NOT violate any of the 7 Core Invariants.

### After Modifying:
1. Run automated unit tests: `npm test` (must pass 100%).
2. Run TypeScript check: `npm run typecheck` (0 errors).
3. Run build verification: `npm run build` (successful compilation).
4. Update technical knowledge documents ONLY if an architectural rule, type, or constraint changed. Avoid unnecessary documentation churn.

---

## 6. License and Usage Model

- FollowLens source code is publicly available under the **PolyForm Noncommercial License 1.0.0** (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).
- Noncommercial research, personal study, modification, and experimentation are permitted.
- Commercial use or distribution as part of a commercial product requires separate written authorization from the copyright holder.
