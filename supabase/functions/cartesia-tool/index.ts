import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    console.log("[cartesia-tool] Received:", JSON.stringify(body));

    // Cartesia sends tool call with args at different paths depending on version
    const toolName = body.tool_name || body.tool?.name || body.name;
    const args = body.arguments || body.args || {};

    if (toolName !== "mark_section_complete") {
      return new Response(
        JSON.stringify({ result: `Unknown tool: ${toolName}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { session_id, section_number } = args;

    if (!session_id || section_number === undefined) {
      return new Response(
        JSON.stringify({ result: "Missing session_id or section_number" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Add section_number to completed_sections array (avoid duplicates)
    const { data: existing } = await supabase
      .from("voice_progress")
      .select("completed_sections, total_sections")
      .eq("session_id", session_id)
      .single();

    if (!existing) {
      return new Response(
        JSON.stringify({ result: "Session not found" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const completed = existing.completed_sections || [];
    if (!completed.includes(section_number)) {
      completed.push(section_number);
      completed.sort((a: number, b: number) => a - b);
    }

    await supabase
      .from("voice_progress")
      .update({
        completed_sections: completed,
        updated_at: new Date().toISOString(),
      })
      .eq("session_id", session_id);

    const remaining = existing.total_sections - completed.length;
    const result = remaining > 0
      ? `Section ${section_number} marked complete. ${completed.length} of ${existing.total_sections} sections done. ${remaining} remaining.`
      : `Section ${section_number} marked complete. All ${existing.total_sections} sections covered!`;

    return new Response(
      JSON.stringify({ result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[cartesia-tool] Error:", err.message);
    return new Response(
      JSON.stringify({ result: `Error: ${err.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
