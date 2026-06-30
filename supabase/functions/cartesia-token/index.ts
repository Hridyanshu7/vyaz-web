import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { book_title, author, chapter_title, oneliner, content } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch all Cartesia settings server-side
    const { data: settings } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["cartesia_api_key", "cartesia_agent_id", "voice_agent_system_prompt"]);

    const map: Record<string, string> = {};
    (settings || []).forEach((r: any) => { map[r.key] = r.value; });

    if (!map.cartesia_api_key) throw new Error("Cartesia API key not configured in Admin settings.");
    if (!map.cartesia_agent_id) throw new Error("Cartesia Agent ID not configured in Admin settings.");

    // Fill system prompt placeholders with chapter data
    const systemPrompt = (map.voice_agent_system_prompt || "")
      .replace(/{book_title}/g, book_title || "")
      .replace(/{author}/g, author || "")
      .replace(/{chapter_title}/g, chapter_title || "")
      .replace(/{oneliner}/g, oneliner || "")
      .replace(/{content}/g, content || "");

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
