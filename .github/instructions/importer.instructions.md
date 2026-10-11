---
applyTo:
  - "lib/importer.ts"
  - "lib/relationships.ts"
  - "lib/relationships.test.ts"
  - "components/import-dialog.tsx"
---

# Copilot Instruction: Data Import & Relationship Processing

These specific instructions apply whenever modifying files involved in archive extraction, relationship parsing, or import user experience.

> [!NOTE]
> In environments or Copilot versions where path-based instruction scoping (`applyTo`) is not automatically evaluated, agents and developers must consult this document manually before making changes to the scoped files.

## 1. Mandatory Pre-Flight Reading
Before modifying any import or parser code:
1. Review architecture boundaries in [docs/knowledge/architecture.md](docs/knowledge/architecture.md).
2. Review the data ingestion pipeline in [docs/knowledge/data-flow.md](docs/knowledge/data-flow.md).
3. Review security and privacy invariants in [docs/knowledge/privacy-and-security.md](docs/knowledge/privacy-and-security.md).
4. Review [ADR-0004: Incremental ZIP Processing](docs/knowledge/decisions/0004-incremental-zip-processing.md).

## 2. Ingestion & Extraction Invariants
- **Scope Boundary:** Only process `followers_*.json` and `following.json` (and legitimate schema variants). Never extract, buffer, or deserialize media (photos, videos, audio, stories) or private direct messages.
- **Archive Size Distinction:** Legitimate full exports from Instagram can easily exceed 200 MB (e.g. 232 MB with media included). The target architecture does NOT reject archives purely based on overall ZIP file size.
- **Memory Responsibility:** Never buffer entire large archives or all uncompressed files concurrently in memory without bounded limits. Avoid allocating full `ArrayBuffer` instances for large archives.
- **Missing Parts Detection:** Always enforce sequential follower file validation (e.g. `followers_1.json`, `followers_2.json`). Missing intermediate parts (e.g. 1 and 3 without 2) MUST reject the import to prevent corrupting historical unfollow math.
- **Integrity over Partial Display:** Never present incomplete parses as valid snapshots. If extraction or parsing fails or is cancelled, clean up state and surface an actionable error.
- **Single Account Rule:** Reject archives that contain multiple distinct account directories or conflicting duplicate files.

## 3. Testing Requirements
- Every change to ingestion or parsing logic must be covered by tests in `lib/relationships.test.ts`.
- Use synthetic in-memory fixtures (via `fflate.zipSync`). **Never use real personal Instagram export data.**
- Verify error paths: corrupted ZIP, missing parts, unsupported schemas, empty legitimate files.

## 4. Verification Gate
Before concluding work:
- Run `npm test` (all tests passing).
- Run `npm run typecheck` (0 errors).
- Run `npm run build` (build succeeds).
