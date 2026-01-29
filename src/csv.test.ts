import { test, expect, describe } from "bun:test";
import { parseCollectionCSV } from "./csv.ts";

// A reusable header matching the ManaBox CSV format
const HEADER =
  "Binder Name,Binder Type,Name,Set code,Set name,Collector Number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase Price,Misprint,Altered,Condition,Language,Purchase Price Currency";

/** Build a CSV string from a header and data rows */
function buildCSV(...rows: string[]): string {
  return [HEADER, ...rows].join("\n");
}

// A typical binder card row
const SOL_RING_ROW =
  "Boxed,binder,Sol Ring,C21,Commander 2021,188,normal,uncommon,1,58604,aaaa-bbbb,2.50,false,false,near_mint,en,USD";

// A deck card row
const ZURGO_ROW =
  "Zurgo,deck,Zurgo Stormrender,TDC,Tarkir: Dragonstorm Commander,10,normal,mythic,1,104368,dc8eb325-75c9,1.56,false,false,near_mint,en,USD";

describe("parseCollectionCSV", () => {
  test("parses a simple binder card", () => {
    const cards = parseCollectionCSV(buildCSV(SOL_RING_ROW));
    expect(cards.length).toBe(1);

    const card = cards[0]!;
    expect(card.binderName).toBe("Boxed");
    expect(card.binderType).toBe("binder");
    expect(card.name).toBe("Sol Ring");
    expect(card.setCode).toBe("C21");
    expect(card.setName).toBe("Commander 2021");
    expect(card.collectorNumber).toBe("188");
    expect(card.foil).toBe("normal");
    expect(card.rarity).toBe("uncommon");
    expect(card.quantity).toBe(1);
    expect(card.purchasePrice).toBe(2.5);
    expect(card.misprint).toBe(false);
    expect(card.altered).toBe(false);
    expect(card.condition).toBe("near_mint");
    expect(card.language).toBe("en");
    expect(card.purchasePriceCurrency).toBe("USD");
  });

  test("parses a deck card", () => {
    const cards = parseCollectionCSV(buildCSV(ZURGO_ROW));
    expect(cards.length).toBe(1);
    expect(cards[0]!.binderType).toBe("deck");
    expect(cards[0]!.binderName).toBe("Zurgo");
    expect(cards[0]!.name).toBe("Zurgo Stormrender");
  });

  test("handles quoted fields with commas", () => {
    const row =
      'Boxed,binder,"Ezuri, Renegade Leader",SOM,Scars of Mirrodin,120,normal,rare,1,12345,abcd-1234,5.00,false,false,near_mint,en,USD';
    const cards = parseCollectionCSV(buildCSV(row));
    expect(cards.length).toBe(1);
    expect(cards[0]!.name).toBe("Ezuri, Renegade Leader");
  });

  test("handles escaped double quotes inside quoted fields", () => {
    const row =
      'Boxed,binder,"Card with ""quotes""",SET,Set Name,1,normal,rare,1,99999,abcd-5678,0.00,false,false,near_mint,en,USD';
    const cards = parseCollectionCSV(buildCSV(row));
    expect(cards.length).toBe(1);
    expect(cards[0]!.name).toBe('Card with "quotes"');
  });

  test("handles CRLF line endings", () => {
    const csv = HEADER + "\r\n" + SOL_RING_ROW + "\r\n" + ZURGO_ROW + "\r\n";
    const cards = parseCollectionCSV(csv);
    expect(cards.length).toBe(2);
    // Verify no trailing \r on the last field
    expect(cards[0]!.purchasePriceCurrency).toBe("USD");
    expect(cards[1]!.purchasePriceCurrency).toBe("USD");
  });

  test("handles bare CR line endings", () => {
    const csv = HEADER + "\r" + SOL_RING_ROW + "\r" + ZURGO_ROW;
    const cards = parseCollectionCSV(csv);
    expect(cards.length).toBe(2);
  });

  test("parses multiple rows", () => {
    const cards = parseCollectionCSV(buildCSV(SOL_RING_ROW, ZURGO_ROW));
    expect(cards.length).toBe(2);
    expect(cards[0]!.name).toBe("Sol Ring");
    expect(cards[1]!.name).toBe("Zurgo Stormrender");
  });

  test("skips rows with wrong column count", () => {
    const badRow = "Boxed,binder,Only Three Columns";
    const cards = parseCollectionCSV(buildCSV(badRow, SOL_RING_ROW));
    // Bad row is skipped, good row is kept
    expect(cards.length).toBe(1);
    expect(cards[0]!.name).toBe("Sol Ring");
  });

  test("skips rows with unknown binder type", () => {
    const badRow =
      "Boxed,wishlist,Sol Ring,C21,Commander 2021,188,normal,uncommon,1,58604,aaaa-bbbb,2.50,false,false,near_mint,en,USD";
    const cards = parseCollectionCSV(buildCSV(badRow));
    expect(cards.length).toBe(0);
  });

  test("returns empty array for header-only CSV", () => {
    const cards = parseCollectionCSV(HEADER);
    expect(cards.length).toBe(0);
  });

  test("returns empty array for empty input", () => {
    const cards = parseCollectionCSV("");
    expect(cards.length).toBe(0);
  });

  test("coerces misprint and altered booleans correctly", () => {
    const misprintRow =
      "Boxed,binder,Misprinted Card,SET,Set Name,1,normal,rare,1,99999,abcd-5678,0.00,true,true,near_mint,en,USD";
    const cards = parseCollectionCSV(buildCSV(misprintRow));
    expect(cards[0]!.misprint).toBe(true);
    expect(cards[0]!.altered).toBe(true);
  });

  test("handles quantity > 1", () => {
    const row =
      "Boxed,binder,Island,UST,Unstable,213,normal,common,4,11111,ffff-0000,0.10,false,false,near_mint,en,USD";
    const cards = parseCollectionCSV(buildCSV(row));
    expect(cards[0]!.quantity).toBe(4);
  });

  test("handles card names with // (double-faced cards)", () => {
    const row =
      "Boxed,binder,Wear // Tear,DGM,Dragon's Maze,135,normal,uncommon,1,22222,1111-2222,0.74,false,false,near_mint,en,USD";
    const cards = parseCollectionCSV(buildCSV(row));
    expect(cards[0]!.name).toBe("Wear // Tear");
  });
});
