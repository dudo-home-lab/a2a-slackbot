import { App, LogLevel } from '@slack/bolt';
import { Agent } from './agent/index.js';
import { AgentRegistry } from './agent/registry.js';
import registerListeners from './listeners/index.js';

/** Initialize Agent Registry */
const orchestrator = new AgentRegistry();

// Register agents (async discovery happens in background)
if (process.env.ACME_AGENT_URL) {
  orchestrator.registerAgent({
    name: 'acme',
    url: process.env.ACME_AGENT_URL,
    description: 'ACME goat farming expert agent',
  });
}

if (process.env.WEATHER_AGENT_URL) {
  orchestrator.registerAgent({
    name: 'weather',
    url: process.env.WEATHER_AGENT_URL,
    description: 'Weather information and forecasting agent',
  });
}

if (process.env.TRAVEL_AGENT_URL) {
  orchestrator.registerAgent({
    name: 'travel',
    url: process.env.TRAVEL_AGENT_URL,
    description: 'Travel planning and itinerary agent',
  });
}

/** Initialize Agent */
const agent = new Agent(orchestrator);

/** Initialize Slack App */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel[(process.env.LOG_LEVEL || 'INFO').toUpperCase() as keyof typeof LogLevel],
});

/** Register Listeners */
registerListeners(app, agent);

export default app;
