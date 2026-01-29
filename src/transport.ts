import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";
import { createMcpServer } from "./server.ts";

/**
 * Start the stdio transport. Connects a dedicated McpServer to stdin/stdout.
 * All logging must go to stderr since stdout is the JSON-RPC channel.
 */
export async function startStdioTransport(db: Database): Promise<void> {
  const server = createMcpServer(db);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[manabox-mcp] stdio transport connected");
}

/**
 * Start the HTTP transport using Bun.serve() with the Web Standard
 * StreamableHTTP transport from the MCP SDK.
 *
 * Runs in stateless mode: each request gets a fresh transport instance.
 * This is appropriate for a read-only collection server.
 */
export function startHttpTransport(db: Database, port: number): void {
  Bun.serve({
    port,
    async fetch(req: Request): Promise<Response> {
      const url = new URL(req.url);

      if (url.pathname !== "/mcp") {
        return new Response("Not Found", { status: 404 });
      }

      // Stateless mode: new transport + server per request
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      });

      const server = createMcpServer(db);
      await server.connect(transport);

      const response = await transport.handleRequest(req);

      return response;
    },
  });

  console.error(`[manabox-mcp] HTTP transport listening on port ${port}`);
}
