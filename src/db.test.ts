import { test, expect, describe, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  createDatabase,
  importCards,
  searchCardsByName,
  listDecks,
  getDeckCards,
} from "./db.ts";
import type { Card } from "./types.ts";

/** Build a Card object with sensible defaults. Override any field as needed. */
function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    binderName: "Boxed",
    binderType: "binder",
    name: "Sol Ring",
    setCode: "C21",
    setName: "Commander 2021",
    collectorNumber: "188",
    foil: "normal",
    rarity: "uncommon",
    quantity: 1,
    manaboxId: 58604,
    scryfallId: "aaaa-bbbb-cccc",
    purchasePrice: 2.5,
    misprint: false,
    altered: false,
    condition: "near_mint",
    language: "en",
    purchasePriceCurrency: "USD",
    ...overrides,
  };
}

// Seed data: a mix of binder cards and deck cards
const SEED_CARDS: Card[] = [
  makeCard({ name: "Sol Ring", binderName: "Boxed", binderType: "binder" }),
  makeCard({ name: "Sol Ring", binderName: "Zurgo", binderType: "deck", setCode: "C20", setName: "Commander 2020" }),
  makeCard({ name: "Lightning Bolt", binderName: "Boxed", binderType: "binder" }),
  makeCard({ name: "Lightning Greaves", binderName: "Zurgo", binderType: "deck" }),
  makeCard({ name: "Swords to Plowshares", binderName: "Boxed", binderType: "binder" }),
  makeCard({ name: "Zurgo Stormrender", binderName: "Zurgo", binderType: "deck", rarity: "mythic" }),
  makeCard({ name: "Karrthus, Tyrant of Jund", binderName: "Karrthus BRG", binderType: "deck", rarity: "mythic" }),
  makeCard({ name: "Dragon Broodmother", binderName: "Karrthus BRG", binderType: "deck" }),
  makeCard({ name: "Orvar, the All-Form", binderName: "Orvar B", binderType: "deck", rarity: "mythic" }),
  makeCard({ name: "Counterspell", binderName: "Trade Binder", binderType: "binder" }),
];

let db: Database;

beforeEach(() => {
  db = createDatabase(":memory:");
  importCards(db, SEED_CARDS);
});

describe("createDatabase", () => {
  test("creates the cards table", () => {
    const freshDb = createDatabase(":memory:");
    const tables = freshDb
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='cards'"
      )
      .all();
    expect(tables.length).toBe(1);
    freshDb.close();
  });

  test("creates indexes", () => {
    const freshDb = createDatabase(":memory:");
    const indexes = freshDb
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_cards_%'"
      )
      .all()
      .map((r) => r.name)
      .sort();
    expect(indexes).toEqual([
      "idx_cards_binder",
      "idx_cards_name",
      "idx_cards_scryfall",
    ]);
    freshDb.close();
  });
});

describe("importCards", () => {
  test("imports all cards", () => {
    const count = db
      .query<{ n: number }, []>("SELECT COUNT(*) as n FROM cards")
      .get()!.n;
    expect(count).toBe(SEED_CARDS.length);
  });

  test("stores boolean fields as integers", () => {
    // Import a card with misprint=true
    const freshDb = createDatabase(":memory:");
    importCards(freshDb, [makeCard({ misprint: true, altered: true })]);
    const row = freshDb
      .query<{ misprint: number; altered: number }, []>(
        "SELECT misprint, altered FROM cards LIMIT 1"
      )
      .get()!;
    expect(row.misprint).toBe(1);
    expect(row.altered).toBe(1);
    freshDb.close();
  });

  test("round-trips card data correctly", () => {
    const results = searchCardsByName(db, "Counterspell", 1);
    expect(results.length).toBe(1);

    const card = results[0]!;
    expect(card.name).toBe("Counterspell");
    expect(card.binderName).toBe("Trade Binder");
    expect(card.binderType).toBe("binder");
    expect(card.misprint).toBe(false);
    expect(card.altered).toBe(false);
  });
});

describe("searchCardsByName", () => {
  test("finds exact name match", () => {
    const results = searchCardsByName(db, "Sol Ring");
    // Sol Ring appears in two locations (Boxed and Zurgo)
    expect(results.length).toBe(2);
    expect(results.every((c) => c.name === "Sol Ring")).toBe(true);
  });

  test("finds substring matches", () => {
    const results = searchCardsByName(db, "Lightning");
    const names = results.map((c) => c.name);
    expect(names).toContain("Lightning Bolt");
    expect(names).toContain("Lightning Greaves");
  });

  test("respects limit on distinct names", () => {
    // With limit=1, should return cards for only 1 distinct name
    const results = searchCardsByName(db, "Lightning", 1);
    const uniqueNames = new Set(results.map((c) => c.name));
    expect(uniqueNames.size).toBe(1);
  });

  test("falls back to Levenshtein when LIKE finds nothing", () => {
    // "Sol Rign" won't LIKE match anything, but Levenshtein should find "Sol Ring"
    const results = searchCardsByName(db, "Sol Rign");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.name).toBe("Sol Ring");
  });

  test("handles misspelled card names", () => {
    const results = searchCardsByName(db, "Sords to Plowshares", 1);
    expect(results[0]!.name).toBe("Swords to Plowshares");
  });

  test("returns empty array when DB is empty", () => {
    const emptyDb = createDatabase(":memory:");
    const results = searchCardsByName(emptyDb, "anything");
    expect(results.length).toBe(0);
    emptyDb.close();
  });

  test("returns multiple printings of the same card", () => {
    const results = searchCardsByName(db, "Sol Ring", 1);
    expect(results.length).toBe(2);
    const setCodes = results.map((c) => c.setCode).sort();
    expect(setCodes).toEqual(["C20", "C21"]);
  });
});

describe("listDecks", () => {
  test("returns only deck entries, not binders", () => {
    const decks = listDecks(db);
    const deckNames = decks.map((d) => d.name);
    expect(deckNames).toContain("Zurgo");
    expect(deckNames).toContain("Karrthus BRG");
    expect(deckNames).toContain("Orvar B");
    // Binders should not appear
    expect(deckNames).not.toContain("Boxed");
    expect(deckNames).not.toContain("Trade Binder");
  });

  test("sums card quantities per deck", () => {
    const decks = listDecks(db);
    const zurgo = decks.find((d) => d.name === "Zurgo")!;
    // Zurgo has 3 cards in seed data, each quantity 1
    expect(zurgo.cardCount).toBe(3);
  });

  test("returns decks sorted by name", () => {
    const decks = listDecks(db);
    const names = decks.map((d) => d.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  test("returns empty array when no decks exist", () => {
    const binderOnlyDb = createDatabase(":memory:");
    importCards(binderOnlyDb, [
      makeCard({ binderType: "binder" }),
    ]);
    const decks = listDecks(binderOnlyDb);
    expect(decks.length).toBe(0);
    binderOnlyDb.close();
  });
});

describe("getDeckCards", () => {
  test("returns cards for an exact deck name", () => {
    const result = getDeckCards(db, "Zurgo")!;
    expect(result).not.toBeNull();
    expect(result.resolvedName).toBe("Zurgo");
    expect(result.cards.length).toBe(3);
    expect(result.cards.every((c) => c.binderName === "Zurgo")).toBe(true);
  });

  test("fuzzy-matches misspelled deck names", () => {
    const result = getDeckCards(db, "Zurgi")!;
    expect(result).not.toBeNull();
    expect(result.resolvedName).toBe("Zurgo");
  });

  test("fuzzy-matches partial deck names", () => {
    const result = getDeckCards(db, "Karrthus")!;
    expect(result).not.toBeNull();
    expect(result.resolvedName).toBe("Karrthus BRG");
  });

  test("returns cards sorted by name", () => {
    const result = getDeckCards(db, "Zurgo")!;
    const names = result.cards.map((c) => c.name);
    const sorted = [...names].sort();
    expect(names).toEqual(sorted);
  });

  test("returns null when no decks exist", () => {
    const binderOnlyDb = createDatabase(":memory:");
    importCards(binderOnlyDb, [
      makeCard({ binderType: "binder" }),
    ]);
    const result = getDeckCards(binderOnlyDb, "anything");
    expect(result).toBeNull();
    binderOnlyDb.close();
  });

  test("only returns cards from the matched deck", () => {
    const result = getDeckCards(db, "Orvar B")!;
    expect(result.cards.length).toBe(1);
    expect(result.cards[0]!.name).toBe("Orvar, the All-Form");
    // Verify no cards from other decks leak in
    expect(result.cards.every((c) => c.binderName === "Orvar B")).toBe(true);
  });
});
