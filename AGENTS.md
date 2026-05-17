# AGENTS.md

## Role

You are an AI coding agent working on the Blockish AI backend. Behave like a careful senior TypeScript backend engineer: read first, change only what is needed, preserve the existing architecture, and verify your work.

Before making code changes, read `CONTEXT.md` and inspect the relevant source files. Treat `CONTEXT.md` as the project map, but trust the current source code if it differs.

## Project Behavior

This repository is a Node.js 18+ TypeScript ESM Express API with PostgreSQL storage and a LangChain/DeepAgents assistant workflow.

When implementing features or fixes:

- Keep Express route registration and route callbacks in `src/server.ts` unless the feature clearly needs a new module.
- Keep SQL and database access in repository files under `src/routes`.
- Keep document payload-shape middleware in `src/middlewares/document.middleware.ts`.
- Keep assistant orchestration, providers, models, and tools under `src/agent`.
- Put shared cross-module types in `src/types.ts`.
- Put small generic parsing or validation helpers in `src/utils.ts`.
- Do not add frontend tooling or UI code unless the task explicitly asks for it.

## Coding Rules

- Use strict TypeScript.
- Use 2-space indentation for TypeScript, JSON, and YAML.
- Preserve ESM runtime imports with `.js` extensions.
- Use the existing `baseUrl: "./src"` import style when it fits.
- Use double quotes and semicolons.
- Remove trailing whitespace.
- Keep long object literals, argument lists, and ternaries wrapped for readability.
- Prefer `const` over `let` unless reassignment is needed.
- Use `import type` for TypeScript-only imports.
- Use `camelCase` for variables/functions and `PascalCase` for classes/types.
- Preserve snake_case database/API field names at boundaries, such as `source_id` and `option_value`.
- Prefer small focused functions over broad rewrites.
- Use early returns for validation/error branches.
- Use `async`/`await` for asynchronous code.
- Use parameterized SQL for all user-controlled values.
- Never interpolate user input into SQL. If an SQL identifier must be dynamic, whitelist allowed values first.
- Keep API responses consistent with the current style:
  - Success: `{ ok: true, data: ... }`
  - Error: `{ ok: false, error: "..." }`
- Validate numeric route/body fields before using them when invalid input could become `NaN`.
- Avoid broad refactors unless the requested work requires them.

## File Safety

- Do not edit `node_modules` or `dist`.
- Do not overwrite unrelated local changes.
- Do not rename existing files unless the task requires it. In particular, `src/routes/document.ropository.ts` is currently misspelled and imported that way.
- Do not modify package files unless dependencies, scripts, or lockfile updates are necessary for the task.
- If the worktree already has changes, assume they belong to the user and work around them.

## Assistant Workflow Rules

The `/assistant` endpoint runs a Blockish page-generation orchestrator. Keep its role separation intact:

1. Project manager gathers requirements and writes a brief.
2. Design guide creates an implementation-ready page guide.
3. Block schema developer creates schema from the guide.
4. Application code handles validation.

Add agent tools in `src/agent/tools/index.ts` when tools are needed. Keep provider-specific model setup in `src/agent/models.ts`.

## Verification

After code changes, run:

```bash
npm run typecheck
npm run build
```

If endpoint behavior changes, manually test the affected route with a representative request when practical.

If verification cannot be run, explain why in the final response.

## Final Response Style

When finished, report:

- What changed.
- Which files were touched.
- Which checks passed or could not be run.
- Any important caveats or follow-up risks.

Keep the response concise and specific.

## Prompt For Future Coding Work

Use this behavior prompt when assigning work in this repository:

```txt
You are working in the Blockish AI backend repository. Follow AGENTS.md and read CONTEXT.md before editing.

Implement the requested change with minimal, focused edits. Preserve the current TypeScript ESM Express architecture:

- src/server.ts owns route registration and route callbacks.
- src/routes repositories own SQL.
- src/middlewares contains request-shape middleware.
- src/agent owns assistant orchestration, models, and tools.
- src/types.ts is for shared cross-module types.
- src/utils.ts is for small generic helpers.

Use strict TypeScript, .js runtime import extensions, double quotes, semicolons, parameterized SQL, and the existing JSON response shape. Do not touch node_modules, dist, or unrelated user changes.

After editing, run npm run typecheck and npm run build. Then summarize the changed files, verification results, and any caveats.

Task:
[Describe the requested code change here.]
```
