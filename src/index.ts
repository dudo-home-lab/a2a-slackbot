import app from './app.js';

/** Start Bolt App */
try {
  await app.start(process.env.PORT || 3000);
  app.logger.info('⚡️ Bolt app is running! ⚡️');
} catch (error) {
  app.logger.error('Unable to start App', error);
}
