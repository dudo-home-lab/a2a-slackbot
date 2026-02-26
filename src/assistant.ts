import { Assistant } from '@slack/bolt';
import { createAgent } from './agent.js';
import type { AgentRegistry } from './agent-registry/index.js';

/**
 * Slack Assistant handler factory for AI-powered agent interactions.
 *
 * The Assistant handles Slack-specific events:
 * - threadStarted: When user opens a new thread with the bot
 * - threadContextChanged: When user switches channels with thread open
 * - userMessage: When user sends a message to the bot
 */
export default function createAssistant(orchestrator: AgentRegistry) {
  // Create the autonomous AI agent
  const agent = createAgent(orchestrator);

  return new Assistant({
    /**
     * Handle new thread started event
     * Sent when user opens the Assistant container (DM or channel side-panel)
     */
    threadStarted: async ({ event, logger, say, setSuggestedPrompts, saveThreadContext }) => {
      const { context } = event.assistant_thread;

      try {
        // Generate contextual greeting
        const greeting = await agent.generateGreeting({
          channel_id: context.channel_id,
        });
        await say(greeting);

        // Save thread context for later use
        await saveThreadContext();

        // Generate contextual suggested prompts
        const prompts = await agent.generateSuggestedPrompts({
          channel_id: context.channel_id,
        });

        await setSuggestedPrompts({
          title: 'Try asking me:',
          prompts: prompts,
        });
      } catch (e) {
        logger.error('Error in threadStarted:', e);
      }
    },

    /**
     * Handle thread context changed event
     * Sent when user switches channels while Assistant is open
     */
    threadContextChanged: async ({ logger, saveThreadContext }) => {
      try {
        await saveThreadContext();
      } catch (e) {
        logger.error('Error in threadContextChanged:', e);
      }
    },

    /**
     * Handle user message event
     * Processes messages sent by the user and responds via A2A agent
     */
    userMessage: async ({ logger, message, getThreadContext, say, setTitle, setStatus }) => {
      // Validate message structure
      if (!('text' in message) || !('thread_ts' in message) || !message.text || !message.thread_ts) {
        return;
      }

      const { thread_ts } = message;

      try {
        // Set thread title based on first user message
        await setTitle(message.text);

        // Generate contextual loading messages
        const loadingMessages = await agent.generateLoadingMessages();

        // Show processing status
        await setStatus({
          status: 'thinking...',
          loading_messages: loadingMessages,
        });

        // Get thread context for additional context
        const threadContext = await getThreadContext();
        logger.info('Thread context:', threadContext);

        // Process message through agent
        const response = await agent.processMessage(message.text);

        // Send agent response back to user
        await say({
          text: response,
          thread_ts: thread_ts,
        });
      } catch (e) {
        logger.error('Error in userMessage:', e);

        // Send error message and clear status
        await say({
          text: `Sorry, something went wrong! ${e instanceof Error ? e.message : String(e)}`,
          thread_ts: thread_ts,
        });
      }
    },
  });
}
