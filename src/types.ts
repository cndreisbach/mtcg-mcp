export type Card = {
  binderName: string;
  binderType: "binder" | "deck";
  name: string;
  setCode: string;
  setName: string;
  collectorNumber: string;
  foil: string;
  rarity: string;
  quantity: number;
  manaboxId: number;
  scryfallId: string;
  purchasePrice: number;
  misprint: boolean;
  altered: boolean;
  condition: string;
  language: string;
  purchasePriceCurrency: string;
};

/** Lean card summary returned by collection query tools. */
export type CardSummary = {
  binderType: "binder" | "deck";
  binderName: string;
  quantity: number;
  name: string;
  scryfallId: string;
};

export type Deck = {
  name: string;
  cardCount: number;
};

export type Config = {
  dataPath: string;
  dbPath: string;
  inMemory: boolean;
  port: number;
};

/** Trimmed Scryfall card — only the fields useful for gameplay and deckbuilding. */
export type ScryfallCard = {
  id: string;
  name: string;
  manaCost: string;
  cmc: number;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  colors: string[];
  colorIdentity: string[];
  keywords: string[];
  legalities: Record<string, string>;
  rarity: string;
  setName: string;
  setCode: string;
  scryfallUri: string;
  edhrecRank?: number;
};

export type ScryfallRuling = {
  source: string;
  publishedAt: string;
  comment: string;
};
