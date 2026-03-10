import { generateText, type LanguageModel, type ModelMessage, Output, stepCountIs, ToolLoopAgent } from 'ai';
import { z } from 'zod';
import { createModel, createTools } from './config.js';
import type { AgentRegistry } from './registry.js';

/** Strip trailing colons unless they're part of a Slack emoji like :thumbsup: */
function stripTrailingColons(text: string): string {
  return /:[a-z0-9_+-]+:\s*$/i.test(text) ? text : text.replace(/:+\s*$/, '.');
}

/**
 * Autonomous AI agent that orchestrates A2A agents
 */
export class Agent {
  private toolLoopAgent;
  private orchestrator: AgentRegistry;
  private model: LanguageModel;

  constructor(orchestrator: AgentRegistry) {
    this.orchestrator = orchestrator;
    this.model = createModel();
    this.toolLoopAgent = new ToolLoopAgent({
      model: this.model,
      stopWhen: stepCountIs(10), // Allow up to 10 steps for orchestration
      instructions: `You are an intelligent AI assistant powered by multiple A2A (Agent-to-Agent) agents.

Your role is to:
1. Understand user requests and determine which agent(s) can best help
2. Call agents with clear, specific questions using callA2AAgent
3. Coordinate multiple agents when needed to provide comprehensive answers
4. Synthesize responses from agents into clear, concise, Slack-optimized answers

Available agents are provided at the start of each conversation. Do NOT call listAvailableAgents unless explicitly asked to refresh.

Transparent Operation:
- Narrate what you're doing in real-time as you work
- Before calling agents, mention which agent(s) you're reaching out to and why (e.g., "Let me check with the weather agent for the forecast...")
- When waiting for responses, you can add brief updates
- After getting responses, synthesize them into the final answer
- This helps users understand the multi-agent coordination happening

When handling requests:
- Refer to agents by name so users know who's helping
- Call agents with clear, specific questions
- Synthesize responses: reformat for Slack, improve clarity, make it conversational
- Keep final synthesized section concise (2-4 sentences for simple queries, structured lists for complex ones)

Keep responses conversational and well-formatted for easy reading in Slack. Important - no markdown tables, just clear text with line breaks or bullets as needed.`,

      tools: createTools(orchestrator),
    });
  }

  /**
   * Generate a contextual greeting message
   */
  async generateGreeting(context: { channel_id?: string }): Promise<string> {
    const agents = this.orchestrator.getHealthyAgents();
    const contextType = context.channel_id ? 'channel' : 'direct message';

    const result = await generateText({
      system:
        'You are a greeter that generates a greeting message for users who open an AI assistant in Slack. The greeting should be warm, welcoming, and briefly mention that you can help with various tasks. Use the context about available agents to make it more personalized.',
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
        system:
          'You are an AI assistant that generates suggested prompts for users based on available agents and their capabilities.',
        prompt: `Generate 2-3 suggested prompts for a Slack ${contextType}.

Available agents:
${agents.map((a) => `- ${a.name}: ${a.description}${a.capabilities?.length ? ` (${a.capabilities.join(', ')})` : ''}`).join('\n')}

Create prompts that showcase these agent capabilities.`,
        output: Output.object({
          name: 'suggestedPrompts',
          description: 'Structured suggested prompts for the user',
          schema,
        }),
        maxOutputTokens: 300,
      });

      if (!result.output) {
        console.warn('No structured output received for suggested prompts');
        return this.getFallbackPrompts();
      }

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

    // Inject available agents as context so the model doesn't need to discover them
    const agentList = healthyAgents
      .map((a) => `- ${a.name}: ${a.description || 'No description'}${a.capabilities?.length ? ` (${a.capabilities.join(', ')})` : ''}`)
      .join('\n');
    const contextMessages: ModelMessage[] = [
      { role: 'system', content: `Available agents:\n${agentList}` },
      ...messages,
    ];

    const lastMessage = messages[messages.length - 1];
    console.debug(`Agent processing request: "${lastMessage.content}" (${messages.length} messages in context)`);

    // Stream response if callback provided, otherwise generate synchronously
    if (onText) {
      const result = await this.toolLoopAgent.stream({
        messages: contextMessages,
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

          case 'text-delta': {
            responseText += event.text;
            // Flush complete paragraphs immediately so each becomes its own Slack message
            const splitIndex = responseText.lastIndexOf('\n\n');
            if (splitIndex !== -1) {
              const complete = responseText.substring(0, splitIndex).trim();
              responseText = responseText.substring(splitIndex + 2);
              if (complete) {
                await onText(`${stripTrailingColons(complete)}\n\n`);
              }
            }
            break;
          }

          case 'text-end': {
            const trimmed = responseText.trim();
            if (trimmed) {
              await onText(`${stripTrailingColons(trimmed)}\n\n`);
            }
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
      messages: contextMessages,
    });

    console.debug(`Agent generated response (${result.usage?.totalTokens || 0} tokens)`);

    return result.text;
  }
}
