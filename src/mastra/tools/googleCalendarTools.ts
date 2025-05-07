import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getCalendarService } from "../integrations/googleAuth";

function ensureRFC3339(dateString: string | undefined | null): string | undefined {
  if (!dateString) return undefined;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      console.warn(`[ensureRFC3339] Invalid date string received: ${dateString}`);
      return undefined;
    }
    return date.toISOString(); 
  } catch (e) {
    console.warn(`[ensureRFC3339] Error parsing date string ${dateString}:`, e);
    return undefined;
  }
}

function formatEvent(event: any) {
  const startString = event.start?.dateTime || event.start?.date;
  const endString = event.end?.dateTime || event.end?.date;
  
  return {
    id: event.id || 'unknown',
    summary: event.summary || '(No Title)',
    start: ensureRFC3339(startString) || '',
    end: ensureRFC3339(endString) || '',
    location: event.location || undefined,
    description: event.description || undefined,
    attendees: event.attendees?.map((a: any) => a.email).filter(Boolean) || undefined,
    conferenceData: event.conferenceData || undefined
  };
}

export const listCalendarEventsTool = createTool({
  id: "list-calendar-events",
  description: "List upcoming Google Calendar events for the user.",
  inputSchema: z.object({
    timeMin: z.string().optional().describe("Start time in ISO format (RFC3339). Defaults to current time"),
    timeMax: z.string().optional().describe("End time in ISO format (RFC3339). Defaults to 7 days from now"),
    maxResults: z.number().optional().default(10).describe("Maximum number of events to return"),
    query: z.string().optional().describe("Search query to filter events"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.array(z.object({
    id: z.string(),
    summary: z.string(),
    start: z.string(),
    end: z.string(),
    location: z.string().optional(),
    description: z.string().optional(),
    attendees: z.array(z.string()).optional(),
    conferenceData: z.any().optional()
  })),
  execute: async ({ context }) => {
    const {
      timeMin: rawTimeMin,
      timeMax: rawTimeMax,
      maxResults = 10,
      query = '',
      userId
    } = context;
    
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }
    
    const timeMin = ensureRFC3339(rawTimeMin) || new Date().toISOString();
    const timeMax = ensureRFC3339(rawTimeMax) || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    console.log(`[listCalendarEventsTool] Using timeMin: ${timeMin}, timeMax: ${timeMax}`);

    try {
      const calendar = await getCalendarService(userId);
      if (!calendar) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      
      const listParams: any = {
        calendarId: 'primary',
        timeMin,
        timeMax,
        maxResults,
        singleEvents: true,
        orderBy: 'startTime'
      };
      if (query) {
        listParams.q = query;
      }

      const response = await calendar.events.list(listParams);
      
      if (!response.data.items || response.data.items.length === 0) {
        console.log('No upcoming events found.');
        return [];
      }
      
      return response.data.items.map(formatEvent);
    } catch (error: any) {
      console.error('Failed to list calendar events:', error.response?.data || error.message || error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      const googleError = error.response?.data?.error?.message || errorMessage;
      throw new Error(`Failed to list calendar events: ${googleError}`);
    }
  },
});

export const createCalendarEventTool = createTool({
  id: "create-calendar-event",
  description: "Create a new event in Google Calendar.",
  inputSchema: z.object({
    summary: z.string().describe("Event title"),
    start: z.string().describe("Start time (RFC3339 format, e.g., 2023-10-27T10:00:00Z)"),
    end: z.string().describe("End time (RFC3339 format, e.g., 2023-10-27T11:00:00Z)"),
    location: z.string().optional().describe("Event location"),
    description: z.string().optional().describe("Event description"),
    attendees: z.array(z.string().email()).optional().describe("List of attendee email addresses"),
    conferenceData: z.boolean().optional().default(false).describe("Whether to add Google Meet videoconference"),
    allDay: z.boolean().optional().default(false).describe("Whether this is an all-day event. If true, start/end should be dates like YYYY-MM-DD"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    eventId: z.string().optional(),
    eventLink: z.string().optional(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const {
      summary,
      start: rawStart,
      end: rawEnd,
      location,
      description,
      attendees,
      conferenceData = false,
      allDay = false,
      userId
    } = context;
    
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }

    let startObj, endObj;
    try {
      if (allDay) {
          startObj = { date: new Date(rawStart).toISOString().split('T')[0] };
          endObj = { date: new Date(rawEnd).toISOString().split('T')[0] };
          if (new Date(endObj.date) <= new Date(startObj.date)) {
              let tempEndDate = new Date(startObj.date);
              tempEndDate.setDate(tempEndDate.getDate() + 1);
              endObj.date = tempEndDate.toISOString().split('T')[0];
              console.warn("[createCalendarEventTool] All-day end date was before start date, adjusted end date.");
          }
      } else {
          const formattedStart = ensureRFC3339(rawStart);
          const formattedEnd = ensureRFC3339(rawEnd);
          if (!formattedStart || !formattedEnd) {
              throw new Error("Invalid start or end date format provided. Use full ISO 8601 format with timezone.");
          }
          startObj = { dateTime: formattedStart };
          endObj = { dateTime: formattedEnd };
      }
    } catch (e) {
        throw new Error("Invalid start or end date format. Use full ISO 8601 format (e.g., YYYY-MM-DDTHH:mm:ssZ).");
    }

    try {
      const calendar = await getCalendarService(userId);
      if (!calendar) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      
      const attendeeObjects = attendees
        ? attendees.map(email => ({ email }))
        : undefined;
      
      const eventRequestBody: any = {
          summary,
          location,
          description,
          start: startObj,
          end: endObj,
          attendees: attendeeObjects,
      };

      if (conferenceData) {
          eventRequestBody.conferenceData = { createRequest: { requestId: `${Date.now()}-${Math.random()}` } };
      }

      const response = await calendar.events.insert({
        calendarId: 'primary',
        requestBody: eventRequestBody,
        conferenceDataVersion: conferenceData ? 1 : 0
      });
      
      const event = response.data;
      console.log(`Event created by ${userId}: ${event.summary}`);
      
      return { 
        success: true, 
        eventId: event.id ?? undefined, 
        eventLink: event.htmlLink ?? undefined,
        message: "Event created successfully" 
      };
    } catch (error: any) {
      console.error('Failed to create event:', error.response?.data || error.message || error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      const googleError = error.response?.data?.error?.message || errorMessage;
      return {
        success: false,
        message: `Failed to create event: ${googleError}`
      };
    }
  },
});

export const deleteCalendarEventTool = createTool({
  id: "delete-calendar-event",
  description: "Delete an event from Google Calendar.",
  inputSchema: z.object({
    eventId: z.string().describe("ID of the event to delete"),
    notifyAttendees: z.boolean().optional().default(false).describe("Whether to notify attendees of the deletion"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const { eventId, notifyAttendees = false, userId } = context;
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }
    try {
      const calendar = await getCalendarService(userId);
      if (!calendar) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      await calendar.events.delete({
        calendarId: 'primary',
        eventId,
        sendUpdates: notifyAttendees ? 'all' : 'none'
      });
      return { success: true, message: "Event deleted successfully" };
    } catch (error: any) {
      console.error('Failed to delete event:', error.response?.data || error.message || error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      const googleError = error.response?.data?.error?.message || errorMessage;
      return { success: false, message: `Failed to delete event: ${googleError}` };
    }
  },
});

export const updateCalendarEventTool = createTool({
  id: "update-calendar-event",
  description: "Update an existing event in Google Calendar.",
  inputSchema: z.object({
    eventId: z.string().describe("ID of the event to update"),
    summary: z.string().optional().describe("Updated event title"),
    start: z.string().optional().describe("Updated start time (RFC3339 format)"),
    end: z.string().optional().describe("Updated end time (RFC3339 format)"),
    location: z.string().optional().describe("Updated event location"),
    description: z.string().optional().describe("Updated event description"),
    attendees: z.array(z.string().email()).optional().describe("Updated list of attendee email addresses"),
    notifyAttendees: z.boolean().optional().default(false).describe("Whether to notify attendees of the update"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.object({
    success: z.boolean(),
    eventId: z.string().optional(),
    message: z.string()
  }),
  execute: async ({ context }) => {
    const {
      eventId,
      summary,
      start: rawStart,
      end: rawEnd,
      location,
      description,
      attendees,
      notifyAttendees = false,
      userId
    } = context;
    
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }
    try {
      const calendar = await getCalendarService(userId);
      if (!calendar) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      
      let isAllDay = false;
      try {
          const existingEvent = await calendar.events.get({ calendarId: 'primary', eventId });
          isAllDay = !!existingEvent.data.start?.date;
      } catch (getError) {
          console.error(`[updateCalendarEventTool] Failed to get existing event ${eventId} to check allDay status:`, getError);
      }

      const updateFields: any = {};
      if (summary !== undefined) updateFields.summary = summary;
      if (location !== undefined) updateFields.location = location;
      if (description !== undefined) updateFields.description = description;

      try {
          if (rawStart !== undefined) {
              if (isAllDay) {
                  updateFields.start = { date: new Date(rawStart).toISOString().split('T')[0] };
              } else {
                  const formattedStart = ensureRFC3339(rawStart);
                  if (!formattedStart) throw new Error("Invalid start date format for update.");
                  updateFields.start = { dateTime: formattedStart };
              }
          }
          if (rawEnd !== undefined) {
              if (isAllDay) {
                  updateFields.end = { date: new Date(rawEnd).toISOString().split('T')[0] };
                  if(updateFields.start?.date && new Date(updateFields.end.date) <= new Date(updateFields.start.date)) {
                      let tempEndDate = new Date(updateFields.start.date);
                      tempEndDate.setDate(tempEndDate.getDate() + 1);
                      updateFields.end.date = tempEndDate.toISOString().split('T')[0];
                  }
              } else {
                  const formattedEnd = ensureRFC3339(rawEnd);
                  if (!formattedEnd) throw new Error("Invalid end date format for update.");
                  updateFields.end = { dateTime: formattedEnd };
              }
          }
      } catch(e) {
          throw new Error("Invalid start or end date format provided for update. Use full ISO 8601 format.");
      }

      if (attendees !== undefined) {
        updateFields.attendees = attendees.map(email => ({ email }));
      }
      
      if (Object.keys(updateFields).length === 0) {
          return { success: true, eventId, message: "No fields provided to update." };
      }

      const response = await calendar.events.patch({
        calendarId: 'primary',
        eventId,
        requestBody: updateFields,
        sendUpdates: notifyAttendees ? 'all' : 'none'
      });
      
      return {
        success: true,
        eventId: response.data.id ?? undefined,
        message: "Event updated successfully"
      };
    } catch (error: any) {
      console.error('Failed to update event:', error.response?.data || error.message || error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      const googleError = error.response?.data?.error?.message || errorMessage;
      return {
        success: false,
        message: `Failed to update event: ${googleError}`
      };
    }
  }
});

export const getCalendarAvailabilityTool = createTool({
  id: "get-calendar-availability",
  description: "Find available time slots in the calendar.",
  inputSchema: z.object({
    startDate: z.string().describe("Start date/time to check from (RFC3339 format)"),
    endDate: z.string().describe("End date/time to check until (RFC3339 format)"),
    duration: z.number().min(1).describe("Desired duration of the free slot in minutes"),
    minStartHour: z.number().min(0).max(23).optional().default(9).describe("Minimum hour of day to consider (0-23)"),
    maxEndHour: z.number().min(0).max(23).optional().default(17).describe("Maximum hour of day to consider (0-23), exclusive"),
    userId: z.string().describe("The Telegram user ID for authentication")
  }),
  outputSchema: z.array(z.object({
    start: z.string(),
    end: z.string()
  })),
  execute: async ({ context }) => {
    const {
      startDate: rawStartDate,
      endDate: rawEndDate,
      duration,
      minStartHour = 9,
      maxEndHour = 17,
      userId
    } = context;
    
    if (!userId) {
      throw new Error("Authentication error: User ID is required.");
    }

    const startDate = ensureRFC3339(rawStartDate);
    const endDate = ensureRFC3339(rawEndDate);
    if (!startDate || !endDate) {
        throw new Error("Invalid start or end date format provided. Use full ISO 8601 format with timezone.");
    }
    if (new Date(endDate) <= new Date(startDate)) {
        throw new Error("End date must be after start date.");
    }

    try {
      const calendar = await getCalendarService(userId);
      if (!calendar) {
          throw new Error("Google Authentication required. Please use /connect_google.");
      }
      
      const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startDate,
        timeMax: endDate,
        singleEvents: true,
        orderBy: 'startTime'
      });
      
      const events = response.data.items || [];
      const busyTimes = events
        .map(event => {
          const startString = event.start?.dateTime || event.start?.date;
          const endString = event.end?.dateTime || event.end?.date;
          if (!startString || !endString) return null;
          return { start: new Date(startString), end: new Date(endString) };
        })
        .filter((slot): slot is { start: Date; end: Date } => slot !== null);
      
      const startDateTime = new Date(startDate);
      const endDateTime = new Date(endDate);
      const durationMs = duration * 60 * 1000; 
      
      const availableSlots: { start: string; end: string }[] = [];
      let currentTime = startDateTime;
      
      while (currentTime < endDateTime && availableSlots.length < 20) {
        const slotEndTime = new Date(currentTime.getTime() + durationMs);
        if (slotEndTime > endDateTime) break;

        const currentDayStart = new Date(currentTime); currentDayStart.setHours(minStartHour, 0, 0, 0);
        const currentDayEnd = new Date(currentTime); currentDayEnd.setHours(maxEndHour, 0, 0, 0);

        if (currentTime < currentDayStart || slotEndTime > currentDayEnd) {
            if (currentTime < currentDayStart) {
                currentTime = currentDayStart;
            } else {
                currentTime = new Date(currentDayStart); 
                currentTime.setDate(currentTime.getDate() + 1);
            }
            continue;
        }
        
        const isOverlapping = busyTimes.some(busySlot => {
          return (currentTime < busySlot.end && slotEndTime > busySlot.start);
        });
        
        if (!isOverlapping) {
          availableSlots.push({
            start: currentTime.toISOString(),
            end: slotEndTime.toISOString()
          });
          currentTime = new Date(currentTime.getTime() + 15 * 60 * 1000); 
        } else {
          let maxBusyEndTime = currentTime; 
          busyTimes.forEach(busySlot => {
              if (currentTime < busySlot.end && slotEndTime > busySlot.start) {
                  if (busySlot.end > maxBusyEndTime) {
                      maxBusyEndTime = busySlot.end;
                  }
              }
          });
          currentTime = maxBusyEndTime;
        }
      }
      
      return availableSlots.slice(0, 10);
    } catch (error: any) {
      console.error('Failed to find available slots:', error.response?.data || error.message || error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Authentication required")) throw error;
      const googleError = error.response?.data?.error?.message || errorMessage;
      throw new Error(`Failed to find available slots: ${googleError}`);
    }
  }
}); 