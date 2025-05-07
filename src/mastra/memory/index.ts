import { Memory } from "@mastra/memory";

export const gmailMemory = new Memory({
  options: {
    // Keep the last 10 messages in immediate context
    lastMessages: 10,
    
    // Enable semantic recall with custom settings
    semanticRecall: {
      topK: 5, // Retrieve 5 most relevant messages
      messageRange: 2, // Include 2 messages before and after each match
    },
    
    // Enable working memory with a custom template
    workingMemory: {
      enabled: true,
      use: "tool-call", // Use the tool-call method for updating working memory
      template: `
# Gmail Management Profile

## User Communication Preferences
- User Name:
- Email Address:
- Preferred Response Time:
- Important Contacts:
- VIP Senders:
- Blocked Senders:

## Email Organization
- Priority Categories:
- Labeling Preferences:
- Folders Structure:
- Archive Strategy:

## Common Email Patterns
- Regular Newsletters:
- Frequent Correspondents:
- Reply Patterns:
- Follow-up Required:

## Recent Important Emails
<!-- Organize by date, most recent first. Format: [YYYY-MM-DD] -->

[DATE]:
- Sender:
- Subject:
- Status (Read/Unread/Replied):
- Follow-up Needed (Y/N):
- Notes:

[DATE]:
- Sender:
- Subject:
- Status (Read/Unread/Replied):
- Follow-up Needed (Y/N):
- Notes:

## Pending Actions
- Reply Needed:
- Drafts to Complete:
- Scheduled Emails:
- Emails to Forward:
`,
    },
  },
});

export const calendarMemory = new Memory({
  options: {
    // Keep the last 10 messages in immediate context
    lastMessages: 10,
    
    // Enable semantic recall with custom settings
    semanticRecall: {
      topK: 5, // Retrieve 5 most relevant messages
      messageRange: 2, // Include 2 messages before and after each match
    },
    
    // Enable working memory with a custom template
    workingMemory: {
      enabled: true,
      use: "tool-call", // Use the tool-call method for updating working memory
      template: `
# Calendar Management Profile

## User Schedule Preferences
- User Name:
- Time Zone:
- Working Hours:
- Meeting Preferences:
- Buffer Time Preferences:
- Focus Time Blocks:
- Calendar Color Coding:

## Regular Commitments
- Recurring Meetings:
- Standing Appointments:
- Blocked Time Slots:
- Preferred Meeting Days/Times:

## Upcoming Important Events
<!-- Organize by date, most recent first. Format: [YYYY-MM-DD] -->

[DATE]:
- Event Title:
- Time:
- Participants:
- Location:
- Preparation Needed:
- Notes:

[DATE]:
- Event Title:
- Time:
- Participants:
- Location:
- Preparation Needed:
- Notes:

## Calendar Actions
- Meetings to Schedule:
- Events to Reschedule:
- Responses Pending:
- Conflicts to Resolve:
`,
    },
  },
});
