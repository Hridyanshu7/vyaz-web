import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateSessionId(): string {
  return "sess_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { book_id, book_title, author, chapter_title, chapter_number, oneliner } = await req.json();

    // Extract user from JWT
    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get user from JWT
    const { data: { user } } = await supabase.auth.getUser(jwt);

    // Fetch settings + book chapters (to get sections count)
    const [{ data: settings }, { data: book }] = await Promise.all([
      supabase.from("platform_settings").select("key, value")
        .in("key", ["cartesia_api_key", "cartesia_agent_id", "voice_agent_system_prompt"]),
      supabase.from("books").select("chapters").eq("id", book_id).single(),
    ]);

    const map: Record<string, string> = {};
    (settings || []).forEach((r: any) => { map[r.key] = r.value; });

    if (!map.cartesia_api_key) throw new Error("Cartesia API key not configured in Admin settings.");
    if (!map.cartesia_agent_id) throw new Error("Cartesia Agent ID not configured in Admin settings.");

    // Find this chapter's sections
    const chapters: any[] = book?.chapters || [];
    const chapter = chapters.find((ch: any) => String(ch.number) === String(chapter_number));
    const sections: any[] = chapter?.sections || [];
    const totalSections = sections.length;

    // Generate session ID and create progress record
    const sessionId = generateSessionId();

    if (user && totalSections > 0) {
      await supabase.from("voice_progress").insert({
        session_id: sessionId,
        user_id: user.id,
        book_id,
        chapter_number: parseInt(chapter_number),
        total_sections: totalSections,
        completed_sections: [],
      });
    }

    // Section navigation instruction appended to system prompt
    const sectionInstruction = totalSections > 0
      ? `

## Session & Section Navigation
Your session ID is: ${sessionId}
This chapter has ${totalSections} sections in the knowledge base.

Follow this order for each section:
1. Use the knowledge_base tool to retrieve section content — search for chapter "${chapter_title}" with filters: book_id="${book_id}", chapter_number="${chapter_number}", section_number="N" (starting at 1)
2. Narrate the section in 2–4 sentence chunks, pausing briefly to check in after each chunk as instructed above
3. Once you have finished narrating the full section, silently call the mark_section_complete tool with session_id="${sessionId}" and section_number=N — do NOT announce this to the listener
4. Immediately retrieve and begin narrating section N+1 without asking permission or announcing the transition
5. Continue until all ${totalSections} sections are narrated

The listener can interrupt at any time by speaking. Begin by retrieving and narrating section 1.`
      : `

## Chapter Content
Use the knowledge_base tool to retrieve content for chapter "${chapter_title}" (book_id="${book_id}", chapter_number="${chapter_number}") before narrating.`;

    // Fill system prompt placeholders
    const systemPrompt = (map.voice_agent_system_prompt || "")
      .replace(/{book_title}/g, book_title || "")
      .replace(/{author}/g, author || "")
      .replace(/{chapter_title}/g, chapter_title || "")
      .replace(/{oneliner}/g, oneliner || "")
      .replace(/{content}/g, "")
      + sectionInstruction;

    // Exchange API key for short-lived access token
    const tokenRes = await fetch("https://api.cartesia.ai/access-token", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${map.cartesia_api_key}`,
        "Cartesia-Version": "2026-03-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ grants: { agent: true }, expires_in: 3600 }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenData.token) throw new Error(`Cartesia token error: ${JSON.stringify(tokenData)}`);

    return new Response(
      JSON.stringify({
        accessToken: tokenData.token,
        agentId: map.cartesia_agent_id,
        systemPrompt,
        sessionId,
        totalSections,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
