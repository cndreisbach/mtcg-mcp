import type { ScryfallCard, ScryfallRuling } from "./types.ts";

const SCRYFALL_API = "https://api.scryfall.com";
const USER_AGENT = "mtcg-mcp/1.0.0";
const MIN_REQUEST_INTERVAL_MS = 100;
const RETRY_DELAY_MS = 1000;

// Module-level throttle state
let lastRequestTime = 0;

/**
 * Fetch a URL with rate limiting and proper headers per Scryfall's usage policy.
 * Retries once on 429 (rate limit) after a 1-second backoff.
 */
async function throttledFetch(url: string): Promise<Response> {
  const elapsed = Date.now() - lastRequestTime;
  if (elapsed < MIN_REQUEST_INTERVAL_MS) {
    await Bun.sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
  }
  lastRequestTime = Date.now();

  const response = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  // Retry once on rate limit
  if (response.status === 429) {
    await Bun.sleep(RETRY_DELAY_MS);
    lastRequestTime = Date.now();
    return fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });
  }

  return response;
}

/**
 * Parse a Scryfall error response into a readable message.
 */
async function handleScryfallError(response: Response): Promise<never> {
  let message = `Scryfall API error: ${response.status}`;
  try {
    const body = (await response.json()) as { details: unknown };
    if (body.details) {
      message = `Scryfall: ${body.details}`;
    }
  } catch {
    // Couldn't parse error body — use the status code message
  }
  throw new Error(message);
}

// -- Response trimming --

/**
 * Trim a raw Scryfall card JSON object to only the fields useful for
 * gameplay and deckbuilding. Exported for testing.
 */
export function trimCardResponse(raw: Record<string, unknown>): ScryfallCard {
  return {
    id: (raw.id as string) ?? "",
    name: (raw.name as string) ?? "",
    manaCost: (raw.mana_cost as string) ?? "",
    cmc: (raw.cmc as number) ?? 0,
    typeLine: (raw.type_line as string) ?? "",
    oracleText: (raw.oracle_text as string) ?? "",
    power: raw.power as string | undefined,
    toughness: raw.toughness as string | undefined,
    colors: (raw.colors as string[]) ?? [],
    colorIdentity: (raw.color_identity as string[]) ?? [],
    keywords: (raw.keywords as string[]) ?? [],
    legalities: (raw.legalities as Record<string, string>) ?? {},
    rarity: (raw.rarity as string) ?? "",
    setName: (raw.set_name as string) ?? "",
    setCode: (raw.set as string) ?? "",
    scryfallUri: (raw.scryfall_uri as string) ?? "",
    edhrecRank: raw.edhrec_rank as number | undefined,
  };
}

function trimRulingResponse(raw: Record<string, unknown>): ScryfallRuling {
  return {
    source: (raw.source as string) ?? "",
    publishedAt: (raw.published_at as string) ?? "",
    comment: (raw.comment as string) ?? "",
  };
}

// -- API functions --

export type ScryfallSearchResult = {
  cards: ScryfallCard[];
  hasMore: boolean;
  totalCards: number;
};

/**
 * Search Scryfall using their full-text search syntax.
 * Returns up to 175 cards per page.
 */
export async function fetchScryfallSearch(
  query: string,
  order?: string,
  dir?: string,
  page?: number,
): Promise<ScryfallSearchResult> {
  const params = new URLSearchParams({ q: query, format: "json" });
  if (order) params.set("order", order);
  if (dir) params.set("dir", dir);
  if (page) params.set("page", String(page));

  const response = await throttledFetch(
    `${SCRYFALL_API}/cards/search?${params}`,
  );

  if (!response.ok) {
    await handleScryfallError(response);
  }

  const body = (await response.json()) as {
    data: Record<string, unknown>[];
    has_more: boolean;
    total_cards: number;
  };
  return {
    cards: (body.data as Record<string, unknown>[]).map(trimCardResponse),
    hasMore: body.has_more ?? false,
    totalCards: body.total_cards ?? 0,
  };
}

/**
 * Look up a single card by its Scryfall UUID.
 */
export async function fetchScryfallCardById(
  scryfallId: string,
): Promise<ScryfallCard> {
  const response = await throttledFetch(
    `${SCRYFALL_API}/cards/${encodeURIComponent(scryfallId)}`,
  );

  if (!response.ok) {
    await handleScryfallError(response);
  }

  const body = (await response.json()) as Record<string, unknown>;
  return trimCardResponse(body);
}

/**
 * Look up a single card by name using Scryfall's fuzzy matching.
 */
export async function fetchScryfallCardByName(
  name: string,
  fuzzy = true,
): Promise<ScryfallCard> {
  const params = new URLSearchParams({ format: "json" });
  params.set(fuzzy ? "fuzzy" : "exact", name);

  const response = await throttledFetch(
    `${SCRYFALL_API}/cards/named?${params}`,
  );

  if (!response.ok) {
    await handleScryfallError(response);
  }

  const body = (await response.json()) as Record<string, unknown>;
  return trimCardResponse(body);
}

/**
 * Get rulings for a card by its Scryfall UUID.
 */
export async function fetchScryfallRulings(
  scryfallId: string,
): Promise<ScryfallRuling[]> {
  const response = await throttledFetch(
    `${SCRYFALL_API}/cards/${encodeURIComponent(scryfallId)}/rulings`,
  );

  if (!response.ok) {
    await handleScryfallError(response);
  }

  const body = (await response.json()) as { data: Record<string, unknown>[] };
  return (body.data as Record<string, unknown>[]).map(trimRulingResponse);
}
