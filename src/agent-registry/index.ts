import { ClientManager } from './client-manager.js';

/**
 * Agent Registry Entry
 */
export interface AgentConfig {
  name: string;
  url: string;
  description?: string;
  capabilities?: string[];
}

/**
 * Agent health status
 */
export interface AgentHealth {
  name: string;
  healthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
}

/**
 * A2A Agent Registry
 * Infrastructure for managing A2A agent connections, health monitoring, and direct routing
 */
export class AgentRegistry {
  private agents: Map<string, ClientManager> = new Map();
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private agentHealth: Map<string, AgentHealth> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic health checks
    this.startHealthChecks();
  }

  /**
   * Register a new agent and discover its capabilities
   */
  async registerAgent(config: AgentConfig): Promise<void> {
    if (this.agents.has(config.name)) {
      console.log(`Agent "${config.name}" already registered`);
      return;
    }

    console.log(`Registering agent: ${config.name} (${config.url})`);

    const clientManager = new ClientManager(config.name, config.url);
    this.agents.set(config.name, clientManager);

    // Initialize health status
    this.agentHealth.set(config.name, {
      name: config.name,
      healthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
    });

    // Discover capabilities asynchronously
    this.discoverCapabilities(config.name, clientManager).catch((error) => {
      console.error(`Failed to discover capabilities for "${config.name}":`, error);
    });

    // Store initial config
    this.agentConfigs.set(config.name, { ...config });
  }

  /**
   * Discover agent capabilities by fetching AgentCard
   */
  private async discoverCapabilities(name: string, client: ClientManager): Promise<void> {
    try {
      const capabilities = await client.getCapabilities();

      // Update config with discovered capabilities
      const config = this.agentConfigs.get(name);
      if (config) {
        config.capabilities = capabilities;
        this.agentConfigs.set(name, config);
      }

      console.log(`Capabilities discovered for "${name}": ${capabilities.length} found`);
    } catch (error) {
      console.error(`Error discovering capabilities for "${name}":`, error);
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    // Run health checks every 60 seconds
    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks().catch((error) => {
        console.error('Error in health check loop:', error);
      });
    }, 60000);
  }

  /**
   * Stop health checks (for cleanup)
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Perform health checks on all agents
   */
  private async performHealthChecks(): Promise<void> {
    console.log('Running health checks...');

    const healthPromises = Array.from(this.agents.entries()).map(async ([name, client]) => {
      const health = this.agentHealth.get(name);
      if (!health) return;

      const isHealthy = await client.healthCheck();

      if (isHealthy) {
        health.healthy = true;
        health.consecutiveFailures = 0;
      } else {
        health.consecutiveFailures += 1;
        // Mark as unhealthy after 3 consecutive failures
        if (health.consecutiveFailures >= 3) {
          health.healthy = false;
          console.warn(`Agent "${name}" marked as unhealthy after ${health.consecutiveFailures} failures`);
        }
      }

      health.lastCheck = new Date();
      this.agentHealth.set(name, health);
    });

    await Promise.allSettled(healthPromises);
  }

  /**
   * Get a specific agent by name
   */
  getAgent(name: string): ClientManager | undefined {
    return this.agents.get(name);
  }

  /**
   * List all registered agents
   */
  listAgents(): AgentConfig[] {
    return Array.from(this.agentConfigs.values());
  }

  /**
   * Get healthy agents only
   */
  getHealthyAgents(): AgentConfig[] {
    return this.listAgents().filter((config) => {
      const health = this.agentHealth.get(config.name);
      return health?.healthy !== false;
    });
  }

  /**
   * Get agent health status
   */
  getAgentHealth(name: string): AgentHealth | undefined {
    return this.agentHealth.get(name);
  }

  /**
   * List all agent health statuses
   */
  listAgentHealth(): AgentHealth[] {
    return Array.from(this.agentHealth.values());
  }

  /**
   * Send message to a specific agent by name
   */
  async sendToAgent(
    agentName: string,
    text: string,
    options?: { userId?: string; contextId?: string },
  ): Promise<string> {
    const agent = this.agents.get(agentName);
    if (!agent) {
      throw new Error(`Agent "${agentName}" not found`);
    }

    // Check if agent is healthy
    const health = this.agentHealth.get(agentName);
    if (health && !health.healthy) {
      throw new Error(`Agent "${agentName}" is currently unhealthy`);
    }

    return agent.sendMessage(text, options);
  }
}
