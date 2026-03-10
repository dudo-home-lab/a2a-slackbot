import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createTools } from './config.js';
import type { AgentRegistry } from './registry.js';

describe('createModel', () => {
  let originalModelId: string | undefined;

  before(() => {
    originalModelId = process.env.MODEL_ID;
  });

  after(() => {
    if (originalModelId !== undefined) {
      process.env.MODEL_ID = originalModelId;
    } else {
      delete process.env.MODEL_ID;
    }
  });

  it('throws when MODEL_ID is not set', async () => {
    delete process.env.MODEL_ID;
    // Dynamic import so env is read at call time
    const { createModel } = await import('./config.js');
    assert.throws(() => createModel(), { message: /MODEL_ID/ });
  });
});

describe('createTools', () => {
  function makeMockRegistry(agents: Array<{ name: string; description?: string; capabilities?: string[] }>) {
    return {
      getHealthyAgents: () => agents.map((a) => ({ url: 'http://test', ...a })),
      sendToAgent: async (name: string, _msg: string) => {
        const found = agents.find((a) => a.name === name);
        if (!found) throw new Error(`Agent "${name}" not found`);
        return `response from ${name}`;
      },
    } as unknown as AgentRegistry;
  }

  it('returns listAvailableAgents and callA2AAgent tools', () => {
    const tools = createTools(makeMockRegistry([]));
    assert.ok('listAvailableAgents' in tools);
    assert.ok('callA2AAgent' in tools);
  });

  it('listAvailableAgents returns healthy agents', async () => {
    const agents = [
      { name: 'weather', description: 'Weather info', capabilities: ['forecast'] },
      { name: 'travel', description: 'Travel help' },
    ];
    const tools = createTools(makeMockRegistry(agents));
    const { execute } = tools.listAvailableAgents;
    assert.ok(execute, 'execute should be defined');
    const result = await execute({}, { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal });
    const data = result as { agents: Array<{ name: string }>; count: number };
    assert.equal(data.count, 2);
    assert.equal(data.agents[0].name, 'weather');
    assert.equal(data.agents[1].name, 'travel');
  });

  it('callA2AAgent returns success on valid agent', async () => {
    const tools = createTools(makeMockRegistry([{ name: 'weather', description: 'Weather' }]));
    const { execute } = tools.callA2AAgent;
    assert.ok(execute, 'execute should be defined');
    const result = (await execute(
      { agentName: 'weather', message: 'hello' },
      { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
    )) as { success: boolean; response?: string };
    assert.equal(result.success, true);
    assert.equal(result.response, 'response from weather');
  });

  it('callA2AAgent returns failure for unknown agent', async () => {
    const tools = createTools(makeMockRegistry([]));
    const { execute } = tools.callA2AAgent;
    assert.ok(execute, 'execute should be defined');
    const result = (await execute(
      { agentName: 'missing', message: 'hello' },
      { toolCallId: 'test', messages: [], abortSignal: new AbortController().signal },
    )) as { success: boolean; error?: string };
    assert.equal(result.success, false);
    assert.ok(result.error?.includes('missing'));
  });
});
