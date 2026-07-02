import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Fetch settings
    const { data: settings } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", [
        "gemini_api_key",
        "voice_narration_prompt",
        "voice_answering_prompt",
        "pipeline_stt_model",
        "pipeline_llm_model",
        "pipeline_tts_model",
        "pipeline_tts_voice",
        "live_system_prompt",
        "live_model",
        "live_voice",
      ])

    const map: Record<string, string> = {};
    (settings || []).forEach((r: any) => { map[r.key] = r.value; });

    if (!map.gemini_api_key) throw new Error("Gemini API key not configured in Admin → Agents → Gemini → Secrets.");

    // Get user (optional — for progress tracking)
    let userId: string | null = null;
    try {
      const { data: authData } = await supabase.auth.getUser(jwt);
      userId = authData?.user?.id || null;
    } catch { /* proceed without user */ }

    const sessionId = "pipe_" + crypto.randomUUID().replace(/-/g, "").slice(0, 16);

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

    // Gemini Live: single conversational agent grounded in the full chapter.
    const fullChapterContent = (sections || []).map((s: any) => s.text).join("\n\n");
    const defaultLivePrompt =
      "You are an engaging narrator for \"{book_title}\" by {author}, chapter \"{chapter_title}\". " +
      "Read the chapter aloud VERBATIM — speak the actual sentences of the text below word-for-word, " +
      "in order. Do NOT summarize, paraphrase, condense, reorder, or skip any content.\n\n" +
      "CRITICAL MARKING RULE: Everything you say that is NOT the book's exact words — any remark, " +
      "observation, opinion, question, check-in, or answer to the listener — MUST be wrapped in double " +
      "parentheses, like ((this is my own aside)). Text outside double parentheses must be the book's " +
      "exact words, nothing else. The double parentheses are silent markers; do not read them aloud.\n\n" +
      "Read a few paragraphs at a time, then pause and ask ((Shall I continue?)) and wait. " +
      "If the listener asks a question, answer it wrapped entirely in double parentheses (it is not book " +
      "text): for questions about the book, ground your answer in the chapter; for general questions " +
      "(word meanings, definitions, pronunciation, background concepts) use your own knowledge freely. " +
      "Never invent facts about the book itself.\n\nCHAPTER:\n{content}";
    const liveSystemPrompt = (map.live_system_prompt || defaultLivePrompt)
      .replace(/{book_title}/g, book_title || "")
      .replace(/{author}/g, author || "")
      .replace(/{chapter_title}/g, chapter_title || "")
      .replace(/{oneliner}/g, oneliner || "")
      .replace(/{content}/g, fullChapterContent);

    // Create voice_progress record
    if (userId && sections?.length > 0) {
      await supabase.from("voice_progress").upsert({
        session_id: sessionId,
        user_id: userId,
        book_id,
        chapter_number: parseInt(String(chapter_number)),
        total_sections: sections.length,
        completed_sections: [],
      }, { onConflict: "session_id" });
    }

    return new Response(
      JSON.stringify({
        geminiApiKey: map.gemini_api_key,
        narrationPrompt,
        answeringPrompt,
        sttModel: map.pipeline_stt_model || "gemini-2.5-flash",
        llmModel: map.pipeline_llm_model || "gemini-2.5-flash",
        ttsModel: map.pipeline_tts_model || "gemini-2.5-flash-preview-tts",
        ttsVoice: map.pipeline_tts_voice || "Charon",
        liveSystemPrompt,
        liveModel: map.live_model || "gemini-3.1-flash-live-preview",
        liveVoice: map.live_voice || "Charon",
        sections: sections || [],
        sessionId,
        totalSections: sections?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[voice-session] Error:", err.message);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
