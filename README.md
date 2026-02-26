# A2A Slackbot

A Slack AI Assistant built with Bolt for JavaScript (TypeScript) that forwards messages to an [A2A](https://github.com/google/a2a)-compliant agent.

## Prerequisites

- A paid Slack workspace or [Developer Program](https://api.slack.com/developer-program) sandbox (required for Assistant features)
- A running A2A agent (e.g., `a2a-acme-agent`)

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps/new](https://api.slack.com/apps/new) and choose "From an app manifest"
2. Paste the contents of [`manifest.json`](./manifest.json) and click through to create the app
3. In App Settings, navigate to "Agents & Assistants" and enable the feature
4. Click _Install to Workspace_

### 2. Configure Environment

```sh
cp .env.example .env
```

- `SLACK_BOT_TOKEN` — from _OAuth & Permissions_ → Bot User OAuth Token
- `SLACK_APP_TOKEN` — from _Basic Information_ → App-Level Tokens (scope: `connections:write`)
- `ACME_AGENT_URL` — URL of your ACME A2A agent (default: `http://localhost:4000`)

### 3. Run

```sh
npm install
npm run build
npm start
```

For development with auto-rebuild:

```sh
npm run build:watch
```

## Resources

- [Slack Assistant Docs](https://docs.slack.dev/tools/bolt-js/concepts/ai-apps/)
- [A2A Protocol](https://github.com/google/a2a)
- [@a2a-js/sdk](https://www.npmjs.com/package/@a2a-js/sdk)
- [Bolt for JavaScript](https://api.slack.com/tools/bolt)
