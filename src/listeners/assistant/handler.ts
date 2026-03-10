import { Assistant } from '@slack/bolt';
import type { Agent } from '../../agent/index.js';

/**
 * Slack Assistant handler factory for AI-powered agent interactions.
 *
 * The Assistant handles Slack-specific events:
 * - threadStarted: When user opens a new thread with the bot
 * - threadContextChanged: When user switches channels with thread open
 * - userMessage: When user sends a message to the bot
 */
export default function createAssistant(agent: Agent) {

  return new Assistant({
    /**
     * Handle new thread started event
     * Sent when user opens the Assistant container (DM or channel side-panel)
     */
    threadStarted: async ({ event, logger, say, setSuggestedPrompts, saveThreadContext }) => {
      const { context } = event.assistant_thread;
      const title = 'Try asking me:';

      try {
        // Generate contextual greeting
        const markdown_text = await agent.generateGreeting({
          channel_id: context.channel_id,
        });
        await say({ markdown_text });

        // Save thread context for later use
        await saveThreadContext();

        // Generate contextual suggested prompts
        const prompts = await agent.generateSuggestedPrompts({
          channel_id: context.channel_id,
        });

        await setSuggestedPrompts({ title, prompts });
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
    userMessage: async ({ logger, client, message, say, setTitle, setStatus }) => {
      // Validate message structure
      if (!('text' in message) || !('thread_ts' in message) || !message.text || !message.thread_ts) {
        return;
      }

      const { thread_ts, channel } = message;

      try {
        // Retrieve the Assistant thread history from Slack for context
        // Fetch only the most recent messages for the context window
        const thread = await client.conversations.replies({
          channel,
          ts: thread_ts,
          limit: 20, // Fetch the most recent 20 messages (~10 turns of context)
        });

        // Set thread title only on first user message
        if ((thread.messages?.length || 0) <= 3) {
          // Generate AI title asynchronously - don't block on it
          agent.generateThreadTitle(message.text).then(
            (title) => setTitle(title),
            (error) => logger.error('Failed to generate thread title:', error),
          );
        }

        // Convert Slack messages to AI SDK ModelMessage format
        const conversationHistory = (thread.messages || []).map((m) => ({
          role: m.bot_id ? ('assistant' as const) : ('user' as const),
          content: m.text || '',
        }));

        logger.debug(`Processing message with ${conversationHistory.length} messages of context`);

        try {
          // Process message through agent, sending response chunks as discrete messages
          const response = await agent.processMessage(
            conversationHistory,
            // onText callback - send text chunks directly
            async (markdown_text) => {
              await say({ markdown_text });
            },
            // onStatus callback - update visible status during tool execution
            async (status) => {
              await setStatus({ status });
            },
          );

          // Clear status now that we're done
          await setStatus({ status: '' });

          logger.debug(`Sent complete response (${response.length} chars)`);
        } catch (responseError) {
          logger.error('Error during message processing:', responseError);
        }
      } catch (e) {
        logger.error('Error in userMessage:', e);

        // Send error message and clear status
        await say({
          text: `Sorry, something went wrong! ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    },
  });
}
