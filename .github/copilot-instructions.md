# GitHub Copilot Instructions — FollowLens

FollowLens is a client-side Instagram relationship analyzer built with React 19, TypeScript, Vite, and Vinext.

## Core Directives

1. **Read Before Acting (Progressive Disclosure):**
   - Consult [AGENTS.md](AGENTS.md) as the primary operating guide.
   - Load only relevant technical documents from [docs/knowledge/index.md](docs/knowledge/index.md).
   - Consult [docs/knowledge/privacy-and-security.md](docs/knowledge/privacy-and-security.md) before touching data handling, imports, or storage.
   - For import modifications, follow [.github/instructions/importer.instructions.md](.github/instructions/importer.instructions.md) and [.agents/skills/instagram-zip-import/SKILL.md](.agents/skills/instagram-zip-import/SKILL.md).

2. **Client-Side Privacy Boundary:**
   - 100% in-browser processing. Never introduce backend services, cloud functions, or remote uploads for user data.
   - Zero telemetry: never send usernames, IDs, or metadata across the network.
   - No Instagram credentials, no scraping, no Instagram API.

3. **Code & Engineering Discipline:**
   - Make minimal, focused, and scoped modifications. Do not perform gratuitous refactoring.
   - Do not invent behaviors, library APIs, or synthetic guarantees not supported by actual dependencies (e.g. check `fflate` 0.8.3 capabilities).
   - Distinguish verified results from theoretical assumptions.
   - Never commit or log real user export data into fixtures, logs, or comments.

4. **Validation Requirements:**
   - After code changes, run and verify:
     1. `npm test` (all unit tests must pass).
     2. `npm run typecheck` (zero TypeScript errors).
     3. `npm run build` (successful production bundle).
   - Document any pre-existing linting notes (see [docs/knowledge/development.md](docs/knowledge/development.md)).

5. **Documentation Synchronization:**
   - When architectural boundaries, data models, or validation rules change, synchronize [docs/knowledge/](docs/knowledge/) and [AGENTS.md](AGENTS.md) following OKF v0.2.
