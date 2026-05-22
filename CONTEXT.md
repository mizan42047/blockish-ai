# Blockish AI Context

## App Summary

Blockish AI is a Node.js 18+ TypeScript backend for storing Blockish page documents/options.

The app uses:

- Express 4 for HTTP routing.
- PostgreSQL through `pg`.
- `pgvector`-style `VECTOR(1536)` storage for document embeddings.
- ESM TypeScript with `module` and `moduleResolution` set to `NodeNext`.

There is no frontend in this repository.

## Entry Points

- `src/index.ts` starts the server, calls `createTables()`, then listens on `config.port`.
- `src/server.ts` builds the Express app, registers middleware, and owns all routes.
- `src/config.ts` loads environment variables with `dotenv/config`.
- `src/db.ts` exports the shared PostgreSQL pool.
- `src/setup.ts` creates required database tables at startup.

## Required Environment

- `DATABASE_URL` is required.
- Ollama is the only configured assistant model provider for local testing.
- `OLLAMA_MODEL` is optional and defaults to `qwen3:8b`.
- `OLLAMA_BASE_URL` is optional and defaults to `http://localhost:11434`.
- `PORT` is optional and defaults to `3000`.
Example local database from `docker-compose.yml`:

```txt
postgres://postgres:postgres@localhost:5432/blockish_ai
```

## Commands

```bash
npm run dev
npm run build
npm run typecheck
npm start
npm test
```

Notes:

- `npm run dev` runs `tsx watch src/index.ts`.
- `npm run build` emits compiled JS into `dist`.
- `npm test` is currently a placeholder and does not run real tests.

## TypeScript And Imports

This project is strict TypeScript:

- `strict: true`
- `noUncheckedIndexedAccess: true`
- ESM output with `NodeNext`.

Import style is important:

- Runtime imports must include `.js` extensions, even when importing `.ts` source files.
- The project uses `baseUrl: "./src"`, so imports like `config.js`, `db.js`, and `agent/tools/index.js` are expected.
- Relative imports also use `.js`, such as `./server.js`.

Follow the existing style:

- 2-space indentation.
- Double quotes.
- Semicolons.
- No trailing whitespace.
- Keep lines reasonably short and readable; prefer wrapping long object literals, argument lists, and ternaries.
- Small focused helper functions.
- Repository functions should own SQL.
- Route callbacks should own HTTP validation/response shaping.

## Coding Style

Use these conventions when adding or changing code:

- Indent TypeScript, JSON, and YAML with 2 spaces.
- Use double quotes for strings.
- Always use semicolons.
- Prefer `const` over `let` unless reassignment is needed.
- Use `type` imports for TypeScript-only imports, for example `import type { Request } from "express";`.
- Keep functions small and single-purpose.
- Prefer explicit return types for exported functions when they clarify the API.
- Use `async`/`await` for asynchronous work.
- Use early returns for validation and error branches instead of deeply nested conditionals.
- Keep route handlers responsible for HTTP status codes and response bodies.
- Keep repositories responsible for SQL and database result mapping.
- Do not introduce broad abstractions until there is real repeated behavior to extract.
- Do not add comments for obvious code; add short comments only where intent would otherwise be hard to see.

Naming conventions:

- Use `camelCase` for variables, functions, methods, and local constants.
- Use `PascalCase` for classes and exported object/type names.
- Use `UPPER_SNAKE_CASE` only for true constants that are not expected to change.
- Preserve database field names like `source_id`, `option_key`, and `option_value` at the API/database boundary.
- Convert to `camelCase` for local TypeScript variables when it improves readability.

Formatting examples:

```ts
import type { Request, Response } from "express";

export async function exampleCallback(req: Request, res: Response) {
  const sourceId = Number(req.params.sourceId);

  if (!Number.isInteger(sourceId)) {
    return res.status(400).json({ ok: false, error: "Invalid sourceId" });
  }

  const document = await getDocumentBySourceId(sourceId);

  if (!document) {
    return res.status(404).json({ ok: false, error: "Not found" });
  }

  res.json({ ok: true, data: document });
}
```

SQL formatting:

- Use parameter placeholders for values, never string interpolation for user-controlled values.
- Keep multi-line SQL in template strings.
- Align major SQL clauses on separate lines.
- Keep dynamic SQL small and whitelist dynamic identifiers before interpolation.

```ts
const result = await pool.query(
  `
  SELECT *
  FROM documents
  WHERE source_id = $1
  LIMIT 1;
  `,
  [sourceId]
);
```

## Database Schema

`createTables()` creates two tables.
`createTables()` also creates `block_suggestions` for future Blockish block ideas collected by agents.

### `documents`

- `id SERIAL PRIMARY KEY`
- `source_id INTEGER UNIQUE`
- `title TEXT NOT NULL`
- `content TEXT NOT NULL`
- `category TEXT NOT NULL`
- `metadata JSONB`
- `embedding VECTOR(1536)`
- `created_at TIMESTAMP DEFAULT NOW()`
- `updated_at TIMESTAMP DEFAULT NOW()`

### `options`

- `option_key TEXT PRIMARY KEY`
- `option_value JSONB NOT NULL`
- `created_at TIMESTAMP DEFAULT NOW()`
- `updated_at TIMESTAMP DEFAULT NOW()`

### `block_suggestions`

- `id SERIAL PRIMARY KEY`
- `title TEXT NOT NULL`
- `normalized_title TEXT UNIQUE NOT NULL`
- `summary TEXT NOT NULL`
- `rationale TEXT NOT NULL`
- `example_usage TEXT`
- `priority TEXT NOT NULL DEFAULT 'medium'`
- `source_agent TEXT NOT NULL DEFAULT 'designer'`
- `metadata JSONB NOT NULL DEFAULT '{}'`
- `mention_count INTEGER NOT NULL DEFAULT 1`
- `created_at TIMESTAMP DEFAULT NOW()`
- `updated_at TIMESTAMP DEFAULT NOW()`

Important: `embedding VECTOR(1536)` requires PostgreSQL support for the vector type. If local startup fails around this column, the database likely needs the pgvector extension enabled.

## HTTP API

All successful JSON responses generally use:

```json
{ "ok": true, "data": {} }
```

Errors generally use:

```json
{ "ok": false, "error": "message" }
```

### Health And Diagnostics

- `GET /health`
  - Returns `{ ok: true }`.
- `GET /test-db`
  - Returns all rows from `documents`, or a 500 if the table is unavailable.

### Assistant

- `POST /assistant`

Accepted body fields:

- `message?: string`
- `input?: string`
- `messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>`
- `attachments?: Array<{ type: "image"; url: string; mimeType?: string; name?: string; size?: number }>`
- `interactionResponse?: unknown`
- `assistantContext?: { scope?: string; mode?: string; blocks?: unknown[] }`

Behavior:

- Uses local Ollama through `@langchain/ollama`; no frontend or backend provider API key is required.
- Runs the Product Manager first. When the model returns a DeepAgents `task` function call for the designer instead of completing the nested run, the callback completes the workflow itself:
  - run designer from the ready product brief,
  - return the Product Manager brief and designer guide in chat for debugging,
  - skip developer/schema generation during the current design-debugging phase.
- Chat-compatible assistant responses include `message`, `reasoning`, `summary`, and `schema: { prev, new }`.
- Creates a LangChain model through `src/agent/utility/create-model.ts`.
- `createModel()` accepts Ollama config and creates a `ChatOllama` model.
- Product Manager DeepAgent creation lives in `src/agent/main-agent.ts`.
- On each assistant request, the backend loads the document whose title is `index` and injects its content as Blockish plugin overview context.
- The Product Manager gathers requirements, asks focused questions, and prepares a page brief.
- The Product Manager can answer Blockish plugin questions using the loaded `index` document context.
- The Product Manager has a first subagent named `designer`.
- The designer subagent lives in `src/agent/subagents/designer-agent.ts`, uses the same Blockish overview context, and runs with a more creative temperature for design-guide work.
- The designer subagent has a `suggest_missing_block` tool from `src/agent/tools/index.ts`.
- Visual asset helpers live in `src/agent/tools/index.ts`:
  - `collect_image_assets` for image candidates and source links,
  - `collect_video_assets` for video source searches,
  - `collect_icon_assets` for Iconify/Lucide SVG icon candidates with inline SVG markup.
- During design-debug mode, the callback collects a visual asset pack in backend code and injects it into the designer prompt instead of relying on model tool calls.
- Designer guides should include an Assets section with concrete asset candidates, URLs/source links, placement, and visual purpose.
- Blockish blocks accept SVG icons only; designer/developer outputs should use inline SVG for icons, not PNG, emoji, font icons, or icon names alone.
- Use `suggest_missing_block` when the current Blockish block set can build the page, but one or two missing blocks would materially improve future design quality or reduce awkward composition.
- Missing block suggestions are saved with upsert semantics in `block_suggestions`, keyed by normalized title and incrementing `mention_count`.
- The Product Manager does not delegate to the developer during the current design-debugging phase.
- The developer subagent exists but is not wired into the Product Manager while designer output is being debugged.
- The Product Manager has a second subagent named `developer` for schema generation when debugging mode is removed.
- The developer subagent lives in `src/agent/subagents/developer-agent.ts`, uses the same Blockish overview context, and runs with low temperature for implementation/schema work.
- The developer subagent should convert briefs and design guides into buildable Blockish/Gutenberg schemas without inventing unsupported blocks, attributes, or extension data.
- Generated schema validation lives in `src/agent/schema.ts`.
- Developer output is parsed and validated against `BlockishGeneratedResponse`; if invalid, the callback asks the developer for one repair attempt before returning.
- Final generated schema uses `schema.new.extensions` and `schema.new.blocks`.
- `schema.new.extensions.classManager` contains Class Manager create/update operations.
- The developer should search the Class Manager documentation before creating/updating global classes, inspect existing request-provided classes, reuse matching classes, create reusable missing classes, and edit existing global classes only when safe or explicitly requested.
- The developer subagent has a `search_block_docs` tool from `src/agent/tools/index.ts`.
- The developer should call `search_block_docs` with a block name before drafting schema for that specific Blockish block.
- For now, the Product Manager should ask exactly one focused next question when more information is needed.
- The Product Manager should not produce a brief until page type, goal, product/business, target audience, and primary CTA are known.
- The assistant callback creates the Product Manager with the configured Ollama model and `temperature: 0.5`, then streams normalized messages through DeepAgents.
- The assistant callback can bypass the Product Manager when a section/page request already has enough conversation context, then run designer and developer directly to produce `schema.new`.
- If developer schema generation fails or returns invalid JSON, the callback returns a minimal valid Blockish schema fallback instead of leaving `schema.new` empty.
- Assistant interaction buttons are derived from explicit `**Options:**` model output or inferred by backend heuristics for common questions such as gym type, primary CTA/goal, target audience, and yes/no.
- When the Product Manager delegates to the designer, the callback returns both the Product Manager brief sent to the designer and the designer guide as the final chat message, leaving `schema.new` as `null`.
- If the Product Manager returns a ready page brief without a `designer` task call, the callback treats that brief as designer input and continues the design-debug flow.
- Subagent text extraction combines assistant text messages so tool calls do not cause partial designer output to be returned.
- Image attachments are converted into multimodal content on the latest user message before the agent run.
- Valid assistant responses use Server-Sent Events with `delta`, `final`, `done`, and `error` events.
- The `final` event contains chat-compatible data: `{ message, summary, schema: { prev, new }, interaction? }`.
- Quick-choice `interaction` generation is disabled during provider testing because hardcoded heuristic options can mismatch the actual model question.

### Block Suggestions

- `GET /block-suggestions`
  - Reads future Blockish block suggestions collected by agents.
  - Query filters:
    - `search`
    - `priority`
    - `sourceAgent`
    - `limit`
    - `offset`
    - `orderBy`: `mention_count`, `updated_at`, or `created_at`
    - `order`: `asc` or `desc`

### Documents

- `GET /documents`
  - Query filters:
    - `category`
    - `sourceIds`
    - `search`
    - `updatedAfter`
    - `updatedBefore`
    - `limit`
    - `offset`
    - `orderBy`: `created_at` or `updated_at`
    - `order`: `asc` or `desc`

- `GET /documents/:sourceId`
  - Looks up by numeric `source_id`.

- `POST /documents`
  - Requires `source_id`.
  - Creates or updates one document.
  - Required on create: `title`, `content`, `category`.
  - Optional: `metadata`, `embedding`.
  - On update, at least one update field is required.

- `POST /documents/batch`
  - Accepts either an array body or `{ "documents": [...] }`.
  - Creates or updates multiple documents.
  - Validates each document before writing.

- `DELETE /documents/:sourceId`
  - Deletes one document by numeric `source_id`.

- `DELETE /documents/batch`
  - Accepts either an array body or `{ "sourceIds": [...] }`.

### Options

- `PUT /options/:optionKey`
  - Accepts `option_value` or `value` in the body.
  - Upserts the option row.

- `DELETE /options/:optionKey`
  - Deletes one option by key.

## Main Modules

### `src/server.ts`

Creates an `AppServer` class and registers:

- JSON parsing.
- CORS with `origin: "*"`.
- Morgan dev logging.
- Helmet.
- All API routes.

Keep new HTTP behavior close to this file unless it grows enough to justify route modules.

### `src/routes/document.ropository.ts`

Owns SQL for document CRUD.

Important details:

- The filename is currently spelled `ropository`, not `repository`.
- It uses parameterized SQL values.
- Batch upsert builds placeholders dynamically.
- `getDocuments()` clamps `limit` to `0..1000` and defaults ordering to `updated_at DESC`.

### `src/routes/options.repository.ts`

Owns SQL for options upsert/delete.

### `src/middlewares/document.middleware.ts`

Contains request-shape middleware for document endpoints:

- `requireDocumentSourceId`
- `requireDocumentsPayload`
- `requireSourceIdsPayload`

### `src/agent/callbacks/assistant.callback.ts`

Contains the empty placeholder callback for `POST /assistant`.

### `src/types.ts`

Contains shared request/normalization types for documents.

### `src/utils.ts`

Small parsing/validation helpers:

- `isNonEmptyString`
- `parseNumber`
- `parseDate`

## Implementation Guidance

When writing code in this repo:

- Keep SQL inside repository files.
- Keep request validation near route handlers or middleware.
- Return consistent `{ ok, data }` and `{ ok, error }` JSON shapes.
- Use parameterized SQL for values.
- Avoid interpolating user-controlled strings into SQL. For unavoidable SQL identifiers, whitelist them first, like `orderBy` does.
- Preserve ESM `.js` import extensions.
- Add shared types to `src/types.ts` only when they are used across modules.
- Prefer small helpers in `src/utils.ts` for generic parsing/validation.
- Do not add frontend tooling unless explicitly requested.
- Do not edit generated folders such as `node_modules` or `dist`.

## Verification Checklist

After code changes, run:

```bash
npm run typecheck
npm run build
```

If route behavior changes, manually exercise the affected endpoint with a representative request. There are currently no real automated tests.

## Known Caveats

- `sourceIds` in `GetDocumentsQuery` is typed as `number[]`, but Express query strings commonly arrive as strings or arrays of strings. Be careful when extending filtering behavior.
- `source_id` is converted with `Number(...)`; invalid numeric input can become `NaN`. New code should validate numeric route/body fields explicitly when behavior depends on them.
- `metadata` and `option_value` are typed as `any`; validate shape at the route boundary when adding stricter features.
- `VECTOR(1536)` may require `CREATE EXTENSION vector` in PostgreSQL before table creation.

## Reusable Coding Prompt

Use this prompt when asking an AI agent to write code in this repository:

```txt
You are working in the Blockish AI backend repository.

Read CONTEXT.md first, then inspect the relevant source files before editing. This is a Node.js 18+ TypeScript ESM Express API with PostgreSQL. Preserve the existing architecture:

- Express route wiring lives in src/server.ts.
- SQL data access lives in repository files under src/routes.
- Document request-shape middleware lives in src/middlewares/document.middleware.ts.
- Shared types belong in src/types.ts only when used across modules.
- Generic parsing/validation helpers belong in src/utils.ts.

Follow the existing TypeScript style: strict types, double quotes, semicolons, small functions, and runtime imports with .js extensions. Use parameterized SQL for values and whitelist any SQL identifiers before interpolating them. Keep JSON responses consistent with the existing { ok: true, data } and { ok: false, error } shapes.

Do not touch node_modules, dist, package lockfiles, or unrelated user changes unless the requested task requires it. Keep changes focused. After editing, run npm run typecheck and npm run build, then report what changed and whether verification passed.

Task:
[Describe the requested code change here.]
```
