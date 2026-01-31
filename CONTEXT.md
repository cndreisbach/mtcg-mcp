# mtcg Technical Context

This document covers architecture, design decisions, and what you need to know to add features.

## Project structure

```
index.ts              Entry point — CLI parsing, CSV loading, DB setup, transport startup
src/
  types.ts            Shared types: Card, Deck, Config, ScryfallCard, ScryfallRuling
  csv.ts              CSV parser for ManaBox exports
  fuzzy.ts            Levenshtein distance algorithm and closest-match helper
  db.ts               SQLite schema, card import, and query functions
  scryfall.ts         HTTP client for the Scryfall API (rate-limited, response-trimmed)
  server.ts           MCP server factory — creates server instance and registers all tools
  transport.ts        Wires up stdio and HTTP transports
  *.test.ts           Tests (bun test runner)
```

## Runtime and dependencies

Runs on **Bun** — see `CLAUDE.md` for Bun-specific conventions.

Production dependencies:
- `@modelcontextprotocol/sdk` — official MCP SDK for tool registration and transports
- `zod` (v4) — input schema validation for MCP tools

Everything else uses Bun built-ins: `bun:sqlite` for the database, `Bun.serve()` for HTTP, `Bun.file()` for file reads, `Bun.sleep()` for async delays.

## Architecture

### Data flow

```
ManaBox CSV → parseCollectionCSV() → Card[] → importCards(db, cards) → SQLite
```

On every startup, the CSV is parsed and all cards are bulk-imported into SQLite (DELETE + INSERT inside a transaction). The database is the single source of truth for all collection queries once the server is running.

### MCP server

`createMcpServer(db)` in `server.ts` is a factory that creates a new `McpServer` instance and registers all six tools. It's called once per transport connection — the stdio and HTTP transports each get their own server instance sharing the same database handle.

The HTTP transport runs in **stateless mode** (`sessionIdGenerator: undefined`), creating a fresh transport and server for each request. This works because the server is read-only against the database.

### Transports

Both transports start from `index.ts`:

1. **HTTP** — `Bun.serve()` on `/mcp` using `WebStandardStreamableHTTPServerTransport` from the MCP SDK. This is the web-standard variant that works with Bun (as opposed to the Node.js `http` module variant).

2. **stdio** — `StdioServerTransport` for direct process communication. Used by Claude Desktop, Claude Code, and similar MCP clients. All logging goes to stderr since stdout is the JSON-RPC channel.

## Key design decisions

### Fuzzy search strategy

Card name search uses a two-phase approach:

1. **LIKE query** — `WHERE name LIKE '%query%'` hits the name index and covers substring matches (fast for "Lightning" matching "Lightning Bolt", "Chain Lightning", etc.)

2. **Levenshtein ranking** — LIKE results are sorted by edit distance so the closest match comes first, not alphabetical order. This is done via a CASE expression in the ORDER BY clause to preserve the ranking from `findClosestMatches()`.

3. **Levenshtein fallback** — when LIKE finds nothing (likely a typo like "Lighnting"), all distinct card names are scanned with Levenshtein distance and the best matches are returned.

The `binderType` filter adds an important edge case: if a card name exists in the collection but not in the requested type (e.g., "Counterspell" exists in binders but not in any deck), the search returns empty rather than falling through to the Levenshtein fallback, which would suggest unrelated cards.

### Scryfall API over bulk data

We use the Scryfall REST API rather than their bulk data exports because:

- The full-text search syntax (`id:`, `o:`, `t:`, `function:`, etc.) is the most valuable feature and only works via the API
- Bulk data is 160MB+ and goes stale
- Rate limiting (100ms between requests) is fine for MCP tool usage — an LLM makes a handful of calls per conversation, not hundreds

The `scryfall_search` tool description includes an extensive syntax cheat sheet tuned for Commander deckbuilding. This was deliberate — the tool description is what the LLM reads to decide how to call the tool, so embedding the search syntax there ensures it constructs effective queries.

### Response trimming

Scryfall returns ~80 fields per card. `trimCardResponse()` keeps only the 17 fields relevant to gameplay and deckbuilding (name, mana cost, Oracle text, type line, color identity, keywords, legalities, EDHREC rank, etc.). This keeps tool responses lean and avoids burning context window on card frame details, image URLs, and collector metadata.

### Tool descriptions guide LLM behavior

Tool descriptions are written to influence how the LLM selects and combines tools. Specific choices:

- `search_cards` explicitly states that results include binder/deck location info, so the LLM doesn't need to iterate through every deck to find which ones contain a card.
- `scryfall_search` description always reminds the LLM to include `legal:commander`.
- `scryfall_card` vs `scryfall_search` — the descriptions clarify when to use each (single known card vs. discovery search).

### CSV parser

The CSV parser is custom (not a library) because:
- ManaBox exports are well-formed RFC 4180 with a fixed 17-column schema
- The only complication is quoted fields containing commas (e.g., "Ezuri, Renegade Leader")
- CRLF normalization handles Windows line endings from ManaBox exports
- Rows with unexpected column counts or unknown binder types are logged and skipped

## Database schema

Single `cards` table with 17 columns matching the ManaBox CSV fields plus an auto-increment `id`. Notable columns:

- `binder_type` — CHECK constraint: `'binder'` or `'deck'`. Binder = sorted collection, deck = a Commander deck.
- `binder_name` — the deck name or "My Collection" for binders
- `scryfall_id` — links to Scryfall for card details and rulings

Indexes on `name`, `(binder_name, binder_type)`, and `scryfall_id`.

WAL mode is enabled for concurrent read performance.

## Testing

Tests use the `bun:test` runner. Each module has its own test file.

- **fuzzy.test.ts** — Levenshtein distance edge cases, ranking behavior
- **csv.test.ts** — parsing, quoting, CRLF, malformed rows, type coercion
- **db.test.ts** — schema setup, import, all query functions including fuzzy search edge cases and binderType filtering
- **scryfall.test.ts** — `trimCardResponse` unit tests + integration tests (real API calls) gated behind `SCRYFALL_INTEGRATION=1`

Database tests use in-memory SQLite (`:memory:`) so they're fast and leave no files behind.

## Adding a new MCP tool

1. If the tool needs new types, add them to `src/types.ts`.
2. If it needs new database queries, add functions to `src/db.ts` (or create a new module for a new data source).
3. Register the tool in `createMcpServer()` in `src/server.ts`:
   - Pick a clear `snake_case` name
   - Write the description as if explaining to an LLM what this tool does and when to use it
   - Define the input schema with Zod, including `.describe()` on each field
   - Return `{ content: [{ type: "text", text: "..." }] }`
4. Write tests in a corresponding `.test.ts` file.

## Adding a new collection import format

The CSV parser in `src/csv.ts` is specific to ManaBox. To support a different app's export:

1. Create a new parser (e.g., `src/archidekt-csv.ts`) that returns `Card[]`.
2. Add a CLI flag or auto-detection in `index.ts` to choose the parser.
3. The rest of the pipeline (`importCards`, queries, tools) works unchanged since everything goes through the `Card` type.

## Code style

- Variables are nouns, functions are verb phrases (`const deckNames = listDecks(db)`)
- TypeScript, but not overboard — no unnecessary generics or complex type gymnastics
- Prefer explicit over clever
- Functions stay small and focused on one job
