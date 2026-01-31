import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";
import {
  searchCardsByName,
  listDecks,
  getDeckCards,
} from "./db.ts";
import {
  fetchScryfallSearch,
  fetchScryfallCardById,
  fetchScryfallCardByName,
  fetchScryfallRulings,
} from "./scryfall.ts";

/**
 * Create an MCP server with all tools registered.
 * Returns a new McpServer instance -- call this once per transport.
 */
export function createMcpServer(db: Database): McpServer {
  const server = new McpServer({
    name: "manabox-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "search_cards",
    {
      title: "Search Cards",
      description:
        "Search for a Magic: The Gathering card by name in the collection. " +
        "Uses fuzzy matching to find the closest card names. " +
        "Each result includes the binder or deck the card is in (binderName, binderType), " +
        "so this tool can answer questions like 'which decks contain card X?' in a single call. " +
        "Use the binderType filter to restrict results to only decks or only binder cards.",
      inputSchema: {
        query: z.string().describe("Card name or partial name to search for"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .default(5)
          .describe("Maximum number of distinct card names to return"),
        binderType: z
          .enum(["binder", "deck"])
          .optional()
          .describe(
            "Filter results by location type. " +
            "Use 'deck' to find which Commander decks contain a card. " +
            "Use 'binder' to find cards in the sorted collection. " +
            "Omit to search everywhere."
          ),
      },
    },
    async ({ query, limit, binderType }) => {
      const cards = searchCardsByName(db, query, limit, binderType);
      if (cards.length === 0) {
        return {
          content: [
            { type: "text", text: `No cards found matching "${query}".` },
          ],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(cards, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_decks",
    {
      title: "List Decks",
      description:
        "List all Commander (EDH) decks in the collection with their card counts.",
    },
    async () => {
      const decks = listDecks(db);
      if (decks.length === 0) {
        return {
          content: [{ type: "text", text: "No decks found in the collection." }],
        };
      }
      return {
        content: [{ type: "text", text: JSON.stringify(decks, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_deck_cards",
    {
      title: "Get Deck Cards",
      description:
        "Get all cards in a specific Commander (EDH) deck. " +
        "Uses fuzzy matching on the deck name, so you don't need an exact match.",
      inputSchema: {
        name: z.string().describe("Deck name to look up (fuzzy matched)"),
      },
    },
    async ({ name }) => {
      const result = getDeckCards(db, name);
      if (!result) {
        return {
          content: [
            {
              type: "text",
              text: `No deck found matching "${name}". Use list_decks to see available decks.`,
            },
          ],
        };
      }

      const header =
        result.resolvedName !== name
          ? `Deck: "${result.resolvedName}" (matched from "${name}")\n\n`
          : `Deck: "${result.resolvedName}"\n\n`;

      return {
        content: [
          {
            type: "text",
            text: header + JSON.stringify(result.cards, null, 2),
          },
        ],
      };
    }
  );

  // -- Scryfall API tools --

  const SCRYFALL_SEARCH_DESCRIPTION =
    "Search the Scryfall database for Magic: The Gathering cards using " +
    "Scryfall's full-text search syntax. This searches ALL Magic cards ever " +
    "printed, not just the user's collection. Use this to discover cards, " +
    "find answers to gameplay questions, or look up card details.\n\n" +
    "IMPORTANT: Always include \"legal:commander\" in queries since the user " +
    "plays Commander.\n\n" +
    "Search syntax reference:\n" +
    "- id: — color identity. e.g. id:ub for blue/black. WUBRG: " +
    "{w}hite, bl{u}e, {b}lack, {r}ed, {g}reen.\n" +
    "- c: / color: — card color. c:rg exact, c<=wub within these colors, " +
    "c>=g at least green, c:colorless, c:multicolor.\n" +
    "- t: — card type or subtype. e.g. t:creature, t:instant, t:goblin. " +
    "Types: land, creature, enchantment, instant, sorcery, artifact, battle. " +
    "Subtypes vary; commonly creature types like Wizard, Goblin, Zombie.\n" +
    "- o: — Oracle text. String match: o:\"destroy target\". " +
    "Regex: o:/(Champion|Master) of( the)?/.\n" +
    "- kw: — keyword ability. e.g. kw:flying, kw:deathtouch. More precise " +
    "than o: since it won't match cards that merely reference the keyword.\n" +
    "- function: — Scryfall gameplay function tag. e.g. function:removal, " +
    "function:ramp, function:draw.\n" +
    "- is: — special filters. is:commander for valid commanders, " +
    "is:party for Party creatures (Warrior/Wizard/Cleric/Rogue), " +
    "is:adventure for Adventure cards, among others.\n" +
    "- cmc / mv — mana value. e.g. mv<=3, cmc=5.\n" +
    "- pow — power. e.g. pow>=4.\n" +
    "- tou — toughness. e.g. tou>=5.\n" +
    "- r: — rarity: r:common, r:uncommon, r:rare, r:mythic.\n" +
    "- Negate with -. e.g. -t:zombie excludes Zombies.\n" +
    "- OR for logical OR (default is AND). e.g. (o:mill OR o:discard).\n" +
    "- Parentheses group conditions.\n" +
    "- order:edhrec — sort by EDHREC Commander popularity (recommended). " +
    "order:usd direction:asc for cheapest. order:cmc direction:asc for " +
    "lowest mana cost.";

  server.registerTool(
    "scryfall_search",
    {
      title: "Scryfall Search",
      description: SCRYFALL_SEARCH_DESCRIPTION,
      inputSchema: {
        query: z.string().describe(
          "Scryfall search query using full-text syntax. " +
          "Always include legal:commander."
        ),
        order: z
          .string()
          .optional()
          .describe(
            "Sort order. Common values: edhrec, usd, cmc, power, toughness, name, set."
          ),
        dir: z
          .enum(["auto", "asc", "desc"])
          .optional()
          .describe("Sort direction. Defaults to auto."),
      },
    },
    async ({ query, order, dir }) => {
      try {
        const result = await fetchScryfallSearch(query, order, dir);
        const summary =
          `Found ${result.totalCards} card(s).` +
          (result.hasMore ? " (more results available — refine your search)" : "") +
          "\n\n";
        return {
          content: [
            {
              type: "text",
              text: summary + JSON.stringify(result.cards, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Search failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "scryfall_card",
    {
      title: "Scryfall Card Lookup",
      description:
        "Look up a single Magic: The Gathering card on Scryfall by ID or " +
        "name. Returns full Oracle text, type line, mana cost, legalities, " +
        "and other gameplay details. Use scryfallId when you already have " +
        "one (e.g. from the collection tools). Use name for a quick lookup " +
        "with fuzzy matching.",
      inputSchema: {
        scryfallId: z
          .string()
          .optional()
          .describe("Scryfall UUID. Use this when you have an ID from the collection."),
        name: z
          .string()
          .optional()
          .describe("Card name (fuzzy matched). Use when you don't have an ID."),
      },
    },
    async ({ scryfallId, name }) => {
      if (!scryfallId && !name) {
        return {
          content: [
            {
              type: "text",
              text: "Provide either scryfallId or name to look up a card.",
            },
          ],
        };
      }

      try {
        const card = scryfallId
          ? await fetchScryfallCardById(scryfallId)
          : await fetchScryfallCardByName(name!);
        return {
          content: [{ type: "text", text: JSON.stringify(card, null, 2) }],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Card lookup failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  server.registerTool(
    "scryfall_rulings",
    {
      title: "Scryfall Rulings",
      description:
        "Get official rulings and notes for a Magic: The Gathering card. " +
        "Includes Wizards of the Coast rulings and Scryfall community notes. " +
        "Provide either a Scryfall ID or a card name.",
      inputSchema: {
        scryfallId: z
          .string()
          .optional()
          .describe("Scryfall UUID of the card."),
        name: z
          .string()
          .optional()
          .describe("Card name (fuzzy matched). Resolved to an ID first if provided."),
      },
    },
    async ({ scryfallId, name }) => {
      if (!scryfallId && !name) {
        return {
          content: [
            {
              type: "text",
              text: "Provide either scryfallId or name to look up rulings.",
            },
          ],
        };
      }

      try {
        // Resolve name to ID if needed
        let resolvedId = scryfallId;
        let resolvedName = name;
        if (!resolvedId) {
          const card = await fetchScryfallCardByName(name!);
          resolvedId = card.id;
          resolvedName = card.name;
        }

        const rulings = await fetchScryfallRulings(resolvedId);
        if (rulings.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: `No rulings found for "${resolvedName ?? resolvedId}".`,
              },
            ],
          };
        }

        const header = resolvedName
          ? `Rulings for "${resolvedName}":\n\n`
          : "";
        return {
          content: [
            {
              type: "text",
              text: header + JSON.stringify(rulings, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text",
              text: `Rulings lookup failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      }
    }
  );

  return server;
}
