import type { Client } from '@a2a-js/sdk/client';
import { ClientFactory } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Client Manager for a single agent
 * Handles connection and communication with one A2A agent
 */
export class ClientManager {
  private client: Client | null = null;
  private factory: ClientFactory;
  private agentUrl: string;
  private agentName: string;

  constructor(name: string, url: string) {
    this.agentName = name;
    this.agentUrl = url;
    this.factory = new ClientFactory();
  }

  /**
   * Get or create the A2A client connection
   */
  async getClient(): Promise<Client> {
    if (!this.client) {
      try {
        console.log(`Connecting to agent "${this.agentName}" at ${this.agentUrl}`);
        this.client = await this.factory.createFromUrl(this.agentUrl);
        console.log(`Agent "${this.agentName}" connected successfully`);
      } catch (error) {
        console.error(`Failed to connect to agent "${this.agentName}":`, error);
        throw error;
      }
    }
    return this.client;
  }

  /**
   * Send a message to this agent
   */
  async sendMessage(text: string, _options?: { userId?: string; contextId?: string }) {
    const client = await this.getClient();

    const messageId = uuidv4();
    const params = {
      message: {
        kind: 'message' as const,
        messageId,
        role: 'user' as const,
        parts: [{ kind: 'text' as const, text }],
      },
    };

    try {
      console.log(`Sending to "${this.agentName}": "${text.substring(0, 50)}..."`);
      const response = await client.sendMessage(params);

      // Handle different response types
      if ('parts' in response && Array.isArray(response.parts)) {
        // It's a Message
        const textParts = response.parts
          .filter((part: { kind: string }): part is { kind: 'text'; text: string } => part.kind === 'text')
          .map((part: { text: string }) => part.text);
        return textParts.join('\n');
      }

      if ('status' in response && response.status) {
        // It's a Task
        return `Task created: ${response.id} (status: ${response.status.state})`;
      }

      return 'Received response from agent';
    } catch (error) {
      console.error(`Error sending to "${this.agentName}":`, error);
      throw error;
    }
  }

  /**
   * Get the agent's capabilities by fetching its AgentCard
   */
  async getCapabilities(): Promise<string[]> {
    try {
      const client = await this.getClient();

      // Fetch the agent card which contains capability information
      const agentCard = await client.getAgentCard();

      if (!agentCard || !agentCard.skills) {
        console.log(`Agent "${this.agentName}" has no skills listed`);
        return [];
      }

      // Extract skill names and descriptions
      const capabilities: string[] = [];
      for (const skill of agentCard.skills) {
        const skillName = skill.name || 'unnamed';
        const skillDesc = skill.description ? ` (${skill.description})` : '';
        capabilities.push(`${skillName}${skillDesc}`);
      }

      console.log(`Discovered ${capabilities.length} skill(s) for "${this.agentName}": ${capabilities.join(', ')}`);
      return capabilities;
    } catch (error) {
      console.error(`Failed to fetch capabilities for "${this.agentName}":`, error);
      return [];
    }
  }

  /**
   * Health check: verify agent is responsive
   */
  async healthCheck(): Promise<boolean> {
    try {
      const client = await this.getClient();

      // Try to fetch agent card as a health check
      await client.getAgentCard();

      console.log(`Health check passed for "${this.agentName}"`);
      return true;
    } catch (error) {
      console.error(`Health check failed for "${this.agentName}":`, error);
      return false;
    }
  }

  /**
   * Get agent name
   */
  getName(): string {
    return this.agentName;
  }

  /**
   * Get agent URL
   */
  getUrl(): string {
    return this.agentUrl;
  }
}
