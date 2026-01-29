import { parseArgs } from "util";
import { parseCollectionCSV } from "./src/csv.ts";
import { createDatabase, importCards } from "./src/db.ts";
import { startStdioTransport, startHttpTransport } from "./src/transport.ts";
import type { Config } from "./src/types.ts";

function parseConfig(): Config {
  const { values } = parseArgs({
    args: Bun.argv,
    options: {
      data: { type: "string", short: "d" },
      db: { type: "string", short: "b" },
      "in-memory": { type: "boolean", default: false },
      port: { type: "string" },
    },
    strict: true,
    allowPositionals: true,
  });

  const dataPath = values.data;
  if (!dataPath) {
    console.error(
      "Usage: bun index.ts -d <csv-file> [-b <db-file>] [--in-memory] [--port <port>]"
    );
    process.exit(1);
  }

  const portStr = values.port ?? process.env["PORT"] ?? "3000";
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 0 || port > 65535) {
    console.error(`Invalid port: ${portStr}`);
    process.exit(1);
  }

  return {
    dataPath,
    dbPath: values.db ?? "mbc.db",
    inMemory: values["in-memory"] ?? false,
    port,
  };
}

async function main() {
  const config = parseConfig();

  // Read and parse CSV
  const csvFile = Bun.file(config.dataPath);
  if (!(await csvFile.exists())) {
    console.error(`CSV file not found: ${config.dataPath}`);
    process.exit(1);
  }

  const csvContent = await csvFile.text();
  const cards = parseCollectionCSV(csvContent);
  console.error(`[manabox-mcp] Parsed ${cards.length} cards from CSV`);

  // Set up database
  const dbPath = config.inMemory ? ":memory:" : config.dbPath;
  const db = createDatabase(dbPath);
  importCards(db, cards);
  console.error(
    `[manabox-mcp] Imported cards into ${config.inMemory ? "in-memory" : dbPath} database`
  );

  // Start transports
  startHttpTransport(db, config.port);
  await startStdioTransport(db);
}

main().catch((err) => {
  console.error("[manabox-mcp] Fatal error:", err);
  process.exit(1);
});
