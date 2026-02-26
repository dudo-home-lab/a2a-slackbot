import { App, LogLevel } from '@slack/bolt';
import { AgentRegistry } from './agent-registry/index.js';
import assistant from './assistant.js';

/** Initialize Agent Registry */
const orchestrator = new AgentRegistry();

// Register agents (async discovery happens in background)
if (process.env.ACME_AGENT_URL) {
  orchestrator.registerAgent({
    name: 'acme',
    url: process.env.ACME_AGENT_URL,
    description: 'ACME general purpose agent',
  });
}

// TODO: Register additional agents as needed
// Example:
// if (process.env.ANALYTICS_AGENT_URL) {
//   orchestrator.registerAgent({
//     name: 'analytics',
//     url: process.env.ANALYTICS_AGENT_URL,
//     description: 'Analytics and data processing agent',
//   });
// }

/** Initialize Slack App */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel[(process.env.LOG_LEVEL || 'INFO').toUpperCase() as keyof typeof LogLevel],
});

/** Register Assistant */
app.assistant(assistant(orchestrator));

export default app;
