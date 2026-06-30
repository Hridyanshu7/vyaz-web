import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID")!;
const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

// --- Action: exchange-token ---
async function exchangeToken(code: string, redirectUri: string, userId: string) {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  const tokens = await res.json();

  const { error } = await supabase
    .from("profiles")
    .update({
      gcal_connected: true,
      gcal_refresh_token: tokens.refresh_token,
    })
    .eq("id", userId);

  if (error) throw new Error(`DB update failed: ${error.message}`);

  return { success: true };
}

// --- Action: create-event ---
async function createEvent(sessionId: string) {
  const { data: session, error: sessErr } = await supabase
    .from("sessions")
    .select(`
      *,
      book:books(title, author),
      narrator:profiles!sessions_narrator_id_fkey(name, email, gcal_refresh_token, gcal_connected)
    `)
    .eq("id", sessionId)
    .single();

  if (sessErr || !session) throw new Error(`Session not found: ${sessErr?.message}`);

  const { data: attendees } = await supabase
    .from("session_attendees")
    .select("reader:profiles!session_attendees_reader_id_fkey(name, email, gcal_connected)")
    .eq("session_id", sessionId)
    .eq("status", "registered");

  if (!session.narrator?.gcal_connected || !session.narrator?.gcal_refresh_token) {
    throw new Error("Narrator has not connected Google Calendar");
  }

  const accessToken = await refreshAccessToken(session.narrator.gcal_refresh_token);

  const startTime = new Date(session.scheduled_at);
  const endTime = new Date(startTime.getTime() + session.duration_minutes * 60000);

  const isGroup = session.type === "group";
  const attendeeEmails = (attendees || [])
    .map((a: any) => a.reader?.email)
    .filter(Boolean)
    .map((email: string) => ({ email }));

  const event = {
    summary: `Vyaz: ${session.book?.title}${session.chapter_title ? ` — ${session.chapter_title}` : ''}${isGroup ? " (Group)" : ""}`,
    description: [
      `Book: ${session.book?.title} by ${session.book?.author}`,
      `Narrator: ${session.narrator?.name}`,
      isGroup ? `Attendees: ${(attendees || []).length}/${session.max_attendees}` : "",
      session.description || "",
    ].filter(Boolean).join("\n"),
    start: { dateTime: startTime.toISOString() },
    end: { dateTime: endTime.toISOString() },
    attendees: attendeeEmails,
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: "email", minutes: 60 },
        { method: "popup", minutes: 30 },
        { method: "popup", minutes: 10 },
      ],
    },
  };

  const calRes = await fetch(
    `${GOOGLE_CALENDAR_API}/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(event),
    }
  );

  if (!calRes.ok) throw new Error(`Calendar event creation failed: ${await calRes.text()}`);

  const calEvent = await calRes.json();
  const meetLink = calEvent.conferenceData?.entryPoints?.find(
    (e: any) => e.entryPointType === "video"
  )?.uri || calEvent.hangoutLink || "";

  await supabase
    .from("sessions")
    .update({
      meeting_link: meetLink,
      google_calendar_event_id: calEvent.id,
    })
    .eq("id", sessionId);

  return { meetingLink: meetLink, eventId: calEvent.id };
}

// --- Action: get-availability ---
async function getAvailability(narratorId: string, startDate: string, endDate: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("gcal_refresh_token, gcal_connected")
    .eq("id", narratorId)
    .single();

  if (!profile?.gcal_connected || !profile?.gcal_refresh_token) {
    return { busySlots: [] };
  }

  const accessToken = await refreshAccessToken(profile.gcal_refresh_token);

  const res = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: startDate,
      timeMax: endDate,
      items: [{ id: "primary" }],
    }),
  });

  if (!res.ok) throw new Error(`FreeBusy query failed: ${await res.text()}`);

  const data = await res.json();
  const busySlots = data.calendars?.primary?.busy || [];

  return { busySlots };
}

// --- Main handler ---
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) throw new Error("Missing authorization header");

    // Verify the user's JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await createClient(
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY")!
    ).auth.getUser(token);

    if (authErr || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { action } = body;
    let result;

    switch (action) {
      case "exchange-token":
        result = await exchangeToken(body.code, body.redirectUri, user.id);
        break;
      case "create-event":
        result = await createEvent(body.sessionId);
        break;
      case "get-availability":
        result = await getAvailability(body.narratorId, body.startDate, body.endDate);
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
