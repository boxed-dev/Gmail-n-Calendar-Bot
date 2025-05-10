# <i><b>`Gmail-n-Calendar-Bot`</b></i>

A Telegram bot that helps users manage email and coordinate calendars - all through conversational AI.<br>

---

<samp>

> <b>[!IMPORTANT]</b><br>
> <b>Handle Your Data Responsibly:</b> This bot interacts with your personal Gmail and Google Calendar data.<br>
> Ensure your API keys and tokens are kept secure and that you understand the permissions granted to the bot.<br>
> The developers are not responsible for any data mismanagement if you modify, self-host, or misuse the bot.

---

## ✨ <b>Features</b>

- <b>`Gmail Integration`</b>: List, read, send, and organize emails<br>
  Send emails with proper formatting<br>
  Apply labels for organization<br>
  Search through your inbox
- <b>`Google Calendar Integration`</b>: List upcoming events<br>
  Create and update calendar events<br>
  Find available time slots<br>
  Schedule meetings with proper time management
- <b>`Email-Calendar Coordination`</b>: Process emails for meeting requests<br>
  Schedule calendar events from email content<br>
  Send confirmation emails for scheduled events<br>
  Help manage meeting-related correspondence

---

## 🌐 <b>Mastra Framework for Agents</b>

This project uses the <a href="https://mastra.ai/" target="_blank"><b>Mastra framework</b></a> for building and orchestrating AI agents.<br>
Mastra provides a robust foundation for designing, managing, and scaling conversational and tool-using agents, making it ideal for complex digital assistant applications like this one.

---

## 🚀 <b>Setup</b>

<b>Important:</b> This bot requires API access to Google services (Gmail, Calendar) and a Telegram Bot Token.<br>
Ensure you have <code>google-credentials.json</code> (or have completed the manual Google API setup) and the <code>TELEGRAM_BOT_TOKEN</code> in your <code>.env</code> file. These are crucial for the bot to function.

### Prerequisites
- <code>Node.js</code> (v16+)
- <code>npm</code> or <code>pnpm</code>
- Google account for API access
- Telegram bot token (from <code>BotFather</code>)

### Installation

1. Clone the repository:<br>
   <code>git clone &lt;repository-url&gt; # Replace &lt;repository-url&gt; with the actual URL<br>
   cd Symptom-tracker-bot</code>
2. Install dependencies:<br>
   <code>npm install</code> <b>or</b> <code>pnpm install</code>
3. Set up Google API access:<br>
   <code>npm run setup-google-apis</code> <b>or</b> <code>pnpm run setup-google-apis</code><br>
   This will guide you through the process of setting up Google API credentials for Gmail and Calendar access.
4. Create a <code>.env</code> file in the project root with your Telegram bot token:<br>
   <code>TELEGRAM_BOT_TOKEN=your_telegram_bot_token_from_botfather</code>
5. Start the development server:<br>
   <code>npm run dev</code> <b>or</b> <code>pnpm run dev</code>

### Google API Setup (Manual)

If the automatic setup script (<code>npm run setup-google-apis</code> or <code>pnpm run setup-google-apis</code>) doesn't work for you, follow these steps:

1. Go to the <a href="https://console.cloud.google.com/">Google Cloud Console</a>.<br>
2. Create a new project or select an existing one.<br>
3. Navigate to <b>APIs & Services &gt; Library</b>.<br>
4. Enable the <b>Gmail API</b> and <b>Google Calendar API</b>.<br>
5. Go to <b>APIs & Services &gt; Credentials</b>.<br>
6. Create OAuth 2.0 credentials (select "Desktop application" type).<br>
7. Download the JSON file and save it as <code>google-credentials.json</code> in the project root directory.

---

## 🛠️ <b>Usage</b>

### Telegram Bot Commands

The bot supports the following commands:<br>
- <b><code>/start</code></b> - Initialize the bot and see available agents<br>
- <b><code>/gmail</code></b> - Switch to the Gmail management agent<br>
- <b><code>/calendar</code></b> - Switch to the Google Calendar management agent<br>
- <b><code>/assistant</code></b> - Switch to the combined Email-Calendar assistant<br>
- <b><code>/help</code></b> - Display help information

### Examples

Here are some examples of what you can do with the bot:<br>

<b>Gmail</b><br>
- "Show me my recent emails"<br>
- "Do I have any unread emails from [person]?"<br>
- "Send an email to [email address] about [topic]"<br>
- "Read email with subject [subject]"<br>

<b>Calendar</b><br>
- "What meetings do I have today?"<br>
- "Schedule a meeting with [person] tomorrow at 2pm"<br>
- "Find available slots for a 30-minute meeting this week"<br>
- "Update my 2pm meeting to include [new details]"<br>

<b>Email-Calendar Coordination</b><br>
- "Check my emails for meeting requests and schedule them"<br>
- "Send a confirmation email for my meeting with [person]"<br>
- "Find a good time for a meeting with [person] and send them an invitation"<br>

---

## 🏗️ <b>Architecture</b>

The application is built using:<br>
- <b><a href="https://mastra.ai/">Mastra.ai framework</a></b> for agent design and orchestration<br>
- <b>Google API libraries</b> for Gmail and Calendar access<br>
- <b>Node Telegram Bot API</b> for messaging<br>
- <b>TypeScript</b> for type safety<br>

The bot features multiple specialized agents:<br>
- <b>Gmail Agent</b> - For email management<br>
- <b>Calendar Agent</b> - For calendar management<br>
- <b>Email-Calendar Agent</b> - For coordinated tasks between email and calendar<br>

Each agent has its own memory system to maintain context across conversations.<br>

---

## 🔍 <b>Troubleshooting</b>

If you encounter issues with the Google API integration:<br>
- Ensure that both <b>Gmail API</b> and <b>Google Calendar API</b> are enabled in your Google Cloud project.<br>
- Check that you've completed the OAuth flow with the correct scopes (usually requested during setup-google-apis or manual setup).<br>
- Verify that <code>google-credentials.json</code> (for API client info) and <code>user-tokens.json</code> (for user OAuth tokens, usually generated after first auth) exist in your project root.<br>
- Try running the setup script again: <code>npm run setup-google-apis</code> or <code>pnpm run setup-google-apis</code>.<br>

---

## 💬 <b>Feedback & Contributions</b>

We'd love to hear your thoughts! If you encounter any issues, have suggestions for improvement, or want to contribute:<br>
- Please open an issue on the GitHub repository.<br>
- For contributions, feel free to fork the repository and submit a pull request.<br>

Your feedback and contributions are invaluable! 💌<br>

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

</samp>
