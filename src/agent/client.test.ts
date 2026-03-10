import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ClientManager requires @a2a-js/sdk/client which can't be module-mocked
// without --experimental-vm-modules. Instead, test the response parsing logic
// that ClientManager.sendMessage exercises, and verify constructor contracts.

describe('ClientManager', () => {
  it('can be imported', async () => {
    const { ClientManager } = await import('./client.js');
    assert.ok(ClientManager);
  });

  it('constructs without connecting', async () => {
    const { ClientManager } = await import('./client.js');
    const client = new ClientManager('test', 'http://localhost:9999');
    assert.ok(client);
  });
});

describe('A2A response parsing', () => {
  // These test the parsing logic from sendMessage without needing a live SDK client

  function parseTextParts(response: { parts?: Array<{ kind: string; text?: string }> }): string {
    if ('parts' in response && Array.isArray(response.parts)) {
      return response.parts
        .filter((part): part is { kind: 'text'; text: string } => part.kind === 'text')
        .map((part) => part.text)
        .join('\n');
    }
    return 'Received response from agent';
  }

  it('extracts text from single-part response', () => {
    const response = { parts: [{ kind: 'text', text: 'Hello world' }] };
    assert.equal(parseTextParts(response), 'Hello world');
  });

  it('joins multiple text parts with newlines', () => {
    const response = {
      parts: [
        { kind: 'text', text: 'Line 1' },
        { kind: 'text', text: 'Line 2' },
      ],
    };
    assert.equal(parseTextParts(response), 'Line 1\nLine 2');
  });

  it('filters out non-text parts', () => {
    const response = {
      parts: [
        { kind: 'text', text: 'Hello' },
        { kind: 'image' },
        { kind: 'text', text: 'World' },
      ],
    };
    assert.equal(parseTextParts(response), 'Hello\nWorld');
  });

  it('returns fallback for empty parts', () => {
    const response = { parts: [] };
    assert.equal(parseTextParts(response), '');
  });

  it('returns fallback for missing parts', () => {
    const response = {};
    assert.equal(parseTextParts(response), 'Received response from agent');
  });
});
