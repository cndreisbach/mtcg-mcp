# mtcg - Magic: The Context Gathering

An MCP server that gives LLMs access to your Magic: The Gathering collection and the Scryfall card database. Built for Commander (EDH) players who want to ask their AI assistant questions like:

- "Which of my decks contain Cyclonic Rift?"
- "My Zombies deck isn't performing well. Can you suggest cards from my binders that would help?"
- "Find me some budget ramp spells in green that are legal in Commander."

## How it works

Export your collection from [ManaBox](https://manabox.app) as a CSV. mtcg loads it into a local SQLite database and exposes six tools over the [Model Context Protocol](https://modelcontextprotocol.io):

**Collection tools** (your cards):
- `search_cards` — fuzzy search by card name, with optional binder/deck filter
- `list_decks` — list all Commander decks and their card counts
- `get_deck_cards` — get every card in a deck (fuzzy name matching)

**Scryfall tools** (all of Magic):
- `scryfall_search` — full-text search across every Magic card ever printed
- `scryfall_card` — look up a single card by name or Scryfall ID
- `scryfall_rulings` — official rulings for a card

## Setup

Requires [Bun](https://bun.sh) v1.0+.

```bash
bun install
```

Export your collection from ManaBox (Settings > Export > CSV) and save the file somewhere accessible (it's gitignored by default).

## Running

```bash
bun index.ts -d ./ManaBox_Collection.csv
```

This starts both an HTTP server (port 3000) and a stdio transport. The CSV is parsed and loaded into a SQLite database (`mbc.db` in the current directory) on every startup.

### Options

| Flag | Default | Description |
|------|---------|-------------|
| `-d`, `--data` | *(required)* | Path to ManaBox CSV export |
| `-b`, `--db` | `mbc.db` | Path for the SQLite database file |
| `--in-memory` | `false` | Use an in-memory database (no file written) |
| `--port` | `3000` | HTTP port (also reads `PORT` env var) |

## Connecting from an MCP client

### Claude Desktop / Claude Code

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "mtcg": {
      "command": "bun",
      "args": ["index.ts", "-d", "/path/to/ManaBox_Collection.csv"],
      "cwd": "/path/to/mtcg"
    }
  }
}
```

This uses the stdio transport. The server communicates over stdin/stdout using JSON-RPC.

### HTTP (Streamable HTTP)

Any MCP client that supports Streamable HTTP can connect to:

```
POST http://localhost:3000/mcp
```

The server runs in stateless mode — each request is handled independently with no session tracking.

### Testing with curl

You can verify the server is running by listing available tools:

```bash
curl -s http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }' | jq .
```

## Running tests

```bash
bun test
```

Scryfall integration tests (which make real API calls) are skipped by default. To include them:

```bash
SCRYFALL_INTEGRATION=1 bun test src/scryfall.test.ts
```

## More info

See [CONTEXT.md](./CONTEXT.md) for architecture details, design decisions, and guidance on adding new features.
