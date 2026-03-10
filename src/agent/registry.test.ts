import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { AgentRegistry } from './registry.js';

describe('AgentRegistry', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    registry = new AgentRegistry();
  });

  afterEach(() => {
    registry.stopHealthChecks();
  });

  describe('registerAgent', () => {
    it('registers a new agent', async () => {
      await registry.registerAgent({ name: 'test-agent', url: 'http://localhost:3000' });
      const agents = registry.listAgents();
      assert.equal(agents.length, 1);
      assert.equal(agents[0].name, 'test-agent');
      assert.equal(agents[0].url, 'http://localhost:3000');
    });

    it('skips duplicate registration', async () => {
      await registry.registerAgent({ name: 'test-agent', url: 'http://localhost:3000' });
      await registry.registerAgent({ name: 'test-agent', url: 'http://localhost:9999' });
      const agents = registry.listAgents();
      assert.equal(agents.length, 1);
      // Should retain the original URL
      assert.equal(agents[0].url, 'http://localhost:3000');
    });

    it('registers multiple distinct agents', async () => {
      await registry.registerAgent({ name: 'agent-a', url: 'http://a' });
      await registry.registerAgent({ name: 'agent-b', url: 'http://b' });
      assert.equal(registry.listAgents().length, 2);
    });

    it('preserves description and capabilities', async () => {
      await registry.registerAgent({
        name: 'detailed',
        url: 'http://d',
        description: 'A detailed agent',
        capabilities: ['skill-1'],
      });
      const agent = registry.listAgents()[0];
      assert.equal(agent.description, 'A detailed agent');
      assert.deepEqual(agent.capabilities, ['skill-1']);
    });
  });

  describe('listAgents', () => {
    it('returns empty array when no agents registered', () => {
      assert.deepEqual(registry.listAgents(), []);
    });
  });

  describe('getHealthyAgents', () => {
    it('returns all agents initially (default healthy)', async () => {
      await registry.registerAgent({ name: 'agent-a', url: 'http://a' });
      await registry.registerAgent({ name: 'agent-b', url: 'http://b' });
      assert.equal(registry.getHealthyAgents().length, 2);
    });
  });

  describe('sendToAgent', () => {
    it('throws for unknown agent', async () => {
      await assert.rejects(() => registry.sendToAgent('ghost', 'hello'), {
        message: /not found/,
      });
    });
  });

  describe('stopHealthChecks', () => {
    it('can be called multiple times without error', () => {
      registry.stopHealthChecks();
      registry.stopHealthChecks();
    });
  });
});
