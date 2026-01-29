import { Database } from "bun:sqlite";
import type { Card, Deck } from "./types.ts";
import { findClosestMatches } from "./fuzzy.ts";

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    binder_name TEXT NOT NULL,
    binder_type TEXT NOT NULL CHECK(binder_type IN ('binder', 'deck')),
    name TEXT NOT NULL,
    set_code TEXT NOT NULL,
    set_name TEXT NOT NULL,
    collector_number TEXT NOT NULL,
    foil TEXT NOT NULL,
    rarity TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    manabox_id INTEGER NOT NULL,
    scryfall_id TEXT NOT NULL,
    purchase_price REAL NOT NULL DEFAULT 0,
    misprint INTEGER NOT NULL DEFAULT 0,
    altered INTEGER NOT NULL DEFAULT 0,
    condition TEXT NOT NULL,
    language TEXT NOT NULL,
    purchase_price_currency TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_cards_name ON cards(name);
  CREATE INDEX IF NOT EXISTS idx_cards_binder ON cards(binder_name, binder_type);
  CREATE INDEX IF NOT EXISTS idx_cards_scryfall ON cards(scryfall_id);
`;

type CardRow = {
  binder_name: string;
  binder_type: string;
  name: string;
  set_code: string;
  set_name: string;
  collector_number: string;
  foil: string;
  rarity: string;
  quantity: number;
  manabox_id: number;
  scryfall_id: string;
  purchase_price: number;
  misprint: number;
  altered: number;
  condition: string;
  language: string;
  purchase_price_currency: string;
};

function rowToCard(row: CardRow): Card {
  return {
    binderName: row.binder_name,
    binderType: row.binder_type as Card["binderType"],
    name: row.name,
    setCode: row.set_code,
    setName: row.set_name,
    collectorNumber: row.collector_number,
    foil: row.foil,
    rarity: row.rarity,
    quantity: row.quantity,
    manaboxId: row.manabox_id,
    scryfallId: row.scryfall_id,
    purchasePrice: row.purchase_price,
    misprint: row.misprint === 1,
    altered: row.altered === 1,
    condition: row.condition,
    language: row.language,
    purchasePriceCurrency: row.purchase_price_currency,
  };
}

/**
 * Open (or create) a SQLite database and initialize the schema.
 * Pass ":memory:" for an in-memory database.
 */
export function createDatabase(dbPath: string): Database {
  const db = new Database(dbPath);
  db.run("PRAGMA journal_mode = WAL");
  db.exec(SCHEMA);
  return db;
}

/**
 * Bulk-import parsed cards into the database inside a transaction.
 */
export function importCards(db: Database, cards: Card[]): void {
  const insert = db.prepare(`
    INSERT INTO cards (
      binder_name, binder_type, name, set_code, set_name,
      collector_number, foil, rarity, quantity, manabox_id,
      scryfall_id, purchase_price, misprint, altered,
      condition, language, purchase_price_currency
    ) VALUES (
      ?1, ?2, ?3, ?4, ?5,
      ?6, ?7, ?8, ?9, ?10,
      ?11, ?12, ?13, ?14,
      ?15, ?16, ?17
    )
  `);

  const runImport = db.transaction((cards: Card[]) => {
    for (const card of cards) {
      insert.run(
        card.binderName,
        card.binderType,
        card.name,
        card.setCode,
        card.setName,
        card.collectorNumber,
        card.foil,
        card.rarity,
        card.quantity,
        card.manaboxId,
        card.scryfallId,
        card.purchasePrice,
        card.misprint ? 1 : 0,
        card.altered ? 1 : 0,
        card.condition,
        card.language,
        card.purchasePriceCurrency
      );
    }
  });

  runImport(cards);
}

/**
 * Search for cards by name using fuzzy matching.
 *
 * Phase 1: Use LIKE for substring matches (fast, index-assisted).
 * Phase 2: Rank results by Levenshtein distance.
 * Fallback: If LIKE finds nothing, scan all distinct names with Levenshtein.
 */
export function searchCardsByName(
  db: Database,
  query: string,
  limit = 5
): Card[] {
  // Phase 1: LIKE substring match on distinct names
  const likePattern = `%${query}%`;
  const likeResults = db
    .query<{ name: string }, [string]>(
      "SELECT DISTINCT name FROM cards WHERE name LIKE ?1"
    )
    .all(likePattern)
    .map((r) => r.name);

  let matchedNames: string[];

  if (likeResults.length > 0) {
    // Phase 2: Rank LIKE results by Levenshtein distance
    matchedNames = findClosestMatches(query, likeResults, limit);
  } else {
    // Fallback: full scan of all distinct names
    const allNames = db
      .query<{ name: string }, []>("SELECT DISTINCT name FROM cards")
      .all()
      .map((r) => r.name);
    matchedNames = findClosestMatches(query, allNames, limit);
  }

  if (matchedNames.length === 0) return [];

  // Fetch full card rows for matched names, preserving fuzzy-match ranking.
  // We use a CASE expression to sort by the match order from findClosestMatches,
  // so the best match comes first rather than alphabetical order.
  const placeholders = matchedNames.map(() => "?").join(", ");
  const orderCases = matchedNames
    .map((_, idx) => `WHEN ?${matchedNames.length + idx + 1} THEN ${idx}`)
    .join(" ");
  const rows = db
    .query<CardRow, string[]>(
      `SELECT * FROM cards WHERE name IN (${placeholders})
       ORDER BY CASE name ${orderCases} END, set_name`
    )
    .all(...matchedNames, ...matchedNames);

  return rows.map(rowToCard);
}

/**
 * List all Commander decks with their total card counts.
 */
export function listDecks(db: Database): Deck[] {
  const rows = db
    .query<{ name: string; cardCount: number }, []>(
      `SELECT binder_name AS name, SUM(quantity) AS cardCount
       FROM cards
       WHERE binder_type = 'deck'
       GROUP BY binder_name
       ORDER BY binder_name`
    )
    .all();

  return rows;
}

/**
 * Get all cards in a deck, fuzzy-matching the deck name.
 * Returns the resolved deck name and its cards.
 */
export function getDeckCards(
  db: Database,
  deckName: string
): { resolvedName: string; cards: Card[] } | null {
  const allDeckNames = db
    .query<{ binder_name: string }, []>(
      "SELECT DISTINCT binder_name FROM cards WHERE binder_type = 'deck'"
    )
    .all()
    .map((r) => r.binder_name);

  if (allDeckNames.length === 0) {
    return null;
  }

  const matches = findClosestMatches(deckName, allDeckNames, 1);
  const resolvedName = matches[0];
  if (!resolvedName) return null;

  const rows = db
    .query<CardRow, [string]>(
      `SELECT * FROM cards
       WHERE binder_type = 'deck' AND binder_name = ?1
       ORDER BY name`
    )
    .all(resolvedName);

  return {
    resolvedName,
    cards: rows.map(rowToCard),
  };
}
