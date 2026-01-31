import { test, expect, describe } from "bun:test";
import { trimCardResponse } from "./scryfall.ts";
import type { ScryfallCard } from "./types.ts";

// -- Mock data based on the real Scryfall response shape --

const RAW_CREATURE: Record<string, unknown> = {
  id: "a471b306-4941-4e46-a0cb-d92895c16f8a",
  name: "Nissa, Worldsoul Speaker",
  mana_cost: "{3}{G}",
  cmc: 4.0,
  type_line: "Legendary Creature — Elf Druid",
  oracle_text:
    'Landfall — Whenever a land you control enters, you get {E}{E} (two energy counters).\nYou may pay eight {E} rather than pay the mana cost for permanent spells you cast.',
  power: "3",
  toughness: "3",
  colors: ["G"],
  color_identity: ["G"],
  keywords: ["Landfall"],
  legalities: {
    standard: "not_legal",
    commander: "legal",
    modern: "not_legal",
  },
  rarity: "rare",
  set_name: "Aetherdrift Commander",
  set: "drc",
  scryfall_uri:
    "https://scryfall.com/card/drc/13/nissa-worldsoul-speaker?utm_source=api",
  edhrec_rank: 8059,
  // Fields that should be dropped by trimming:
  image_uris: { normal: "https://example.com/image.jpg" },
  purchase_uris: { tcgplayer: "https://example.com/buy" },
  related_uris: { edhrec: "https://edhrec.com/route" },
  prices: { usd: "0.15" },
  artist: "Magali Villeneuve",
  reserved: false,
  booster: false,
};

const RAW_NONCREATURE: Record<string, unknown> = {
  id: "86bf43b1-8d4e-4759-bb2d-0b2e03ba7012",
  name: "Static Orb",
  mana_cost: "{3}",
  cmc: 3.0,
  type_line: "Artifact",
  oracle_text:
    "As long as this artifact is untapped, players can't untap more than two permanents during their untap steps.",
  colors: [],
  color_identity: [],
  keywords: [],
  legalities: {
    commander: "legal",
    legacy: "legal",
    vintage: "legal",
  },
  rarity: "rare",
  set_name: "Seventh Edition",
  set: "7ed",
  scryfall_uri: "https://scryfall.com/card/7ed/319/static-orb?utm_source=api",
  edhrec_rank: 5409,
};

const RAW_MINIMAL: Record<string, unknown> = {
  // A card with many missing fields — tests fallback defaults
  id: "00000000-0000-0000-0000-000000000000",
  name: "Mystery Card",
};

describe("trimCardResponse", () => {
  test("trims a creature card with all fields", () => {
    const card = trimCardResponse(RAW_CREATURE);

    expect(card.id).toBe("a471b306-4941-4e46-a0cb-d92895c16f8a");
    expect(card.name).toBe("Nissa, Worldsoul Speaker");
    expect(card.manaCost).toBe("{3}{G}");
    expect(card.cmc).toBe(4.0);
    expect(card.typeLine).toBe("Legendary Creature — Elf Druid");
    expect(card.oracleText).toContain("Landfall");
    expect(card.power).toBe("3");
    expect(card.toughness).toBe("3");
    expect(card.colors).toEqual(["G"]);
    expect(card.colorIdentity).toEqual(["G"]);
    expect(card.keywords).toEqual(["Landfall"]);
    expect(card.legalities.commander).toBe("legal");
    expect(card.rarity).toBe("rare");
    expect(card.setName).toBe("Aetherdrift Commander");
    expect(card.setCode).toBe("drc");
    expect(card.scryfallUri).toContain("scryfall.com");
    expect(card.edhrecRank).toBe(8059);
  });

  test("drops image, purchase, price, and artist fields", () => {
    const card = trimCardResponse(RAW_CREATURE);
    const json = JSON.stringify(card);

    expect(json).not.toContain("image_uris");
    expect(json).not.toContain("purchase_uris");
    expect(json).not.toContain("prices");
    expect(json).not.toContain("artist");
    expect(json).not.toContain("reserved");
    expect(json).not.toContain("booster");
  });

  test("handles a non-creature card (no power/toughness)", () => {
    const card = trimCardResponse(RAW_NONCREATURE);

    expect(card.name).toBe("Static Orb");
    expect(card.power).toBeUndefined();
    expect(card.toughness).toBeUndefined();
    expect(card.colors).toEqual([]);
    expect(card.colorIdentity).toEqual([]);
  });

  test("uses defaults for missing fields", () => {
    const card = trimCardResponse(RAW_MINIMAL);

    expect(card.id).toBe("00000000-0000-0000-0000-000000000000");
    expect(card.name).toBe("Mystery Card");
    expect(card.manaCost).toBe("");
    expect(card.cmc).toBe(0);
    expect(card.typeLine).toBe("");
    expect(card.oracleText).toBe("");
    expect(card.colors).toEqual([]);
    expect(card.colorIdentity).toEqual([]);
    expect(card.keywords).toEqual([]);
    expect(card.rarity).toBe("");
    expect(card.edhrecRank).toBeUndefined();
  });

  test("return type matches ScryfallCard", () => {
    const card: ScryfallCard = trimCardResponse(RAW_CREATURE);
    // TypeScript type check — if this compiles, the shape is correct
    expect(card).toBeDefined();
  });
});

// -- Integration tests (hit real Scryfall API) --
// Run with: SCRYFALL_INTEGRATION=1 bun test src/scryfall.test.ts

const runIntegration = process.env["SCRYFALL_INTEGRATION"] === "1";

import {
  fetchScryfallSearch,
  fetchScryfallCardById,
  fetchScryfallCardByName,
  fetchScryfallRulings,
} from "./scryfall.ts";

describe.if(runIntegration)("scryfall API integration", () => {
  test("fetchScryfallSearch finds Sol Ring", async () => {
    const result = await fetchScryfallSearch(
      '!"Sol Ring" legal:commander',
    );
    expect(result.totalCards).toBeGreaterThan(0);
    expect(result.cards[0]!.name).toBe("Sol Ring");
    expect(result.cards[0]!.id).toBeTruthy();
  });

  test("fetchScryfallSearch with order and dir", async () => {
    const result = await fetchScryfallSearch(
      "t:goblin legal:commander id:r",
      "edhrec",
      "asc",
    );
    expect(result.totalCards).toBeGreaterThan(0);
    expect(result.cards[0]!.typeLine.toLowerCase()).toContain("goblin");
  });

  test("fetchScryfallCardById returns a card", async () => {
    // Sol Ring from Commander 2021
    const card = await fetchScryfallCardById(
      "86bf43b1-8d4e-4759-bb2d-0b2e03ba7012",
    );
    expect(card.name).toBe("Static Orb");
    expect(card.id).toBe("86bf43b1-8d4e-4759-bb2d-0b2e03ba7012");
  });

  test("fetchScryfallCardByName with fuzzy match", async () => {
    const card = await fetchScryfallCardByName("Dark Rituel");
    expect(card.name).toBe("Dark Ritual");
    expect(card.id).toBeTruthy();
  });

  test("fetchScryfallCardByName with exact match", async () => {
    const card = await fetchScryfallCardByName("Panharmonicon", false);
    expect(card.name).toBe("Panharmonicon");
  });

  test("fetchScryfallRulings returns rulings", async () => {
    // Panharmonicon has multiple rulings
    const card = await fetchScryfallCardByName("Panharmonicon");
    const rulings = await fetchScryfallRulings(card.id);
    expect(rulings.length).toBeGreaterThan(0);
    expect(rulings[0]!.comment).toBeTruthy();
    expect(rulings[0]!.source).toBeTruthy();
  });

  test("fetchScryfallSearch returns error for bad query", async () => {
    await expect(
      fetchScryfallSearch("invalid:::query::syntax"),
    ).rejects.toThrow("Scryfall");
  });
});
