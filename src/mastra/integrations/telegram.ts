import TelegramBot from "node-telegram-bot-api";
import { googleCalendarAgent, gmailAgent, emailCalendarAgent } from "../agents";
import {
  createOAuth2Client,
  generateAuthUrl,
  exchangeCodeForToken,
  getAuthenticatedClient
} from "../integrations/googleAuth";

// Keep track of users who are currently in the process of authenticating
const awaitingAuthCodeUsers = new Set<number>();

export class TelegramIntegration {
  private bot: TelegramBot;
  private readonly MAX_MESSAGE_LENGTH = 4096; // Telegram's message length limit
  private readonly MAX_RESULT_LENGTH = 500; // Maximum length for tool results
  private userAgents: Map<number, string> = new Map(); // Map of chat IDs to active agent

  constructor(token: string) {
    this.bot = new TelegramBot(token, { polling: true });
    this.bot.on("message", this.handleMessage.bind(this));
    this.setupCommands();
  }

  private async setupCommands() {
    try {
      await this.bot.setMyCommands([
        {
          command: "start",
          description: "Start the bot and see available agents",
        },
        {
          command: "connect_google",
          description: "Connect your Google account (Gmail & Calendar)"
        },
        {
          command: "gmail",
          description: "Switch to the Gmail management agent",
        },
        {
          command: "calendar",
          description: "Switch to the Google Calendar management agent",
        },
        {
          command: "assistant",
          description: "Switch to the combined Email-Calendar assistant",
        },
        { command: "help", description: "Show available commands" },
      ]);
      console.log("Commands registered successfully");
    } catch (error) {
      console.error("Failed to register Telegram commands:", error);
    }
  }

  private escapeHtml(text: string): string {
    // Completely replace HTML tags with Telegram-friendly format
    // Only allow tags that Telegram supports: <b>, <i>, <u>, <s>, <code>, <pre>
    
    // First, replace <br> tags with actual newlines
    let processed = text.replace(/<br\s*\/?>/gi, "\n");
    
    // Remove all HTML tags except those supported by Telegram
    const allowedTags = ["b", "i", "u", "s", "code", "pre"];
    const allowedTagsRegex = new RegExp(`<\\/?(?:${allowedTags.join('|')})>`, 'gi');
    
    // Split text by allowed tags to preserve them
    const parts = processed.split(allowedTagsRegex);
    const matches = processed.match(allowedTagsRegex) || [];
    
    // Escape HTML in content parts but not in the allowed tags
    processed = parts.map(part => 
      part.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
    ).reduce((result, part, i) => 
      result + part + (matches[i] || ''), 
      ''
    );
    
    return processed;
  }

  private truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength) + "... [truncated]";
  }

  private formatToolResult(result: any): string {
    try {
      const jsonString = JSON.stringify(result, null, 2);
      return this.escapeHtml(
        this.truncateString(jsonString, this.MAX_RESULT_LENGTH)
      );
    } catch (error) {
      return `[Complex data structure - ${typeof result}]`;
    }
  }

  // Format calendar data specifically for Telegram output
  private formatCalendarOutput(text: string): string {
    // If text contains calendar-like formatting with <b> and <i> tags,
    // convert it to Telegram Markdown format instead of HTML
    if (text.includes('<b>') && text.includes('<i>')) {
      return text
        .replace(/<b>(.*?)<\/b>/g, '*$1*')       // Bold
        .replace(/<i>(.*?)<\/i>/g, '_$1_')       // Italic
        .replace(/<br\s*\/?>/gi, '\n')           // Line breaks
        .replace(/<.*?>/g, '')                   // Remove any other HTML tags
        .replace(/&lt;/g, '<')                   // Restore < symbols
        .replace(/&gt;/g, '>')                   // Restore > symbols
        .replace(/&amp;/g, '&')                  // Restore & symbols
        .replace(/&quot;/g, '"');                // Restore " symbols
    }
    return text;
  }

  private async updateOrSplitMessage(
    chatId: number,
    messageId: number | undefined,
    text: string
  ): Promise<number> {
    // Detect if this is likely a calendar output with specific formatting
    const isCalendarOutput = text.includes('<b>') && text.includes('<i>') && 
                             (text.includes('Time:') || text.includes('Location:'));
    
    if (isCalendarOutput) {
      const formattedText = this.formatCalendarOutput(text);
      
      if (text.length <= this.MAX_MESSAGE_LENGTH && messageId) {
        try {
          await this.bot.editMessageText(formattedText, {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: "Markdown"  // Use Markdown for calendar outputs
          });
          return messageId;
        } catch (error: any) {
          // If there's still an issue, try without parse mode
          if (error.message?.includes("can't parse entities")) {
            try {
              await this.bot.editMessageText(formattedText.replace(/[*_]/g, ''), {
                chat_id: chatId,
                message_id: messageId
              });
              return messageId;
            } catch (innerError: any) {
              console.warn("Error updating calendar message:", innerError.message);
            }
          }
        }
      }
      
      // If edit failed or message is too long, send a new message
      try {
        const newMessage = await this.bot.sendMessage(chatId, formattedText, {
          parse_mode: "Markdown"
        });
        return newMessage.message_id;
      } catch (error: any) {
        // Final fallback without any formatting
        console.error("Error sending formatted calendar message:", error);
        const fallbackMsg = await this.bot.sendMessage(chatId, 
          formattedText.replace(/[*_]/g, ''));
        return fallbackMsg.message_id;
      }
    }
    
    // Regular message handling (non-calendar)
    if (text.length <= this.MAX_MESSAGE_LENGTH && messageId) {
      try {
        await this.bot.editMessageText(text, {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: "HTML",
        });
        return messageId;
      } catch (error: any) {
        // Ignore if message is too old to be modified or not found
        if (!error.message?.includes('message is not modified') && !error.message?.includes('message to edit not found')) {
          console.warn("Error updating message (might be normal if message is old):", error.message);
          
          // If parsing error, try without HTML
          if (error.message?.includes("can't parse entities")) {
            try {
              await this.bot.editMessageText(text.replace(/<[^>]*>/g, ''), {
                chat_id: chatId,
                message_id: messageId
              });
              return messageId;
            } catch (innerError) {
              console.warn("Failed fallback edit:", innerError);
            }
          }
        }
      }
    }

    try {
      const newMessage = await this.bot.sendMessage(chatId, text, {
        parse_mode: "HTML",
      });
      return newMessage.message_id;
    } catch (error: any) {
      console.error("Error sending message:", error);
      // If HTML parsing failed, try without parse_mode
      if (error.message?.includes("can't parse entities")) {
        try {
          const plainMessage = await this.bot.sendMessage(
            chatId, 
            text.replace(/<[^>]*>/g, '')
          );
          return plainMessage.message_id;
        } catch (innerError) {
          console.error("Error sending plain message:", innerError);
        }
      }
      
      // Final fallback - truncated message
      const truncated =
        text.substring(0, this.MAX_MESSAGE_LENGTH - 100) +
        "\n\n... [Message truncated due to length]";
      try {
        // Try without parse mode as last resort
        const fallbackMsg = await this.bot.sendMessage(chatId, truncated.replace(/<[^>]*>/g, ''));
        return fallbackMsg.message_id;
      } catch (finalError) {
        console.error("Error sending truncated message:", finalError);
        return messageId || -1; // Return original ID or -1 if sending failed completely
      }
    }
  }

  private getActiveAgent(chatId: number) {
    const agentKey = this.userAgents.get(chatId) || "gmailAgent";
    
    switch (agentKey) {
      case "googleCalendarAgent":
        return googleCalendarAgent;
      case "emailCalendarAgent":
        return emailCalendarAgent;
      case "gmailAgent":
      default:
        return gmailAgent;
    }
  }

  private getAgentDisplayName(agentKey: string): string {
    switch (agentKey) {
      case "googleCalendarAgent":
        return "Calendar Manager";
      case "emailCalendarAgent":
        return "Combined Assistant";
      case "gmailAgent":
        return "Gmail Manager";
      default:
        return "Unknown";
    }
  }

  // Initiate Google Authentication Flow
  private async initiateGoogleAuth(chatId: number, userId: string) {
    try {
      const oAuth2Client = createOAuth2Client();
      const authUrl = generateAuthUrl(oAuth2Client);

      await this.bot.sendMessage(chatId, 
        `To use Google services, please authorize this application:\n\n` +
        `1. Click this link: ${authUrl}\n` +
        `2. Approve the permissions.\n` +
        `3. You'll be redirected to a page showing a code. Copy that code.\n` +
        `4. Paste the code back here in this chat.\n\n` +
        `<b>Important:</b> This code is sensitive, treat it like a password.`, 
        { parse_mode: "HTML" }
      );
      
      // Mark user as awaiting the code
      awaitingAuthCodeUsers.add(chatId);
      console.log(`Auth URL sent to user ${userId} (chatId: ${chatId}), awaiting code.`);
      
    } catch (error) {
      console.error("Error initiating Google Auth:", error);
      await this.bot.sendMessage(chatId, "Sorry, I couldn't start the Google connection process. Please check the server logs.");
    }
  }

  // Handle incoming messages
  private async handleMessage(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const text = msg.text;
    // Use msg.from.id as the stable, unique user identifier
    const userId = msg.from?.id?.toString();

    if (!userId) {
      console.warn("Received message without user ID:", msg);
      // Optionally send a message back, but likely an edge case
      // await this.bot.sendMessage(chatId, "Could not identify user.");
      return;
    }

    const username = msg.from?.username || "unknown";
    const firstName = msg.from?.first_name || "unknown";
    const timestamp = new Date(msg.date ? msg.date * 1000 : Date.now());
    const formattedDate = timestamp.toISOString().split("T")[0];
    const formattedTime = timestamp.toTimeString().split(" ")[0];

    console.log(`Received message: "${text}" from user ${userId} (chat ${chatId})`);

    // Check if user is sending back an authorization code
    if (awaitingAuthCodeUsers.has(chatId) && text && text.length > 20) { // Basic check for code format
      console.log(`Received potential auth code from user ${userId} (chat ${chatId})`);
      awaitingAuthCodeUsers.delete(chatId); // Stop listening for code

      const oAuth2Client = createOAuth2Client();
      const success = await exchangeCodeForToken(oAuth2Client, text, userId);

      if (success) {
        await this.bot.sendMessage(chatId, "✅ Google account connected successfully! You can now use Gmail and Calendar features.");
      } else {
        await this.bot.sendMessage(chatId, "❌ Failed to connect Google account. The code might be invalid or expired. Please try `/connect_google` again.");
      }
      return; 
    }

    if (text?.startsWith('/')) {
      switch (text) {
        case "/start":
          await this.bot.sendMessage(
            chatId,
            "👋 <b>Welcome to your Digital Assistant!</b>\n\nI can help you manage your digital life:\n\n" +
            "📧 <b>Gmail Manager</b> - Manage your emails and inbox\n" +
            "📅 <b>Calendar Manager</b> - Schedule and track appointments\n" +
            "🤖 <b>Combined Assistant</b> - Coordinate between email and calendar\n\n" +
            "Use these commands to switch between different assistants:\n" +
            "• /gmail - For email management\n" +
            "• /calendar - For calendar management\n" +
            "• /assistant - For combined email and calendar help\n\n" +
            "Please use `/connect_google` to connect your Google account first.\n" +
            "What would you like help with today?",
            { parse_mode: "HTML" }
          );
          this.userAgents.set(chatId, "gmailAgent");
          return;
        case "/connect_google":
          await this.initiateGoogleAuth(chatId, userId);
          return;
        case "/gmail":
          this.userAgents.set(chatId, "gmailAgent");
          await this.bot.sendMessage(
            chatId,
            "📧 <b>Gmail Assistant Activated</b>\n\nI'll help you manage your emails and inbox. What would you like to do with your emails today?",
            { parse_mode: "HTML" }
          );
          return;
        case "/calendar":
          this.userAgents.set(chatId, "googleCalendarAgent");
          await this.bot.sendMessage(
            chatId,
            "📅 <b>Calendar Assistant Activated</b>\n\nI'll help you manage your schedule and appointments. What would you like to do with your calendar today?",
            { parse_mode: "HTML" }
          );
          return;
        case "/assistant":
          this.userAgents.set(chatId, "emailCalendarAgent");
          await this.bot.sendMessage(
            chatId,
            "🤖 <b>Combined Email-Calendar Assistant Activated</b>\n\nI can help you coordinate between your emails and calendar. What would you like me to help you with today?",
            { parse_mode: "HTML" }
          );
          return;
        case "/help":
          await this.bot.sendMessage(
            chatId,
            `🔍 <b>Available Commands:</b>\n\n` +
              `• <code>/start</code> - Initialize the bot\n` +
              `• <code>/connect_google</code> - Connect your Google Account\n` +
              `• <code>/gmail</code> - Switch to Gmail Manager\n` +
              `• <code>/calendar</code> - Switch to Calendar Manager\n` +
              `• <code>/assistant</code> - Switch to Combined Assistant\n` +
              `• <code>/help</code> - Display this help message\n\n` +
              `<b>Current active agent:</b> ${this.getAgentDisplayName(this.userAgents.get(chatId) || "gmailAgent")}`, 
            { parse_mode: "HTML" }
          );
          return;
        default:

           break;
      }
    }

    if (!text) {

      return;
    }

    const currentAgentKey = this.userAgents.get(chatId) || "gmailAgent"; 
    const requiresGoogle = ["gmailAgent", "googleCalendarAgent", "emailCalendarAgent"].includes(currentAgentKey);
    
    if (requiresGoogle) {
        const client = await getAuthenticatedClient(userId);
        if (!client) {
            await this.bot.sendMessage(chatId, "⚠️ Google connection needed. Please use the `/connect_google` command first.");
            return; // Don't proceed without authentication
        }
    }

    // Proceed with agent streaming
    try {
      const thinkingMessage = await this.bot.sendMessage(chatId, "Thinking...", { disable_notification: true });
      let currentResponse = "";
      let lastUpdate = Date.now();
      let currentMessageId = thinkingMessage.message_id;
      const UPDATE_INTERVAL = 700; // Slightly longer interval

      const activeAgent = this.getActiveAgent(chatId);

      // Stream response, passing userId in the context
      // The agent instructions should guide it to use the userId from context for tool calls
      const stream = await activeAgent.stream(text, {
        threadId: `telegram-${userId}`, // Use userId for thread consistency
        resourceId: userId, // Explicitly pass userId as resource if needed by framework
        context: [
          { role: "system", content: `Current user ID: ${userId}\nCurrent date: ${formattedDate}\nCurrent time: ${formattedTime}` },
        ]
      });

      let finalResponseText = '';
      for await (const chunk of stream.fullStream) {
        let shouldUpdate = false;
        let chunkText = "";

        switch (chunk.type) {
          case "text-delta":
            // Handle <br> tags and ensure proper line breaks
            const sanitizedDelta = chunk.textDelta.replace(/<br\s*\/?>/gi, "\n");
            
            // For calendar-like outputs, don't try to escape HTML, we'll handle it in updateOrSplitMessage
            const isCalendarContent = sanitizedDelta.includes('<b>') && 
                                     (sanitizedDelta.includes('Time:') || 
                                      sanitizedDelta.includes('Location:'));
            
            chunkText = isCalendarContent ? sanitizedDelta : this.escapeHtml(sanitizedDelta);
            finalResponseText += sanitizedDelta;
            shouldUpdate = true;
            break;
            
          case "tool-call":
            // No HTML tags in tool name output
            chunkText = `\n🛠️ Using tool: ${this.escapeHtml(chunk.toolName)}...\n`;
            console.log(`Tool call by ${userId}: ${chunk.toolName}`, chunk.args);
            shouldUpdate = true;
            break;
          case "tool-result":
            console.log(`Tool result for ${userId}: ${chunk.toolName}`, chunk.result);
            // Avoid showing raw results unless necessary
            break;
          case "error":
            const errorMessage = chunk.error instanceof Error ? chunk.error.message : String(chunk.error);
            console.error(`Agent error for user ${userId}:`, chunk.error);
            // Escape only the dynamic error message when inserting into our HTML structure
            if (errorMessage.includes("Authentication required")) {
                chunkText = `\n⚠️ Google connection needed. Please use the \`/connect_google\` command.\n\n`;
            } else {
                chunkText = `\n❌ <b>Error:</b> ${this.escapeHtml(errorMessage)}\n\n`;
            }
            finalResponseText += ` [Error: ${errorMessage}]`; // Append error text to final raw text
            shouldUpdate = true;
            break;
          default:
            break;
        }

        if (chunkText) {
          // Append the processed chunk (sanitized text or formatted tool info)
          currentResponse += chunkText; 
          const now = Date.now();
          // Update the "Thinking..." message periodically
          if (shouldUpdate && now - lastUpdate >= UPDATE_INTERVAL && currentMessageId) {
            try {
              await this.bot.editMessageText(currentResponse + "\n(Processing...)", {
                 chat_id: chatId,
                 message_id: currentMessageId,
                 parse_mode: "HTML" // Ensure parse_mode is set here
              }).catch((editError: any) => { // Catch potential errors
                 if (!editError.message?.includes('message is not modified') && !editError.message?.includes('message to edit not found')) {
                    console.warn("Error editing thinking message:", editError.message);
                 }
              });
              lastUpdate = now;
            } catch (error) {
              console.warn("Error during periodic message update:", error);
            }
          }
        }
      } // End stream processing

      if (currentResponse.trim()) {
           await this.updateOrSplitMessage(chatId, currentMessageId, currentResponse);
      } else {
           // If there was no text response but maybe tool calls, delete the thinking message
           await this.bot.deleteMessage(chatId, currentMessageId).catch(delErr => 
              console.warn("Could not delete 'Thinking...' message:", delErr)
           );
      }
      

    } catch (error) {
      console.error(`Error processing message for user ${userId}:`, error);
      let userFriendlyError = "Sorry, I encountered an error processing your request. Please try again later.";
      if (error instanceof Error && error.message.includes("Authentication required")) {
          userFriendlyError = "⚠️ Google connection needed. Please use the `/connect_google` command first.";
      }
      await this.bot.sendMessage(chatId, userFriendlyError);
    }
  }
}
