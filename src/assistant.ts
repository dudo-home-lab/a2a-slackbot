import { Assistant } from '@slack/bolt';
import { a2aClient } from './a2a-client.js';

/**
 * Slack Assistant handler for AI-powered agent interactions.
 *
 * The Assistant handles:
 * - threadStarted: When user opens a new thread with the bot
 * - threadContextChanged: When user switches channels with thread open
 * - userMessage: When user sends a message to the bot
 */
const assistant = new Assistant({
  /**
   * Handle new thread started event
   * Sent when user opens the Assistant container (DM or channel side-panel)
   */
  threadStarted: async ({ event, logger, say, setSuggestedPrompts, saveThreadContext }) => {
    const { context } = event.assistant_thread;

    try {
      // Send initial greeting with thread context metadata
      await say("Hi! I'm your AI assistant powered by the A2A protocol. How can I help you today?");

      // Save thread context for later use
      await saveThreadContext();

      // Provide suggested prompts based on context
      if (!context.channel_id) {
        // Direct message context - general prompts
        await setSuggestedPrompts({
          title: 'Try asking me:',
          prompts: [
            {
              title: 'Get started',
              message: 'What can you help me with?',
            },
            {
              title: 'Example query',
              message: 'Tell me something interesting!',
            },
          ],
        });
      } else {
        // Channel context - channel-specific prompts
        await setSuggestedPrompts({
          title: 'Try asking me:',
          prompts: [
            {
              title: 'About this channel',
              message: 'What can you tell me about this channel?',
            },
            {
              title: 'Get help',
              message: 'How can you assist me?',
            },
          ],
        });
      }
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

      // Show processing status
      await setStatus({
        status: 'thinking...',
        loading_messages: [
          'Consulting the A2A agent...',
          'Processing your request...',
          'Getting the best answer for you...',
          'Thinking deeply about this...',
        ],
      });

      // Get thread context for additional context
      const threadContext = await getThreadContext();
      logger.info('Thread context:', threadContext);

      // Send message to A2A agent
      const agentResponse = await a2aClient.sendMessage(message.text);

      // Send agent response back to user
      await say({
        text: agentResponse,
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

export default assistant;
