import type { AgentConfig } from './registry.js';

interface ANSEndpoint {
  agentUrl: string;
  protocol: string;
  metaDataUrl?: string;
}

interface ANSAgent {
  agentId: string;
  agentDisplayName: string;
  agentDescription?: string;
  agentHost: string;
  ansName: string;
  version: string;
  endpoints: ANSEndpoint[];
}

interface ANSSearchResponse {
  agents: ANSAgent[];
  totalCount: number;
  hasMore: boolean;
}

const DEFAULT_API_URL = 'https://api.godaddy.com';

/**
 * Discover A2A agents from the GoDaddy Agent Name Service (ANS) registry.
 * https://www.godaddy.com/ans/developers#api
 *
 * Requires env vars:
 * - ANS_API_URL (optional, defaults to https://api.godaddy.com)
 * - ANS_API_KEY + ANS_API_SECRET for authentication
 * - ANS_AGENT_HOST (optional, filter by host domain)
 */
export async function discoverAgents(): Promise<AgentConfig[]> {
  const apiUrl = process.env.ANS_API_URL || DEFAULT_API_URL;
  const apiKey = process.env.ANS_API_KEY;
  const apiSecret = process.env.ANS_API_SECRET;

  if (!apiKey || !apiSecret) {
    console.warn('ANS discovery skipped: ANS_API_KEY and ANS_API_SECRET required');
    return [];
  }

  const params = new URLSearchParams({ protocol: 'A2A', limit: '100' });
  if (process.env.ANS_AGENT_HOST) {
    params.set('agentHost', process.env.ANS_AGENT_HOST);
  }

  const url = new URL(`/v1/agents?${params}`, apiUrl);

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `sso-key ${apiKey}:${apiSecret}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`ANS search failed: ${response.status} ${response.statusText}`);
      return [];
    }

    const data = (await response.json()) as ANSSearchResponse;
    console.log(`ANS discovery found ${data.totalCount} A2A agent(s)`);

    return data.agents.flatMap((agent) => {
      const a2aEndpoint = agent.endpoints.find((ep) => ep.protocol === 'A2A');
      if (!a2aEndpoint) return [];

      return [
        {
          name: agent.agentDisplayName.toLowerCase().replace(/\s+/g, '-'),
          url: a2aEndpoint.agentUrl,
          description: agent.agentDescription || agent.agentDisplayName,
        },
      ];
    });
  } catch (error) {
    console.error('ANS discovery failed:', error);
    return [];
  }
}
