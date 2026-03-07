import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const PROVISION_API = "http://localhost:3002";

const server = new McpServer({
  name: "inner-voice-pairing",
  version: "1.0.0",
});

server.tool(
  "verify_pairing_code",
  "Verify a 6-character pairing code from the Inner Voice website to link a Telegram user to their account",
  {
    code: z
      .string()
      .length(6)
      .describe("The 6-character hex pairing code from the website"),
    telegram_user_id: z
      .string()
      .describe("The Telegram user ID of the person sending the code"),
  },
  async ({ code, telegram_user_id }) => {
    try {
      const res = await fetch(`${PROVISION_API}/api/verify-pairing`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pairingCode: code.toUpperCase(),
          telegramUserId: telegram_user_id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Pairing failed: ${data.error || "Unknown error"}. Please ask the user to generate a new code at the website.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text" as const,
            text: `Pairing successful! User name: ${data.userName}. Welcome them and begin onboarding.`,
          },
        ],
      };
    } catch (err) {
      return {
        content: [
          {
            type: "text" as const,
            text: `Pairing error: Could not reach the provisioning API. ${err instanceof Error ? err.message : ""}`,
          },
        ],
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
