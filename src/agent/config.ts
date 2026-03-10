import { anthropic } from '@ai-sdk/anthropic';
import { type LanguageModel, tool } from 'ai';
import { z } from 'zod';
import type { AgentRegistry } from './registry.js';

// ─── Model ─────────────────────────────────────────────────────────────────
// Create the language model for this agent.
// Swap the provider by installing a different @ai-sdk/* package and
// changing the import + call below. The rest of the codebase doesn't care.
//
// Examples:
//   import { anthropic } from '@ai-sdk/anthropic';   → anthropic('claude-haiku-4-5')
//   import { bedrock } from '@ai-sdk/amazon-bedrock'; → bedrock('anthropic.claude-3-5-haiku-20241022-v1:0')
//   import { openai } from '@ai-sdk/openai';          → openai('gpt-4o-mini')

export function createModel(): LanguageModel {
  if (!process.env.MODEL_ID) throw new Error('MODEL_ID environment variable is required');
  return anthropic(process.env.MODEL_ID);
}

// ─── Tools ─────────────────────────────────────────────────────────────────
// Tools the orchestrator agent uses to discover and call downstream A2A agents.

export function createTools(orchestrator: AgentRegistry) {
  return {
    listAvailableAgents: tool({
      description: 'Refresh the list of available A2A agents. Only call this if explicitly asked to refresh — agents are already provided in conversation context.',
      inputSchema: z.object({}),
      execute: async () => {
        const healthy = orchestrator.getHealthyAgents();
        return {
          agents: healthy.map((config) => ({
            name: config.name,
            description: config.description || 'No description',
            capabilities: config.capabilities || [],
          })),
          count: healthy.length,
        };
      },
    }),
    callA2AAgent: tool({
      description: 'Call a specific A2A agent with a message and get their response',
      inputSchema: z.object({
        agentName: z.string().describe('The name of the agent to call'),
        message: z.string().describe('The message to send to the agent'),
      }),
      execute: async (input: { agentName: string; message: string }) => {
        try {
          const response = await orchestrator.sendToAgent(input.agentName, input.message);
          return { success: true, agentName: input.agentName, response };
        } catch (error) {
          return {
            success: false,
            agentName: input.agentName,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      },
    }),
  };
}
