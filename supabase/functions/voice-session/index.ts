import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateSessionId(): string {
  return "pipe_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { book_id, book_title, author, chapter_number, chapter_title, oneliner, sections } = await req.json();

    const authHeader = req.headers.get("authorization") || "";
    const jwt = authHeader.replace("Bearer ", "");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const [{ data: settings }, { data: { user } }] = await Promise.all([
      supabase.from("platform_settings").select("key, value")
        .in("key", ["gemini_api_key", "voice_narration_prompt", "voice_answering_prompt"]),
      supabase.auth.getUser(jwt),
    ])

    const map: Record<string, string> = {};
    (settings || []).forEach((r: any) => { map[r.key] = r.value; });

    if (!map.gemini_api_key) throw new Error("Gemini API key not configured in Admin → Agents.");

    const sessionId = generateSessionId();

    // Fill prompt placeholders
    const narrationPrompt = (map.voice_narration_prompt || "")
      .replace(/{book_title}/g, book_title || "")
      .replace(/{author}/g, author || "")
      .replace(/{chapter_title}/g, chapter_title || "")
      .replace(/{oneliner}/g, oneliner || "");

    const answeringPrompt = (map.voice_answering_prompt || "")
      .replace(/{book_title}/g, book_title || "")
      .replace(/{author}/g, author || "")
      .replace(/{chapter_title}/g, chapter_title || "");

    // Create voice_progress record
    if (user && sections?.length > 0) {
      await supabase.from("voice_progress").insert({
        session_id: sessionId,
        user_id: user.id,
        book_id,
        chapter_number: parseInt(chapter_number),
        total_sections: sections.length,
        completed_sections: [],
      }).onConflict("session_id").ignore();
    }

    return new Response(
      JSON.stringify({
        geminiApiKey: map.gemini_api_key,
        narrationPrompt,
        answeringPrompt,
        sections: sections || [],
        sessionId,
        totalSections: sections?.length || 0,
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
