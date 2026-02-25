import { App, LogLevel } from '@slack/bolt';
import assistant from './assistant.js';

/** Initialization */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel[(process.env.LOG_LEVEL || 'INFO').toUpperCase() as keyof typeof LogLevel],
});

/** Register Assistant */
app.assistant(assistant);

export default app;
