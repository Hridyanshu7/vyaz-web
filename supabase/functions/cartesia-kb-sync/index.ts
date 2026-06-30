import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CARTESIA_VERSION = "2026-03-01";

async function cartesia(apiKey: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.cartesia.ai${path}`, {
    method,
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Cartesia-Version": CARTESIA_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Cartesia ${method} ${path} failed: ${JSON.stringify(data)}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { bookId } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Fetch settings + book
    const [{ data: settings }, { data: book }] = await Promise.all([
      supabase.from("platform_settings").select("key, value").in("key", ["cartesia_api_key", "cartesia_agent_id"]),
      supabase.from("books").select("id, title, author, chapters, cartesia_folder_id").eq("id", bookId).single(),
    ]);

    const map: Record<string, string> = {};
    (settings || []).forEach((r: any) => { map[r.key] = r.value; });

    if (!map.cartesia_api_key) throw new Error("Cartesia API key not configured.");
    if (!map.cartesia_agent_id) throw new Error("Cartesia Agent ID not configured.");
    if (!book) throw new Error("Book not found.");

    const chapters: any[] = book.chapters || [];
    if (chapters.length === 0) throw new Error("No chapters to sync. Upload an EPUB first.");

    const apiKey = map.cartesia_api_key;
    const agentId = map.cartesia_agent_id;

    // 1. Get or create folder for this book
    let folderId = book.cartesia_folder_id;
    if (!folderId) {
      const folder = await cartesia(apiKey, "POST", "/agents/folders", {
        name: `${book.title} — Vyaz`,
      });
      folderId = folder.id;

      // Attach folder to agent
      await cartesia(apiKey, "PATCH", `/agents/folders/${folderId}`, {
        agent_ids: [agentId],
      });

      await supabase.from("books").update({ cartesia_folder_id: folderId }).eq("id", bookId);
    }

    // 2. Upload each chapter as a document
    const results: { number: number; success: boolean; error?: string }[] = [];
    const updatedChapters = [...chapters];

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      if (!ch.content) {
        results.push({ number: ch.number, success: false, error: "No content" });
        continue;
      }

      try {
        // Delete existing document if re-syncing
        if (ch.cartesia_document_id) {
          try {
            await cartesia(apiKey, "DELETE", `/agents/documents/${ch.cartesia_document_id}`);
          } catch { /* ignore if already deleted */ }
        }

        const doc = await cartesia(apiKey, "POST", "/agents/documents", {
          folder_id: folderId,
          name: `Ch ${ch.number}: ${ch.title}`,
          content: ch.content,
          metadata: {
            book_id: bookId,
            chapter_number: String(ch.number),
            chapter_title: ch.title,
          },
        });

        updatedChapters[i] = { ...ch, cartesia_document_id: doc.id };
        results.push({ number: ch.number, success: true });
      } catch (err: any) {
        results.push({ number: ch.number, success: false, error: err.message });
      }
    }

    // 3. Save updated chapters (with document IDs) back to Supabase
    await supabase.from("books").update({ chapters: updatedChapters }).eq("id", bookId);

    const synced = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return new Response(
      JSON.stringify({ success: true, synced, failed, folderId, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
