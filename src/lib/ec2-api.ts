const EC2_API_URL = process.env.EC2_API_URL;
const EC2_API_KEY = process.env.EC2_API_KEY;

interface ApiResult {
  success: boolean;
  error?: string;
  data?: Record<string, unknown>;
}

export async function provisionUser(
  telegramUserId: string,
  betternessToken: string,
  telegramUsername?: string
): Promise<ApiResult> {
  try {
    if (!EC2_API_URL || !EC2_API_KEY) {
      return { success: false, error: "EC2 API configuration is missing" };
    }

    const response = await fetch(`${EC2_API_URL}/api/provision`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": EC2_API_KEY,
      },
      body: JSON.stringify({ telegramUserId, telegramUsername, betternessToken }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { success: false, error: `EC2 API error: ${response.status} ${text}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function checkHealth(): Promise<ApiResult> {
  try {
    if (!EC2_API_URL || !EC2_API_KEY) {
      return { success: false, error: "EC2 API configuration is missing" };
    }

    const response = await fetch(`${EC2_API_URL}/api/health`, {
      headers: {
        "X-API-Key": EC2_API_KEY,
      },
    });

    if (!response.ok) {
      return { success: false, error: `Health check failed: ${response.status}` };
    }

    const data = await response.json();
    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getAgentStatus(telegramUserId: string): Promise<ApiResult> {
  try {
    if (!EC2_API_URL || !EC2_API_KEY) {
      return { success: false, error: "EC2 API configuration is missing" };
    }

    const agentId = `user-${telegramUserId}`;
    const response = await fetch(`${EC2_API_URL}/api/agents/${agentId}/status`, {
      headers: { "X-API-Key": EC2_API_KEY },
    });

    const data = await response.json();
    return { success: response.ok, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
