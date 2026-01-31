import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Database } from "bun:sqlite";
import {
  searchCardsByName,
  listDecks,
  getDeckCards,
} from "./db.ts";

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

  return server;
}
