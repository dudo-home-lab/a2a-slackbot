# Bolt for JavaScript (TypeScript) A2A Assistant

This is a Slack AI Assistant built with Bolt for JavaScript (TypeScript) that integrates with an A2A (Agent-to-Agent) agent to provide intelligent responses through Slack's Assistant UI framework.

## Architecture

- **Slack Assistant** - Provides a dedicated AI assistant UI in Slack via the Assistant class
- **A2A Client** - Forwards user messages to an A2A-compliant agent
- **A2A Agent** - Processes messages and returns intelligent responses (e.g., `a2a-acme-agent`)

The bot uses Slack's Assistant framework to provide a streamlined AI experience with features like:

- Dedicated side-panel UI for AI interactions
- Thread context management
- Suggested prompts
- Status updates while processing
- Thread titles based on conversation topics

## Quick Start

To run the full system locally:

1. **Start the A2A agent** (in a separate terminal):

   ```bash
   cd ../a2a-acme-agent
   docker compose up app
   # or: npm run dev
   ```

2. **Configure Slack app** (see Installation section below)

3. **Start the Slack bot**:

   ```bash
   npm install
   cp .env.example .env
   # Edit .env with your Slack tokens
   npm run build
   npm start
   ```

4. **Test it**: Open a DM with your bot or click the Assistant icon in any channel to start chatting!

Before getting started, make sure you have a development workspace where you have permissions to install apps. If you don't have one setup, go ahead and [create one](https://slack.com/create).

**Note:** You'll need a paid Slack workspace or access to the [Developer Program](https://api.slack.com/developer-program) sandbox to use the Assistant features.

## Installation

### Create a Slack App

1. Open [https://api.slack.com/apps/new](https://api.slack.com/apps/new) and choose "From an app manifest"
2. Choose the workspace you want to install the application to
3. Copy the contents of [manifest.json](./manifest.json) into the text box that says `*Paste your manifest code here*` (within the JSON tab) and click _Next_
4. Review the configuration and click _Create_
5. **Enable Agents & AI Apps**: In App Settings, navigate to "Agents & Assistants" and enable the feature
6. Click _Install to Workspace_ and _Allow_ on the screen that follows. You'll then be redirected to the App Configuration dashboard.

#### Required Scopes

The following OAuth scopes are required (already configured in manifest.json):

- `assistant:write` - Write access to the Assistant
- `chat:write` - Send messages
- `im:history` - Read DM history
- `channels:history` - Read channel history

#### Required Events

The following bot events are required (already configured in manifest.json):

- `assistant_thread_started` - When user opens a new Assistant thread
- `assistant_thread_context_changed` - When user switches channels
- `message.im` - When user sends a DM to the bot

#### Environment Variables

Before you can run the app, you'll need to store some environment variables.

1. Copy `.env.example` to `.env`
2. Open your apps configuration page from [this list](https://api.slack.com/apps), click _OAuth & Permissions_ in the left hand menu, then copy the _Bot User OAuth Token_ into your `.env` file under `SLACK_BOT_TOKEN`
3. Click _Basic Information_ from the left hand menu and follow the steps in the _App-Level Tokens_ section to create an app-level token with the `connections:write` scope. Copy that token into your `.env` as `SLACK_APP_TOKEN`.
4. Set `A2A_AGENT_URL` to the URL of your A2A agent (default: `http://localhost:4000`)

**Important:** Make sure your A2A agent is running before starting the Slack bot. See the `a2a-acme-agent` project for instructions.

#### Install Dependencies

```sh
npm install
```

#### Build the App

```sh
npm run build
```

For development, use watch mode to automatically rebuild on changes:

```sh
npm run build:watch
```

#### Run Bolt Server

```sh
npm start
```

## Project Structure

### `manifest.json`

`manifest.json` is a configuration for Slack apps. With a manifest, you can create an app with a pre-defined configuration, or adjust the configuration of an existing app.

### `app.ts`

`app.ts` is the entry point for the application and is the file you'll run to start the server. This project aims to keep this file as thin as possible, primarily using it as a way to register the Assistant handler.

### `assistant.ts`

`assistant.ts` implements Slack's Assistant class to handle AI-powered interactions. The Assistant manages:

- **threadStarted** - When a user opens a new Assistant thread, sends greetings and suggested prompts
- **threadContextChanged** - When a user switches channels with the Assistant open
- **userMessage** - When a user sends a message, which is forwarded to the A2A agent

### `a2a-client.ts`

`a2a-client.ts` manages the connection to the A2A agent. It uses the [@a2a-js/sdk](https://www.npmjs.com/package/@a2a-js/sdk) client to send messages to the agent and receive responses.

Key features:

- Singleton pattern for managing a single agent connection
- Client factory for creating connections from URLs
- Message forwarding with response handling

## Using the Assistant

Once your app is installed and running:

1. **Direct Message**: Open a DM with your bot to start a conversation
2. **Channel Assistant**: In any channel, click the Assistant icon (⚡) in the composer and select your bot
3. **Suggested Prompts**: The bot will show suggested prompts to get you started
4. **Thread Context**: The Assistant maintains context as you switch between channels
5. **Status Updates**: You'll see "thinking..." messages while the A2A agent processes your request

## Resources

- [Slack Assistant Documentation](https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/)
- [A2A Protocol](https://github.com/google/a2a)
- [@a2a-js/sdk](https://www.npmjs.com/package/@a2a-js/sdk)
- [Bolt for JavaScript](https://api.slack.com/tools/bolt)
- [App Agent Template](https://github.com/slack-samples/bolt-js-assistant-template) - Official Slack example

Every incoming request is routed to a "listener". Inside this directory, we group each listener based on the Slack Platform feature used, so `/listeners/shortcuts` handles incoming [Shortcuts](https://api.slack.com/interactivity/shortcuts) requests, `/listeners/views` handles [View submissions](https://api.slack.com/reference/interaction-payloads/views#view_submission) and so on.

## App Distribution / OAuth

Only implement OAuth if you plan to distribute your application across multiple workspaces. A separate `app-oauth.ts` file can be found with relevant OAuth settings.

When using OAuth, Slack requires a public URL where it can send requests. In this template app, we've used [`ngrok`](https://ngrok.com/download). Checkout [this guide](https://ngrok.com/docs#getting-started-expose) for setting it up.

Start `ngrok` to access the app on an external network and create a redirect URL for OAuth.

```sh
ngrok http 3000
```

This output should include a forwarding address for `http` and `https` (we'll use `https`). It should look something like the following:

```sh
Forwarding   https://3cb89939.ngrok.io -> http://localhost:3000
```

Navigate to **OAuth & Permissions** in your app configuration and click **Add a Redirect URL**. The redirect URL should be set to your `ngrok` forwarding address with the `slack/oauth_redirect` path appended. For example:

<https://3cb89939.ngrok.io/slack/oauth_redirect>
