import type { Client } from '@a2a-js/sdk/client';
import { ClientFactory } from '@a2a-js/sdk/client';

const factory = new ClientFactory();

/**
 * Manages connection and communication with a single A2A agent
 */
export class ClientManager {
  private client: Client | null = null;
  private agentUrl: string;
  private agentName: string;

  constructor(name: string, url: string) {
    this.agentName = name;
    this.agentUrl = url;
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      try {
        console.log(`Connecting to agent "${this.agentName}" at ${this.agentUrl}`);
        this.client = await factory.createFromUrl(this.agentUrl);
        console.log(`Agent "${this.agentName}" connected successfully`);
      } catch (error) {
        console.error(`Failed to connect to agent "${this.agentName}":`, error);
        throw error;
      }
    }
    return this.client;
  }

  async sendMessage(text: string): Promise<string> {
    const client = await this.getClient();

    const params = {
      message: {
        kind: 'message' as const,
        messageId: crypto.randomUUID(),
        role: 'user' as const,
        parts: [{ kind: 'text' as const, text }],
      },
    };

    try {
      console.log(`Sending to "${this.agentName}": "${text.substring(0, 50)}..."`);
      const response = await client.sendMessage(params);

      if ('parts' in response && Array.isArray(response.parts)) {
        const textParts = response.parts
          .filter((part: { kind: string }): part is { kind: 'text'; text: string } => part.kind === 'text')
          .map((part: { text: string }) => part.text);
        return textParts.join('\n');
      }

      if ('status' in response && response.status) {
        return `Task created: ${response.id} (status: ${response.status.state})`;
      }

      return 'Received response from agent';
    } catch (error) {
      console.error(`Error sending to "${this.agentName}":`, error);
      throw error;
    }
  }

  async getCapabilities(): Promise<string[]> {
    try {
      const client = await this.getClient();
      const agentCard = await client.getAgentCard();

      if (!agentCard?.skills) {
        console.log(`Agent "${this.agentName}" has no skills listed`);
        return [];
      }

      const capabilities = agentCard.skills.map((skill) => {
        const name = skill.name || 'unnamed';
        const desc = skill.description ? ` (${skill.description})` : '';
        return `${name}${desc}`;
      });

      console.log(`Discovered ${capabilities.length} skill(s) for "${this.agentName}": ${capabilities.join(', ')}`);
      return capabilities;
    } catch (error) {
      console.error(`Failed to fetch capabilities for "${this.agentName}":`, error);
      return [];
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getClient();
      await client.getAgentCard();
      console.log(`Health check passed for "${this.agentName}"`);
      return true;
    } catch (error) {
      console.error(`Health check failed for "${this.agentName}":`, error);
      return false;
    }
  }
}
