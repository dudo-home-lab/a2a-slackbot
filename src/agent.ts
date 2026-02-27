import { anthropic } from '@ai-sdk/anthropic';
import { generateText, Output, stepCountIs, ToolLoopAgent, tool, type ModelMessage } from 'ai';
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
      stopWhen: stepCountIs(10), // Allow up to 10 steps for orchestration
      instructions: `You are an intelligent AI assistant powered by multiple A2A (Agent-to-Agent) agents.

Your role is to:
1. Understand user requests and determine which A2A agent(s) can best help
2. Use available tools to query agent capabilities and call them
3. Coordinate multiple agents when needed to provide comprehensive answers
4. Synthesize responses from A2A agents into clear, concise, Slack-optimized answers

IMPORTANT - Transparent Operation:
- Narrate what you're doing in real-time as you work
- Before calling agents, say what you're about to do (e.g., "Let me check the weather forecast...")
- When waiting for responses, you can add brief updates
- After getting responses, synthesize them into the final answer
- This helps users understand the multi-agent coordination happening

When handling requests:
- First check available agents: "Let me see what agents can help with this..."
- Choose agent(s): "I'll get weather data and farming advice for you..."
- Call agents with clear, specific questions
- Synthesize responses: reformat for Slack, improve clarity, make it conversational
- Keep final synthesized section concise (2-4 sentences for simple queries, structured lists for complex ones)

Keep responses conversational and well-formatted for easy reading in Slack.`,

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

    const schema = z.array(
      z.object({
        title: z.string().describe('Short title (2-4 words)'),
        message: z.string().describe('Full question user would ask'),
      }),
    );

    try {
      const result = await generateText({
        model: this.model,
        system: 'You generate structured JSON data. Output ONLY a valid JSON string matching the schema. NO markdown. NO code fencing with ```. NO newline characters. NO explanatory text.',
        prompt: `Generate 2-3 suggested prompts for a Slack ${contextType}.

Available agents:
${agents.map((a) => `- ${a.name}: ${a.description}${a.capabilities?.length ? ` (${a.capabilities.join(', ')})` : ''}`).join('\n')}

Create prompts that showcase these agent capabilities. Output a SINGLE JSON STRING (no markdown, no code fencing, no newlines) with an array of objects with "title" (2-4 word summary) and "message" (full question user would ask). For example:
[
  { "title": "Weather Forecast", "message": "What's the weather forecast for this weekend?" },
  { "title": "Farming Advice", "message": "How should I prepare my goat farm for winter?" }
]`,
        output: Output.json(schema),
        maxOutputTokens: 300,
      });

      if (!result.output) {
        console.warn('No structured output received for suggested prompts');
        return this.getFallbackPrompts();
      }

      console.log(result.output);

      return result.output as z.infer<typeof schema>;
    } catch (error) {
      console.error('Error generating suggested prompts:', error);
      return this.getFallbackPrompts();
    }
  }

  private getFallbackPrompts() {
    return [
      { title: 'Get started', message: 'What can you help me with?' },
      { title: 'Learn more', message: 'Tell me about your capabilities' },
    ];
  }

  /**
   * Generate a concise thread title from user's message
   */
  async generateThreadTitle(message: string): Promise<string> {
    const result = await generateText({
      model: this.model,
      prompt: `Generate a very short, descriptive title (3-6 words max) for this user question:

"${message}"

Return ONLY the title text, no quotes or formatting. Examples:
- "What's the weather?" → "Weather Forecast"
- "I need help with my goat farm in winter" → "Winter Goat Farm Advice"
- "Tell me about agent capabilities" → "Agent Capabilities"`,
      maxOutputTokens: 30,
    });

    return result.text.trim().replace(/^["']|["']$/g, '');
  }

  /**
   * Process messages through the autonomous agent with full conversation context
   *
   * @param messages - Array of conversation messages with roles (user/assistant)
   * @param onText - Optional callback for streaming text chunks as they're generated
   * @param onStatus - Optional callback for status updates during tool execution
   * @returns The agent's complete response
   */
  async processMessage(
    messages: ModelMessage[],
    onText?: (chunk: string) => void | Promise<void>,
    onStatus?: (status: string) => void | Promise<void>,
  ): Promise<string> {
    const healthyAgents = this.orchestrator.getHealthyAgents();
    if (healthyAgents.length === 0) {
      throw new Error('No healthy agents available');
    }

    const lastMessage = messages[messages.length - 1];
    console.debug(`Agent processing request: "${lastMessage.content}" (${messages.length} messages in context)`);

    // Stream response if callback provided, otherwise generate synchronously
    if (onText) {
      const result = await this.toolLoopAgent.stream({
        messages,
      });
      let responseText = '';

      // Use fullStream to get step-by-step events
      for await (const event of result.fullStream) {
        switch (event.type) {
          case 'tool-call':
            // Update status to show which tool is running
            if (onStatus) {
              if (event.toolName === 'callA2AAgent') {
                await onStatus('Consulting specialist agents...');
              }
            }
            break;

          case 'tool-result':
            if (onStatus && event.toolName === 'callA2AAgent') {
              await onStatus('Synthesizing response...');
            }
            break;

          case 'text-delta':
            responseText += event.text;
            break;

          case 'text-end': {
            // Only strip trailing colons if not part of a complete emoji (:emoji_name:)
            if (!/:[a-z0-9_+-]+:\s*$/i.test(responseText)) {
              responseText = responseText.replace(/:+\s*$/, '');
            }
            await onText(`${responseText}\n\n`);
            responseText = '';

            break;
          }
        }
      }

      // Wait for complete response and usage
      const fullText = await result.text;
      const usage = await result.usage;

      console.debug(`Agent sent response in chunks (${usage.totalTokens} tokens)`);

      return fullText;
    }

    // Non-streaming fallback
    const result = await this.toolLoopAgent.generate({
      messages,
    });

    console.debug(`Agent generated response (${result.usage?.totalTokens || 0} tokens)`);

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
