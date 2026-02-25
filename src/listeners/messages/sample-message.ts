import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { a2aClient } from '../../a2a-client.js';

const sampleMessageCallback = async ({
  message,
  logger,
  say,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>) => {
  try {
    // Get the message text
    const messageText = (message as { text?: string }).text || '';

    if (!messageText) {
      return;
    }

    logger.info(`Received message: ${messageText}`);

    // Send message to A2A agent
    const agentResponse = await a2aClient.sendMessage(messageText, {
      userId: (message as { user?: string }).user,
    });

    // Send agent's response back to Slack
    await say(agentResponse);
  } catch (error) {
    logger.error('Error processing message:', error);
    await say('Sorry, I encountered an error processing your message. Please try again.');
  }
};

export { sampleMessageCallback };
