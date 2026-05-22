# Blockish AI Context

## App Summary

Blockish AI is a Node.js 18+ TypeScript backend for storing Blockish page documents/options.

The app uses:

- Express 4 for HTTP routing.
- `ws` for the assistant WebSocket transport.
- PostgreSQL through `pg`.
- `pgvector`-style `VECTOR(1536)` storage for document embeddings.
- ESM TypeScript with `module` and `moduleResolution` set to `NodeNext`.

There is no frontend in this repository.

## Entry Points

- `src/index.ts` starts the server, calls `createTables()`, then listens on `config.port`.
- `src/index.ts` also registers the assistant WebSocket transport on the same HTTP server.
- `src/server.ts` builds the Express app, registers middleware, and owns all routes.
- `src/config.ts` loads environment variables with `dotenv/config`.
- `src/db.ts` exports the shared PostgreSQL pool.
- `src/setup.ts` creates required database tables at startup.

## Required Environment

- `DATABASE_URL` is required.
- The assistant model uses LangChain `ChatOpenAI` against an OpenAI-compatible endpoint. Local testing points this at Ollama.
- `OLLAMA_MODEL` is optional and defaults to `qwen3:8b`.
- `OLLAMA_BASE_URL` is optional and defaults to `http://localhost:11434/v1`.
- `OPENAI_API_KEY` is optional and defaults to `ollama` for local Ollama testing.
- `BLOCKISH_WS_AUTH_SECRET` signs and verifies assistant WebSocket auth tokens. It currently defaults to `blockish-local-dev-secret` for local development and should be overridden outside local testing.
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
  - Debug/compatibility transport.
  - Returns plain JSON after the assistant run completes.

- `WebSocket /assistant/ws`
  - Direct assistant transport for long-running chat interactions.
  - Requires a signed `token` query parameter before the WebSocket upgrade is accepted.
  - Client sends `assistant.request` messages with the same body shape as `POST /assistant`.
  - Client can send `assistant.cancel` with the same `requestId` to abort an active request.
  - Server emits `assistant.started`, `assistant.status`, `assistant.final`, `assistant.done`, `assistant.error`, and `assistant.cancelled` events.

Accepted body fields:

- `message?: string`
- `input?: string`
- `messages?: Array<{ role: "user" | "assistant" | "system"; content: string }>`
- `attachments?: Array<{ type: "image"; url: string; mimeType?: string; name?: string; size?: number }>`
- `interactionResponse?: unknown`
- `assistantContext?: { scope?: string; mode?: string; blocks?: unknown[] }`

Behavior:

- Uses `ChatOpenAI` from `@langchain/openai` against the configured OpenAI-compatible base URL.
- Assistant callback orchestration stays in `src/agent/callbacks/assistant.callback.ts`.
- Shared assistant execution lives in `src/agent/callbacks/assistant-runner.ts` so REST and WebSocket use the same request normalization and agent execution path.
- WebSocket auth verification lives in `src/agent/callbacks/assistant-ws-auth.ts`.
- WebSocket delta filtering lives in `src/agent/callbacks/assistant-delta.ts`; it extracts the Product Manager JSON `answer` field so raw structured JSON is not displayed in chat.
- The assistant WebSocket transport lives in `src/agent/callbacks/assistant.websocket.ts`.
- Assistant callback helper modules live beside it as `assistant-*.ts` files for request parsing, result parsing, context shaping, interaction parsing, model config, cached agent initialization, schema extraction, agent invocation, and shared types.
- Runs the Product Manager agent first through LangChain `createAgent`.
- The current Product Manager agent gathers requirements, answers questions, breaks work into a short todo list, shares concise public reasoning, and prepares the next useful product-management step.
- The Product Manager uses a Zod schema with LangChain `providerStrategy` for `answer`, `reasoning`, `todo`, and `summary`. The PM prompt should describe behavior only, not the JSON output contract.
- The Product Manager structured response also includes nullable `interaction`; backend should prefer this model-provided interaction over markdown parsing or heuristic inference.
- Before changing LangChain agent orchestration, structured output, streaming, HITL, middleware, or tool-call behavior, verify the current official LangChain JavaScript documentation first and base recommendations on those docs.
- Do not guess LangChain HITL behavior from memory. Current official LangChain JS HITL is middleware-driven tool-call interrupt/resume: use `humanInTheLoopMiddleware`, a checkpointer such as `MemorySaver` or a persistent saver, stable `thread_id`, and `Command({ resume })` decisions.
- Real small-question human-in-the-loop uses the `ask_user` tool in `src/agent/tools/index.ts`. The Product Manager should call `ask_user` instead of writing clarification questions in the final answer.
- The current installed LangChain HITL middleware supports `approve`, `edit`, and `reject` decision types. Until `respond` is available in the installed package, resume `ask_user` by sending an `edit` decision that keeps the tool name `ask_user` and adds the human answer to the edited tool args.
- Treat final-response `interaction`, markdown `**Options:**` parsing, and heuristic interaction inference as temporary compatibility only; they are not the primary HITL design. If the model still writes a user question as a final response, the callback reroutes it as an `assistant.interrupt` instead of allowing the question to appear as a completed answer. Final-response question fallback should parse simple `e.g.` examples into choice buttons; otherwise it should use a text interaction.
- Designer orchestration is wired into the main Product Manager `createAgent` flow as a LangChain subagent tool named `designer`.
- Chat-compatible assistant responses include `message`, `metrics`, `reasoning`, `todo`, `summary`, and `schema: { prev, new }`.
- Creates a LangChain model through `src/agent/utility/create-model.ts`.
- `createModel()` accepts full `ChatOpenAI` config and passes it through without rebuilding or limiting constructor fields.
- Product Manager LangChain agent creation lives in `src/agent/main-agent.ts`.
- On the first assistant request, the backend caches the Product Manager agent for reuse without injecting the full Blockish overview document into the system prompt.
- The Product Manager gathers requirements, asks focused questions, and prepares a page brief.
- The Product Manager can answer Blockish plugin questions with the `read_blockish_overview` tool, which reads the `index` document only when Blockish context is needed.
- `read_blockish_overview` chunks the overview with LangChain `RecursiveCharacterTextSplitter` and returns one chunk plus `nextCursor` at a time.
- The designer subagent tool lives in `src/agent/subagents/designer-agent.ts`. It creates a focused `createAgent` designer and wraps it with a LangChain tool, following the official multi-agent subagents pattern.
- The designer tool can use `read_blockish_overview`, `search_docs`, visual asset helpers, and `suggest_missing_block`; it returns JSON to the Product Manager with exactly `brief` and `assets`, where assets contains `icons`, `images`, and `videos`.
- Blockish blocks accept SVG icons only; designer/developer outputs should use inline SVG for icons, not PNG, emoji, font icons, or icon names alone.
- `suggest_missing_block` is available to the designer tool for future Blockish block ideas when an absent block would materially improve a design.
- Missing block suggestions are saved with upsert semantics in `block_suggestions`, keyed by normalized title and incrementing `mention_count`.
- Developer orchestration is wired into the main Product Manager `createAgent` flow as a LangChain subagent tool named `developer`.
- The developer subagent tool lives in `src/agent/subagents/developer-agent.ts`. It creates a focused low-temperature `createAgent` developer and wraps it with a LangChain tool.
- The developer tool converts Product Manager briefs, approved Designer briefs, and Designer assets into buildable Blockish/Gutenberg schemas without inventing unsupported blocks, attributes, or extension data.
- Before running the developer model, the developer tool automatically loads relevant docs from the `documents` table based on the brief/design/assets. It always includes Index, Class Manager, Container, and Heading when available, then adds request-relevant block docs such as Accordion for FAQ or Image for team/gallery work.
- Generated schema validation lives in `src/agent/schema.ts`.
- Schema validation rejects unsupported `blockish/*` block names and explicitly rejects `blockish/paragraph`; text/paragraph content should be represented with `blockish/heading` configured as paragraph-style text.
- Developer output is parsed and validated against `BlockishGeneratedResponse`; if invalid, the callback asks the developer for one repair attempt before returning.
- Final generated schema uses `schema.new.extensions` and `schema.new.blocks`.
- `schema.new.extensions.classManager` contains Class Manager create/update operations.
- The developer should search the Class Manager documentation before creating/updating global classes, inspect existing request-provided classes, reuse matching classes, create reusable missing classes, and edit existing global classes only when safe or explicitly requested.
- The developer subagent has a `search_block_docs` tool from `src/agent/tools/index.ts`.
- The developer should call `search_block_docs` with a block name before drafting schema for that specific Blockish block.
- The Product Manager should ask exactly one focused next question only when missing information would seriously change the result.
- The Product Manager should proceed with reasonable assumptions when the user does not want to answer more questions.
- The assistant callback reuses the cached Product Manager agent, then invokes LangChain `createAgent` and returns plain JSON.
- The WebSocket transport reuses the same cached Product Manager agent and returns the same final chat-compatible data in `assistant.final`.
- The WebSocket transport rejects upgrade requests with missing, invalid, or expired signed auth tokens.
- The WebSocket transport sends live `assistant.status`, `assistant.tool_start`, `assistant.tool_end`, `assistant.interrupt`, `assistant.interaction`, and `assistant.delta` events while the final normalized response is returned in `assistant.final`.
- Tool call notification middleware lives in `src/agent/utility/tool-event-middleware.ts`. Product Manager and Designer agents use it to emit request-scoped tool start/end notifications, including agent name, tool name, input, duration, status, and normalized output for frontend debugging.
- The same middleware includes request-scoped circuit breakers. Product Manager can call `designer` at most once and `developer` at most once per request; the developer tool handles its own internal one-repair attempt.
- `assistant.interrupt` is emitted from LangChain HITL interrupts. The frontend should render its interaction payload, then resume the same chat/thread with the user's answer.
- The assistant callback sends every valid request through the Product Manager agent; it does not use hardcoded greeting or direct-build shortcuts.
- The assistant callback does not send synthetic `plan` events; todo items come from the Product Manager structured response.
- The assistant response parser first reads LangChain `structuredResponse`; it can still parse raw model text as a fallback and maps `answer` to chat content while keeping `reasoning` and `todo` as structured fields.
- The assistant schema extractor recursively scans LangChain result objects and tool outputs for valid `BlockishGeneratedResponse` JSON so raw schema payloads are extracted into `schema.new` instead of rendered as chat text.
- WebSocket delta streaming should only forward Product Manager assistant-message deltas. Tool/document JSON output must travel through `assistant.tool_end` debug events, never through chat deltas.
- If developer schema generation fails or returns invalid JSON, the callback returns the agent chat response with `schema.new` as `null` so the failure is visible.
- Assistant interaction buttons may currently be derived from structured `interaction`, explicit `**Options:**` model output, or backend heuristics, but this is fragile and should not be extended further as the primary solution.
- When the developer tool returns valid JSON, the assistant callback can extract and validate `schema.new` from tool output and send it to the frontend.
- Subagent text extraction combines assistant text messages so tool calls do not cause partial designer output to be returned.
- Image attachments are converted into multimodal content on the latest user message before the agent run.
- The REST assistant currently returns plain JSON instead of streaming SSE.
- Valid assistant JSON responses contain chat-compatible data: `{ ok: true, data: { message, metrics, reasoning, todo, summary, schema: { prev, new }, interaction? } }`.
- Assistant response metrics include `durationMs`, `inputTokens`, `outputTokens`, `totalTokens`, and `estimatedTokens` when provider token usage is unavailable.
- Quick-choice fallback should stay conservative. It patches final-response question leaks by turning simple `e.g.` examples into choices, with a small CTA/button option set for CTA questions.

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

Owns the lean `POST /assistant` callback orchestration: request normalization,
agent execution, JSON response writing, and final error
handling.

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
