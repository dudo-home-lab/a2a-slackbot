import type { App } from '@slack/bolt';
import type { Agent } from '../agent/index.js';
import assistant from './assistant/index.js';

export default function registerListeners(app: App, agent: Agent) {
  assistant.register(app, agent);
}
