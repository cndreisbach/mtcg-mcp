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
