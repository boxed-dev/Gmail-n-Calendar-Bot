import { Mastra } from "@mastra/core/mastra";
import { createLogger } from "@mastra/core/logger";
import { googleCalendarAgent } from "./agents/googleCalendarAgent";
import { gmailAgent } from "./agents/gmailAgent";
import { emailCalendarAgent } from "./agents/emailCalendarAgent";
import { TelegramIntegration } from "./integrations/telegram";

export const mastra = new Mastra({
  agents: {
    googleCalendarAgent,
    gmailAgent,
    emailCalendarAgent
  },
  logger: createLogger({
    name: "Mastra",
    level: "info",
  }),
});

// Initialize Telegram bot if token is available
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_BOT_TOKEN) {
  console.error("TELEGRAM_BOT_TOKEN is not set in environment variables");
  process.exit(1);
}

// Start the Telegram bot
export const telegramBot = new TelegramIntegration(TELEGRAM_BOT_TOKEN);
