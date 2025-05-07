// Gmail Tools - Real Implementation using Google API
import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getGmailService } from "../integrations/googleAuth";

// Helper function to format email with proper Base64 encoding
function createEmail({to, subject, body}: {to: string, subject: string, body: string}) {
  const emailLines = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body
  ];
  
  return Buffer.from(emailLines.join('\r\n')).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// Helper to parse Gmail message
function parseMessage(message: any) {
  if (!message || !message.payload || !message.payload.headers) {
    console.warn("Could not parse message, missing payload or headers:", message?.id);
    return {
      id: message?.id || 'unknown',
      subject: '(Parsing Error)',
      from: '(Parsing Error)',
      date: new Date().toISOString(),
      snippet: message?.snippet || '(No snippet available)'
    };
  }
  const headers = message.payload.headers.reduce((acc: any, header: any) => {
    acc[header.name.toLowerCase()] = header.value;
    return acc;
  }, {});
  
  // Extract snippet or body
  let snippet = message.snippet || '';
  
  return {
    id: message.id,
    subject: headers.subject || '(No Subject)',
    from: headers.from || '(Unknown Sender)',
    date: headers.date || new Date().toISOString(),
    snippet: snippet
  };
}

export const listEmailsTool = createTool({
  id: "list-emails",
  description: "List recent emails from the user's Gmail inbox.",
  inputSchema: z.object({
    count: z.number().optional().default(10).describe("Number of emails to retrieve"),
    query: z.string().optional().describe("Search query to filter emails"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    subject: z.string(),
    from: z.string(),
    date: z.string(),
    snippet: z.string(),
  })),
  execute: async ({ context }) => {
    const { count = 10, query = '', userId } = context;
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }
    try {
      const gmail = await getGmailService(userId);
      if (!gmail) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      
      // List messages from inbox
      const response = await gmail.users.messages.list({
        userId: 'me',
        maxResults: count,
        q: query
      });
      
      if (!response.data.messages || response.data.messages.length === 0) {
        console.log('No emails found matching criteria');
        return [];
      }
      
      // Get full details for each message
      const emails = await Promise.all(
        response.data.messages.map(async (message) => {
          if (!message.id) return null; // Skip if no ID
          const fullMessage = await gmail.users.messages.get({
            userId: 'me',
            id: message.id
          });
          
          return parseMessage(fullMessage.data);
        })
      );
      
      // Filter out any null results from skipped messages
      return emails.filter(email => email !== null) as any;
    } catch (error) {
      console.error('Failed to list emails:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      throw new Error(`Failed to list emails: ${errorMessage}`);
    }
  },
});

export const sendEmailTool = createTool({
  id: "send-email",
  description: "Send an email using Gmail.",
  inputSchema: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body content (can include HTML formatting)"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    emailId: z.string().optional(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { to, subject, body, userId } = context;
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }
    try {
      const gmail = await getGmailService(userId);
      if (!gmail) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      
      // Create the email content
      const rawEmail = createEmail({ to, subject, body });
      
      // Send the email
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: rawEmail
        }
      });
      
      console.log(`Email sent successfully with ID: ${response.data.id}`);
      
      return { 
        success: true, 
        emailId: response.data.id ?? undefined, 
        message: "Email sent successfully" 
      };
    } catch (error) {
      console.error('Failed to send email:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      return {
        success: false,
        message: `Failed to send email: ${errorMessage}`
      };
    }
  },
});

export const deleteEmailTool = createTool({
  id: "delete-email",
  description: "Delete or trash an email from Gmail.",
  inputSchema: z.object({
    emailId: z.string().describe("ID of the email to delete"),
    permanent: z.boolean().optional().default(false).describe("If true, permanently deletes the email instead of moving to trash"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { emailId, permanent = false, userId } = context;
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }
    try {
      const gmail = await getGmailService(userId);
      if (!gmail) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      
      if (permanent) {
        // Permanently delete the message
        await gmail.users.messages.delete({
          userId: 'me',
          id: emailId
        });
        
        return { 
          success: true, 
          message: "Email permanently deleted" 
        };
      } else {
        // Move message to trash
        await gmail.users.messages.trash({
          userId: 'me',
          id: emailId
        });
        
        return { 
          success: true, 
          message: "Email moved to trash" 
        };
      }
    } catch (error) {
      console.error('Failed to delete email:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      return { 
        success: false, 
        message: `Failed to delete email: ${errorMessage}` 
      };
    }
  },
});

export const readEmailTool = createTool({
  id: "read-email",
  description: "Get the full content of a specific email.",
  inputSchema: z.object({
    emailId: z.string().describe("ID of the email to read"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.object({
    id: z.string(),
    subject: z.string(),
    from: z.string(),
    to: z.string(),
    date: z.string(),
    body: z.string(),
    attachments: z.array(z.object({
      filename: z.string(),
      mimeType: z.string()
    })).optional()
  }),
  execute: async ({ context }) => {
    const { emailId, userId } = context;
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }
    try {
      const gmail = await getGmailService(userId);
       if (!gmail) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      
      // Get the full message
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: emailId,
        format: 'full'
      });
      
      const message = response.data;
      if (!message?.id) throw new Error("Message not found or missing ID");
      if (!message.payload?.headers) throw new Error("Could not parse message headers");
      
      // Extract headers
      const headers = message.payload.headers.reduce((acc: any, header: any) => {
        acc[header.name.toLowerCase()] = header.value;
        return acc;
      }, {});
      
      // Extract body content
      let body = '';
      let attachments: { filename: string; mimeType: string }[] = [];
      
      // Function to extract parts recursively
      function extractParts(messagePart: any) {
        if (!messagePart) return;
        
        if (messagePart.body && messagePart.body.data) {
          // Found text content
          const buff = Buffer.from(messagePart.body.data, 'base64');
          body += buff.toString('utf-8'); // Specify encoding
        }
        
        // Check for attachments
        if (messagePart.filename && messagePart.filename.length > 0) {
          attachments.push({
            filename: messagePart.filename,
            mimeType: messagePart.mimeType
          });
        }
        
        // Process nested parts if they exist
        if (messagePart.parts) {
          messagePart.parts.forEach(extractParts);
        }
      }
      
      // Start extraction with the top-level message
      if (message.payload) {
        extractParts(message.payload);
      }
      
      return {
        id: message.id, // message.id is guaranteed non-null here
        subject: headers.subject || '(No Subject)',
        from: headers.from || '(Unknown Sender)',
        to: headers.to || '(Unknown Recipient)',
        date: headers.date || new Date().toISOString(),
        body: body || message.snippet || '',
        attachments: attachments.length > 0 ? attachments : undefined
      };
    } catch (error) {
      console.error('Failed to read email:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      throw new Error(`Failed to read email: ${errorMessage}`);
    }
  }
});

export const labelEmailTool = createTool({
  id: "label-email",
  description: "Apply labels to an email.",
  inputSchema: z.object({
    emailId: z.string().describe("ID of the email to label"),
    labels: z.array(z.string()).describe("Labels to apply to the email"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { emailId, labels, userId } = context;
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }
    try {
      const gmail = await getGmailService(userId);
       if (!gmail) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      
      // Modify the message labels
      await gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: {
          addLabelIds: labels
        }
      });
      
      return { 
        success: true, 
        message: `Successfully applied labels: ${labels.join(', ')}` 
      };
    } catch (error) {
      console.error('Failed to label email:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      return { 
        success: false, 
        message: `Failed to apply labels: ${errorMessage}` 
      };
    }
  }
}); 