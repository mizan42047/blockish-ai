# Blockish AI — Development Skill

You are working in the **Blockish AI backend** repository. Load this skill at the start of any coding session. It encodes all project conventions, module boundaries, agent architecture, and verification steps.

Read `CONTEXT.md` before editing any file. If source code disagrees with `CONTEXT.md`, trust the source code.

---

## Project Overview

Blockish AI is a Node.js 18+ TypeScript ESM Express API that orchestrates a multi-agent AI workflow to generate Blockish/Gutenberg page schemas. It uses PostgreSQL for persistence, DeepAgents + LangChain for agent orchestration, and OpenRouter for LLM inference.

There is no frontend in this repository.

---

## Module Map

| File / Directory | Owns |
|---|---|
| `src/index.ts` | App startup: server, `createTables()`, listen |
| `src/server.ts` | Express app, all middleware, all route registration, all route callbacks |
| `src/config.ts` | `dotenv/config` environment loading |
| `src/db.ts` | Shared PostgreSQL pool singleton |
| `src/setup.ts` | `createTables()` — database schema initialization |
| `src/types.ts` | Shared cross-module TypeScript types |
| `src/utils.ts` | Generic parsing/validation helpers (`isNonEmptyString`, `parseNumber`, `parseDate`, `sendSuccessResponse`, `sendErrorResponse`) |
| `src/middlewares/document.middleware.ts` | Request-shape validation middleware (`requireDocumentSourceId`, `requireDocumentsPayload`, `requireSourceIdsPayload`) |
| `src/routes/document.ropository.ts` | SQL for document CRUD (note: intentional typo — do not rename) |
| `src/routes/options.repository.ts` | SQL for options upsert/delete |
| `src/routes/block-suggestions.repository.ts` | SQL for block suggestions upsert/query |
| `src/agent/main-agent.ts` | Product Manager DeepAgent (`createProductManagerAgent`) |
| `src/agent/subagents/designer-agent.ts` | Designer subagent — creative design guide (temp 0.9) |
| `src/agent/subagents/developer-agent.ts` | Developer subagent — schema generation (temp 0.1) |
| `src/agent/tools/index.ts` | All LangChain tool definitions: `search_block_docs`, `search_docs`, `suggest_missing_block` |
| `src/agent/schema.ts` | `BlockishGeneratedResponse` validator and type definitions |
| `src/agent/context/document-context.ts` | `getBlockishOverviewContext()` — loads "index" document from DB |
| `src/agent/utility/create-model.ts` | `createModel()` — LangChain ChatOpenRouter factory |
| `src/agent/callbacks/assistant.callback.ts` | `POST /assistant` SSE streaming handler |

---

## Agent Architecture

The `/assistant` endpoint runs a three-stage orchestration pipeline:

```
POST /assistant
  │
  ├─ Load "index" document → Blockish overview context
  │
  ├─ Product Manager Agent (temp 0.5, model: openrouter/free)
  │   Gathers: page type, goal, product/business, audience, CTA
  │   Asks one focused question per turn until all fields known
  │   Delegates via DeepAgents task() call when brief is ready
  │
  ├─ Designer Subagent (temp 0.9)
  │   Input: product brief
  │   Output: implementation-ready design guide
  │   Tool: suggest_missing_block
  │
  └─ Developer Subagent (temp 0.1)
      Input: brief + design guide + existing blocks/classes
      Output: BlockishGeneratedResponse JSON (no markdown fences)
      Tools: search_block_docs, search_docs
      Validation: schema.ts validates output; one repair attempt if invalid
```

**SSE response events:** `delta` (token stream) → `final` (full response) → `done`

**Final response shape:**
```ts
{
  message: string;
  reasoning: string[];
  summary: string;
  schema: { prev: BlockishGeneratedSchema | null; new: BlockishGeneratedSchema | null };
  interaction?: { id, type, label, options, allowCustom?, required? };
}
```

---

## Database Schema

Three tables created by `createTables()` in `src/setup.ts`:

**`documents`** — Blockish plugin documentation storage  
`id`, `source_id` (UNIQUE), `title`, `content`, `category`, `metadata` (JSONB), `embedding` (VECTOR(1536)), `created_at`, `updated_at`

**`options`** — Key-value configuration store  
`option_key` (PRIMARY KEY), `option_value` (JSONB), `created_at`, `updated_at`

**`block_suggestions`** — Missing block ideas collected by designer agent  
`id`, `title`, `normalized_title` (UNIQUE), `summary`, `rationale`, `example_usage`, `priority`, `source_agent`, `metadata` (JSONB), `mention_count` (increments on duplicate), `created_at`, `updated_at`

> `VECTOR(1536)` requires `CREATE EXTENSION vector` in PostgreSQL.

---

## HTTP API

All JSON responses use:
- Success: `{ ok: true, data: ... }`
- Error: `{ ok: false, error: "..." }`

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/test-db` | Database connectivity test |
| POST | `/assistant` | AI agent orchestration (SSE streaming) |
| GET | `/block-suggestions` | Query block suggestions |
| GET | `/documents` | Query documents |
| GET | `/documents/:sourceId` | Get document by source_id |
| POST | `/documents` | Create/update one document |
| POST | `/documents/batch` | Batch create/update documents |
| DELETE | `/documents/:sourceId` | Delete one document |
| DELETE | `/documents/batch` | Batch delete documents |
| PUT | `/options/:optionKey` | Upsert option |
| DELETE | `/options/:optionKey` | Delete option |

---

## Coding Conventions

### TypeScript
- Strict mode (`strict: true`, `noUncheckedIndexedAccess: true`)
- `import type` for type-only imports
- `camelCase` for variables/functions, `PascalCase` for classes/types
- `snake_case` preserved at the DB/API boundary (`source_id`, `option_key`, `option_value`)
- `const` over `let` unless reassignment is needed
- `async`/`await` for all async code
- Early returns for validation and error branches

### Formatting
- 2-space indentation for TypeScript, JSON, YAML
- Double quotes for strings
- Semicolons always
- No trailing whitespace

### ESM Imports
- Runtime imports **must** include `.js` extensions even for `.ts` source files
- `baseUrl: "./src"` — use bare imports like `"config.js"`, `"db.js"`, `"agent/tools/index.js"`
- Relative imports also use `.js`: `"./server.js"`, `"../utils.js"`

### SQL
- Parameterized values only — never string-interpolate user input into SQL
- For dynamic SQL identifiers (e.g., `orderBy`), whitelist allowed values before interpolation
- Multi-line SQL in template strings, major clauses on separate lines

### File Safety
- Do not rename `src/routes/document.ropository.ts` — the misspelling is intentional and imported as-is
- Do not edit `node_modules` or `dist`
- Do not overwrite unrelated user changes
- Do not modify `package.json` / lockfiles unless the task requires a dependency change

---

## Common Task Workflows

### Add an agent tool
1. Define the tool in `src/agent/tools/index.ts` using LangChain `tool()` / `DynamicStructuredTool`
2. Register the tool in the relevant subagent (`designer-agent.ts` or `developer-agent.ts`)
3. If the tool needs DB access, add a repository function in the relevant `src/routes/*.repository.ts`

### Modify agent behavior
- **Product Manager**: edit system prompt in `src/agent/main-agent.ts`
- **Designer**: edit system prompt in `src/agent/subagents/designer-agent.ts`
- **Developer**: edit system prompt in `src/agent/subagents/developer-agent.ts`
- Temperature adjustments live alongside the system prompt in each file

### Add an HTTP route
1. Add the route callback function in `src/server.ts`
2. Register the route in `AppServer` in `src/server.ts`
3. Add SQL in the relevant `src/routes/*.repository.ts`
4. Add request-shape validation middleware in `src/middlewares/document.middleware.ts` if needed

### Extend generated schema validation
- Edit `src/agent/schema.ts`: add to `validateBlock()`, `validateGeneratedResponse()`, or add a new validator
- Add/update types (`BlockishSchemaBlock`, `BlockishGeneratedSchema`, `BlockishGeneratedResponse`)

### Change database schema
- Edit `createTables()` in `src/setup.ts`
- Update corresponding TypeScript types in the affected repository file
- Note: table creation is `IF NOT EXISTS` — schema migrations require manual SQL for existing deployments

### Add shared types
- Add to `src/types.ts` only when the type is used across two or more modules
- Keep single-module types local to that file

### Add a parsing/validation helper
- Add to `src/utils.ts` for generic, stateless helpers
- Keep domain-specific logic in the relevant module

---

## Environment

Required:
- `DATABASE_URL` — PostgreSQL connection string (e.g., `postgres://postgres:postgres@localhost:5432/blockish_ai`)

Optional:
- `PORT` — defaults to `3000`

Local development uses Docker Compose for PostgreSQL. Start with `docker compose up -d`.

---

## Verification

After any code change, run both commands and confirm they pass before reporting done:

```bash
npm run typecheck
npm run build
```

If a route's behavior changes, manually test the affected endpoint with a representative request.

There are currently no automated integration tests — `npm test` is a placeholder.

---

## Final Response Format

When a task is complete, report:
1. **What changed** — list each modified file and what was changed
2. **Verification** — whether `typecheck` and `build` passed (or why they could not be run)
3. **Caveats** — any follow-up risks, edge cases, or known limitations introduced

Keep the response concise and specific.
