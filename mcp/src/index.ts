// Server MCP di Slow: Claude e ChatGPT leggono e scrivono i dati dell'app (il file su Google Drive).
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { GoogleHandler } from "./google";
import { registerTools } from "./tools";

export type Props = { email: string; refreshToken: string };

export class SlowMCP extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({ name: "Slow", version: "1.0.0" });
  async init() {
    registerTools(this.server, () => this.props as Props, this.env);
  }
}

// Indirizzo pubblico del server: è l'identificativo con cui Claude e ChatGPT chiedono l'accesso.
const MCP_URL = "https://slow-mcp.andrea-mordenti.workers.dev/mcp";

export default new OAuthProvider({
  apiRoute: "/mcp",
  apiHandler: SlowMCP.serve("/mcp") as any,
  resourceMetadata: { resource: MCP_URL, resource_name: "Slow" },
  authorizeEndpoint: "/authorize",
  tokenEndpoint: "/token",
  clientRegistrationEndpoint: "/register",
  defaultHandler: GoogleHandler as any,
});
