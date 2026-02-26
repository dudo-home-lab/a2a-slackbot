import { anthropic } from '@ai-sdk/anthropic';
import { generateText, ToolLoopAgent, tool } from 'ai';
import { z } from 'zod';
import type { AgentRegistry } from './agent-registry/index.js';

/**
 * Autonomous AI agent that orchestrates A2A agents
 */
export class Agent {
  private toolLoopAgent;
  private orchestrator: AgentRegistry;
  private model: ReturnType<typeof anthropic>;

  constructor(orchestrator: AgentRegistry) {
    // Environment validation
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is required but not set');
    }
    if (!process.env.ANTHROPIC_MODEL) {
      throw new Error('ANTHROPIC_MODEL is required but not set');
    }

    this.orchestrator = orchestrator;
    this.model = anthropic(process.env.ANTHROPIC_MODEL);
    this.toolLoopAgent = new ToolLoopAgent({
      model: this.model,
      instructions: `You are an intelligent AI assistant powered by multiple A2A (Agent-to-Agent) agents.

Your role is to:
1. Understand user requests and determine which A2A agent(s) can best help
2. Use available tools to query agent capabilities and call them
3. Coordinate multiple agents when needed to provide comprehensive answers
4. Synthesize responses from A2A agents into clear, concise, Slack-optimized answers

When handling requests:
- First list available agents to understand options
- Choose the most appropriate agent(s) based on their capabilities
- Call agents with clear, specific questions
- Synthesize their responses: reformat for Slack, improve clarity, make it conversational
- Keep final responses concise and actionable (2-4 sentences for simple queries, structured lists for complex ones)

Essential - Response Synthesis:
You ALWAYS synthesize A2A agent responses before returning to users:
- Convert Markdown (##, ###) to Slack mrkdwn (*bold*, _italic_)
- Improve structure and flow for readability
- Make responses conversational and friendly
- Remove unnecessary verbosity while preserving key information
- Use bullet points (•) and clear sections for complex information`,
      tools: {
        listAvailableAgents: tool({
          description: 'List all available and healthy A2A agents with their capabilities',
          inputSchema: z.object({}),
          execute: async () => {
            const healthy = this.orchestrator.getHealthyAgents();
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
              const response = await this.orchestrator.sendToAgent(input.agentName, input.message);
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
      },
    });
  }

  /**
   * Generate a contextual greeting message
   */
  async generateGreeting(context: { channel_id?: string }): Promise<string> {
    const agents = this.orchestrator.getHealthyAgents();
    const contextType = context.channel_id ? 'channel' : 'direct message';

    const result = await generateText({
      model: this.model,
      prompt: `Generate a brief, friendly greeting for a user who just opened an AI assistant in Slack (${contextType}).

Available agents: ${agents.map((a) => `${a.name} (${a.description})`).join(', ')}

Keep it conversational, welcoming, and briefly mention you can help with various tasks. Maximum 2 sentences.`,
      maxOutputTokens: 150,
    });

    return result.text;
  }

  /**
   * Generate contextual suggested prompts
   */
  async generateSuggestedPrompts(context: { channel_id?: string }): Promise<Array<{ title: string; message: string }>> {
    const agents = this.orchestrator.getHealthyAgents();
    const contextType = context.channel_id ? 'channel' : 'direct message';

    const result = await generateText({
      model: this.model,
      prompt: `Generate 2-3 suggested prompts for a user in a Slack ${contextType}.

Available agents and their capabilities:
${agents.map((a) => `- ${a.name}: ${a.description}${a.capabilities?.length ? ` (${a.capabilities.join(', ')})` : ''}`).join('\n')}

Return in JSON format:
[
  {"title": "Short title (2-4 words)", "message": "Full question user would ask"},
  ...
]

Make prompts specific to available agent capabilities. Keep titles concise.`,
      maxOutputTokens: 300,
    });

    try {
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse suggested prompts:', error);
    }

    // Fallback
    return [
      { title: 'Get started', message: 'What can you help me with?' },
      { title: 'Learn more', message: 'Tell me about your capabilities' },
    ];
  }

  /**
   * Generate contextual loading messages
   */
  async generateLoadingMessages(): Promise<string[]> {
    const result = await generateText({
      model: this.model,
      prompt: `Generate 3-4 brief, encouraging loading messages for when an AI assistant is processing a request.

Return in JSON format as an array of strings:
["message1", "message2", ...]

Keep them short (3-6 words), friendly, and varied. Examples: "Thinking through this...", "Consulting experts...", "Processing your question..."`,
      maxOutputTokens: 200,
    });

    try {
      const jsonMatch = result.text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse loading messages:', error);
    }

    // Fallback
    return ['Thinking...', 'Processing...', 'Working on it...', 'Almost there...'];
  }

  /**
   * Process a user message through the autonomous agent
   */
  async processMessage(message: string): Promise<string> {
    const healthyAgents = this.orchestrator.getHealthyAgents();
    if (healthyAgents.length === 0) {
      throw new Error('No healthy agents available');
    }

    console.log(`Agent processing request: "${message}"`);
    const result = await this.toolLoopAgent.generate({
      prompt: message,
    });

    return result.text;
  }
}

/**
 * Create an autonomous AI agent that orchestrates A2A agents
 *
 * This agent can be used from any interface (Slack, CLI, HTTP API, etc.)
 */
export function createAgent(orchestrator: AgentRegistry): Agent {
  return new Agent(orchestrator);
}
