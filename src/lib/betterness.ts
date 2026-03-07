export async function validateBetternessToken(token: string): Promise<boolean> {
  try {
    const response = await fetch("https://api.betterness.ai/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "inner-voice", version: "1.0" },
        },
      }),
    });

    console.log(`Betterness validation: status=${response.status} for token=${token.slice(0, 10)}...`);

    // 401 = invalid token; any other response means the token is valid
    return response.status !== 401;
  } catch (err) {
    console.error("Betterness validation error:", err);
    return false;
  }
}
