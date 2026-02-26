import type { Client } from '@a2a-js/sdk/client';
import { ClientFactory } from '@a2a-js/sdk/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * A2A Client Manager
 * Handles connection to A2A agents
 */
class A2AClientManager {
  private client: Client | null = null;
  private factory: ClientFactory;
  private agentUrl: string;

  constructor(agentUrl?: string) {
    this.agentUrl = agentUrl || process.env.A2A_AGENT_URL || 'http://localhost:4000';
    this.factory = new ClientFactory();
  }

  /**
   * Get or create the A2A client
   */
  async getClient(): Promise<Client> {
    if (!this.client) {
      try {
        console.log(`🔗 Connecting to A2A agent at ${this.agentUrl}`);
        this.client = await this.factory.createFromUrl(this.agentUrl);
        console.log('✅ A2A client connected successfully');
      } catch (error) {
        console.error('❌ Failed to connect to A2A agent:', error);
        throw error;
      }
    }
    return this.client;
  }

  /**
   * Send a message to the agent
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
      console.log(`📤 Sending message to agent: "${text.substring(0, 50)}..."`);
      const response = await client.sendMessage(params);

      // Handle different response types
      // The response can be a Message or Task
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
      console.error('❌ Error sending message to agent:', error);
      throw error;
    }
  }
}

// Export a singleton instance
export const a2aClient = new A2AClientManager();
