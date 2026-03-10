import { describe, it, before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

describe('discoverAgents', () => {
  const originalEnv: Record<string, string | undefined> = {};
  const envKeys = ['ANS_API_KEY', 'ANS_API_SECRET', 'ANS_API_URL', 'ANS_AGENT_HOST'];

  before(() => {
    for (const key of envKeys) originalEnv[key] = process.env[key];
  });

  after(() => {
    for (const key of envKeys) {
      if (originalEnv[key] !== undefined) process.env[key] = originalEnv[key];
      else delete process.env[key];
    }
  });

  beforeEach(() => {
    for (const key of envKeys) delete process.env[key];
    mock.restoreAll();
  });

  async function loadDiscoverAgents() {
    const mod = await import('./discovery.js');
    return mod.discoverAgents;
  }

  it('returns empty array when credentials are missing', async () => {
    const discoverAgents = await loadDiscoverAgents();
    const result = await discoverAgents();
    assert.deepEqual(result, []);
  });

  it('returns empty array when only API key is set', async () => {
    process.env.ANS_API_KEY = 'test-key';
    const discoverAgents = await loadDiscoverAgents();
    const result = await discoverAgents();
    assert.deepEqual(result, []);
  });

  it('calls ANS API with correct URL and headers', async () => {
    process.env.ANS_API_KEY = 'my-key';
    process.env.ANS_API_SECRET = 'my-secret';

    const mockFetch = mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ agents: [], totalCount: 0, hasMore: false }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const discoverAgents = await loadDiscoverAgents();
    await discoverAgents();

    assert.equal(mockFetch.mock.callCount(), 1);
    const call = mockFetch.mock.calls[0];
    const url = String(call.arguments[0]);
    assert.ok(url.includes('/v1/agents'));
    assert.ok(url.includes('protocol=A2A'));
    const headers = (call.arguments[1] as RequestInit).headers as Record<string, string>;
    assert.equal(headers.Authorization, 'sso-key my-key:my-secret');
    assert.equal(headers.Accept, 'application/json');
  });

  it('uses custom ANS_API_URL when set', async () => {
    process.env.ANS_API_KEY = 'k';
    process.env.ANS_API_SECRET = 's';
    process.env.ANS_API_URL = 'https://custom.api.example.com';

    const mockFetch = mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ agents: [], totalCount: 0, hasMore: false }), { status: 200 }),
    );

    const discoverAgents = await loadDiscoverAgents();
    await discoverAgents();

    const url = String(mockFetch.mock.calls[0].arguments[0]);
    assert.ok(url.startsWith('https://custom.api.example.com'));
  });

  it('includes agentHost param when ANS_AGENT_HOST is set', async () => {
    process.env.ANS_API_KEY = 'k';
    process.env.ANS_API_SECRET = 's';
    process.env.ANS_AGENT_HOST = 'example.com';

    const mockFetch = mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify({ agents: [], totalCount: 0, hasMore: false }), { status: 200 }),
    );

    const discoverAgents = await loadDiscoverAgents();
    await discoverAgents();

    const url = String(mockFetch.mock.calls[0].arguments[0]);
    assert.ok(url.includes('agentHost=example.com'));
  });

  it('parses agents from ANS response', async () => {
    process.env.ANS_API_KEY = 'k';
    process.env.ANS_API_SECRET = 's';

    const ansResponse = {
      agents: [
        {
          agentId: 'a1',
          agentDisplayName: 'Weather Bot',
          agentDescription: 'Provides weather info',
          agentHost: 'example.com',
          ansName: 'weather-bot',
          version: '1.0',
          endpoints: [{ agentUrl: 'http://weather.example.com/a2a', protocol: 'A2A' }],
        },
        {
          agentId: 'a2',
          agentDisplayName: 'Travel Agent',
          agentDescription: 'Travel planning',
          agentHost: 'example.com',
          ansName: 'travel-agent',
          version: '1.0',
          endpoints: [
            { agentUrl: 'http://travel.example.com/mcp', protocol: 'MCP' },
            { agentUrl: 'http://travel.example.com/a2a', protocol: 'A2A' },
          ],
        },
      ],
      totalCount: 2,
      hasMore: false,
    };

    mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify(ansResponse), { status: 200 }),
    );

    const discoverAgents = await loadDiscoverAgents();
    const result = await discoverAgents();

    assert.equal(result.length, 2);
    assert.equal(result[0].name, 'weather-bot');
    assert.equal(result[0].url, 'http://weather.example.com/a2a');
    assert.equal(result[0].description, 'Provides weather info');
    assert.equal(result[1].name, 'travel-agent');
    assert.equal(result[1].url, 'http://travel.example.com/a2a');
  });

  it('skips agents with no A2A endpoint', async () => {
    process.env.ANS_API_KEY = 'k';
    process.env.ANS_API_SECRET = 's';

    const ansResponse = {
      agents: [
        {
          agentId: 'a1',
          agentDisplayName: 'MCP Only',
          agentHost: 'example.com',
          ansName: 'mcp-only',
          version: '1.0',
          endpoints: [{ agentUrl: 'http://mcp.example.com', protocol: 'MCP' }],
        },
      ],
      totalCount: 1,
      hasMore: false,
    };

    mock.method(globalThis, 'fetch', async () =>
      new Response(JSON.stringify(ansResponse), { status: 200 }),
    );

    const discoverAgents = await loadDiscoverAgents();
    const result = await discoverAgents();
    assert.equal(result.length, 0);
  });

  it('returns empty array on HTTP error', async () => {
    process.env.ANS_API_KEY = 'k';
    process.env.ANS_API_SECRET = 's';

    mock.method(globalThis, 'fetch', async () =>
      new Response('Internal Server Error', { status: 500 }),
    );

    const discoverAgents = await loadDiscoverAgents();
    const result = await discoverAgents();
    assert.deepEqual(result, []);
  });

  it('returns empty array on network error', async () => {
    process.env.ANS_API_KEY = 'k';
    process.env.ANS_API_SECRET = 's';

    mock.method(globalThis, 'fetch', async () => {
      throw new Error('Network failure');
    });

    const discoverAgents = await loadDiscoverAgents();
    const result = await discoverAgents();
    assert.deepEqual(result, []);
  });
});
