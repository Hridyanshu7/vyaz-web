import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CARTESIA_VERSION = "2026-03-01";

async function cartesia(apiKey: string, method: string, path: string) {
  const res = await fetch(`https://api.cartesia.ai${path}`, {
    method,
    headers: { "Authorization": `Bearer ${apiKey}`, "Cartesia-Version": CARTESIA_VERSION },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Cartesia ${method} ${path} failed: ${res.status}`);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { bookId } = await req.json();
    if (!bookId) throw new Error("bookId is required.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ── Verify caller is an admin ────────────────────────────────────────────
    const jwt = (req.headers.get("authorization") || "").replace("Bearer ", "");
    const { data: authData } = await supabase.auth.getUser(jwt);
    const userId = authData?.user?.id;
    if (!userId) throw new Error("Unauthorized.");
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", userId).single();
    if (!profile?.is_admin) throw new Error("Admin access required.");

    // ── Load book + Cartesia key ─────────────────────────────────────────────
    const [{ data: book }, { data: settings }] = await Promise.all([
      supabase.from("books").select("id, title, chapters, cartesia_folder_id").eq("id", bookId).single(),
      supabase.from("platform_settings").select("key, value").in("key", ["cartesia_api_key"]),
    ]);
    if (!book) throw new Error("Book not found.");
    const cartesiaKey = (settings || []).find((s: any) => s.key === "cartesia_api_key")?.value;

    // ── De-sync Cartesia (best-effort; never blocks the DB delete) ───────────
    const cartesiaWarnings: string[] = [];
    if (cartesiaKey) {
      for (const ch of (book.chapters || [])) {
        for (const sec of (ch.sections || [])) {
          if (sec.cartesia_document_id) {
            try { await cartesia(cartesiaKey, "DELETE", `/agents/documents/${sec.cartesia_document_id}`); }
            catch (e: any) { cartesiaWarnings.push(e.message); }
          }
        }
        if (ch.cartesia_document_id) {
          try { await cartesia(cartesiaKey, "DELETE", `/agents/documents/${ch.cartesia_document_id}`); }
          catch (e: any) { cartesiaWarnings.push(e.message); }
        }
      }
      if (book.cartesia_folder_id) {
        try { await cartesia(cartesiaKey, "DELETE", `/agents/folders/${book.cartesia_folder_id}`); }
        catch (e: any) { cartesiaWarnings.push(e.message); }
      }
    }

    // ── Delete dependent rows that don't cascade, then the book ──────────────
    // sessions / session_requests / narrator_books / bookings cascade via FK.
    // voice_progress was created in the dashboard and may lack a cascade FK.
    await supabase.from("voice_progress").delete().eq("book_id", bookId);

    const { error: delErr } = await supabase.from("books").delete().eq("id", bookId);
    if (delErr) throw new Error(`Failed to delete book row: ${delErr.message}`);

    return new Response(
      JSON.stringify({ success: true, cartesiaWarnings }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
