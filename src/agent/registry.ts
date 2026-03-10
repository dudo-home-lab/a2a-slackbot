import { ClientManager } from './client.js';

/**
 * Agent Registry Entry
 */
export interface AgentConfig {
  name: string;
  url: string;
  description?: string;
  capabilities?: string[];
}

interface AgentEntry {
  config: AgentConfig;
  client: ClientManager;
  healthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
}

/**
 * A2A Agent Registry
 * Manages A2A agent connections, health monitoring, and message routing
 */
export class AgentRegistry {
  private agents = new Map<string, AgentEntry>();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.startHealthChecks();
  }

  async registerAgent(config: AgentConfig): Promise<void> {
    if (this.agents.has(config.name)) {
      console.log(`Agent "${config.name}" already registered`);
      return;
    }

    console.log(`Registering agent: ${config.name} (${config.url})`);

    const client = new ClientManager(config.name, config.url);
    this.agents.set(config.name, {
      config: { ...config },
      client,
      healthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    });

    // Discover capabilities asynchronously
    this.discoverCapabilities(config.name).catch((error) => {
      console.error(`Failed to discover capabilities for "${config.name}":`, error);
    });
  }

  private async discoverCapabilities(name: string): Promise<void> {
    const entry = this.agents.get(name);
    if (!entry) return;

    try {
      entry.config.capabilities = await entry.client.getCapabilities();
      console.log(`Capabilities discovered for "${name}": ${entry.config.capabilities.length} found`);
    } catch (error) {
      console.error(`Error discovering capabilities for "${name}":`, error);
    }
  }

  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch((error) => {
        console.error('Error in health check loop:', error);
      });
    }, 60000);
  }

  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  private async performHealthChecks(): Promise<void> {
    console.log('Running health checks...');

    const checks = Array.from(this.agents.entries()).map(async ([name, entry]) => {
      const isHealthy = await entry.client.healthCheck();

      if (isHealthy) {
        entry.healthy = true;
        entry.consecutiveFailures = 0;
      } else {
        entry.consecutiveFailures += 1;
        if (entry.consecutiveFailures >= 3) {
          entry.healthy = false;
          console.warn(`Agent "${name}" marked as unhealthy after ${entry.consecutiveFailures} failures`);
        }
      }

      entry.lastCheck = new Date();
    });

    await Promise.allSettled(checks);
  }

  listAgents(): AgentConfig[] {
    return Array.from(this.agents.values()).map((e) => e.config);
  }

  getHealthyAgents(): AgentConfig[] {
    return Array.from(this.agents.values())
      .filter((e) => e.healthy)
      .map((e) => e.config);
  }

  async sendToAgent(agentName: string, text: string): Promise<string> {
    const entry = this.agents.get(agentName);
    if (!entry) {
      throw new Error(`Agent "${agentName}" not found`);
    }
    if (!entry.healthy) {
      throw new Error(`Agent "${agentName}" is currently unhealthy`);
    }

    return entry.client.sendMessage(text);
  }
}
