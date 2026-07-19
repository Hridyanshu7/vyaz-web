import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { GoogleGenAI } from "https://esm.sh/@google/genai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { book_id, book_title, author, chapter_number, chapter_title, oneliner, sections, mode, bookContent, listener_name } = await req.json();

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
        "live_gist_prompt",
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
      "Never invent facts about the book itself.\n\n" +
      "CRITICAL: never invent, imagine, or generate ANY sentence, example, code, or content that is " +
      "not literally present in the chapter text below — not even if you recognize the book from your " +
      "training, not even to fill a pause or answer a question you don't have real chapter text for. " +
      "If you reach the end of the provided text, or the listener asks you to continue past it, say " +
      "((That's the end of this chapter.)) and stop talking entirely — do not keep generating anything " +
      "else. If you are ever unsure whether real chapter text remains, treat it as the end and say that " +
      "line; never guess or fabricate rather than stop.\n\n" +
      "The listener may ask you to go back, repeat, skip ahead, or stop — this is a hands-free voice " +
      "session, so handle these as tool calls, not by talking about them. For a specific count " +
      "(\"go back two sentences\", \"skip ahead a paragraph\"), call seek_by_count. For a " +
      "content-described target (\"go back to where they meet the investor\"), call seek_to_text with " +
      "the EXACT verbatim quote from the chapter text below — not a paraphrase, the actual words, so " +
      "the right spot can be found precisely. If the listener wants to end the session (\"that's enough " +
      "for now\", \"let's stop here\"), call end_session. IMPORTANT: ordinary acknowledgments like " +
      "\"continue\", \"yes\", \"go on\", \"keep going\", or answering your own ((Shall I continue?)) " +
      "check-in, are NOT seek requests — never call a tool for these, just carry on reading normally. " +
      "After any tool call, continue naturally — the tool result tells you where you are; do not " +
      "narrate the jump itself.\n\nCHAPTER:\n{content}";
    const liveSystemPrompt = (map.live_system_prompt || defaultLivePrompt)
      .replace(/{book_title}/g, book_title || "")
      .replace(/{author}/g, author || "")
      .replace(/{chapter_title}/g, chapter_title || "")
      .replace(/{oneliner}/g, oneliner || "")
      .replace(/{listener_name}/g, listener_name || "")
      .replace(/{content}/g, fullChapterContent);

    // ── Gist mode: a reliable WHOLE-BOOK spoken summary (separate prompt), same voice UX.
    // Not verbatim → no word-alignment progress (finalSections = []). The whole-book text is
    // sent by the client (already in its store); contextWindowCompression (client) helps long books.
    let finalLivePrompt = liveSystemPrompt;
    let finalSections = sections || [];
    if (mode === "gist") {
      // Whole-book content comes from the client (already loaded in its store) — no
      // server-side blob fetch, so concurrent gist requests don't amplify heavy DB reads.
      const defaultGistPrompt =
        "You are a knowledgeable, faithful guide to the whole book \"{book_title}\" by {author}. " +
        "The full text of the book is provided below. Give a clear, reliable, well-structured spoken summary of the ENTIRE book — " +
        "open with its core thesis, then walk through the key ideas in order, chapter by chapter, in an engaging conversational tone. " +
        "Ground EVERYTHING strictly in the text below; never invent facts, names, or claims — if something isn't in the text, say so. " +
        "Cover a chapter at a time, then pause and invite the listener to ask questions, and answer them from the book. " +
        "This is a summary, not a verbatim reading — you may paraphrase faithfully.\n\nBOOK:\n{content}";
      finalLivePrompt = (map.live_gist_prompt || defaultGistPrompt)
        .replace(/{book_title}/g, book_title || "")
        .replace(/{author}/g, author || "")
        .replace(/{listener_name}/g, listener_name || "")
        .replace(/{content}/g, bookContent || "");
      finalSections = [];
    }

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

    // Mint a short-lived EPHEMERAL token so the browser never receives the real API key.
    // uses/expiry are generous enough to cover the initial session + session-resumption
    // reconnects (A11) within one chapter. Falls back to the raw key ONLY if minting fails,
    // so Talk always works (the client picks v1alpha+access_token vs v1beta+key accordingly).
    let ephemeralToken: string | null = null;
    try {
      const genai = new GoogleGenAI({ apiKey: map.gemini_api_key });
      const now = Date.now();
      const tok: any = await genai.authTokens.create({
        config: {
          uses: 5, // initial session + a few resumption reconnects
          expireTime: new Date(now + 30 * 60 * 1000).toISOString(),           // 30 min of connection life
          newSessionExpireTime: new Date(now + 25 * 60 * 1000).toISOString(),  // 25 min window to (re)start sessions
        },
      });
      ephemeralToken = tok?.name || null;
    } catch (e: any) {
      console.error("[voice-session] ephemeral token mint failed; falling back to raw key:", e?.message);
    }

    return new Response(
      JSON.stringify({
        ephemeralToken,
        // The raw key is returned ONLY if token minting failed (graceful fallback so Talk
        // still works); normally null — the browser gets the ephemeral token, never the key.
        geminiApiKey: ephemeralToken ? null : map.gemini_api_key,
        narrationPrompt,
        answeringPrompt,
        sttModel: map.pipeline_stt_model || "gemini-2.5-flash",
        llmModel: map.pipeline_llm_model || "gemini-2.5-flash",
        ttsModel: map.pipeline_tts_model || "gemini-2.5-flash-preview-tts",
        ttsVoice: map.pipeline_tts_voice || "Charon",
        liveSystemPrompt: finalLivePrompt,
        liveModel: map.live_model || "gemini-3.1-flash-live-preview",
        liveVoice: map.live_voice || "Charon",
        sections: finalSections,
        sessionId,
        totalSections: finalSections.length,
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
