import type { App } from '@slack/bolt';
import type { Agent } from '../../agent/index.js';
import createAssistant from './handler.js';

const register = (app: App, agent: Agent) => {
  app.assistant(createAssistant(agent));
};

export default { register };
