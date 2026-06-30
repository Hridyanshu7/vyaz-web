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

    // Get or create folder for this book
    let folderId = book.cartesia_folder_id;
    if (!folderId) {
      const folder = await cartesia(apiKey, "POST", "/agents/folders", {
        name: `${book.title} — Vyaz`,
        agents: [{ id: agentId }],
      });
      folderId = folder.id;
      await supabase.from("books").update({ cartesia_folder_id: folderId }).eq("id", bookId);
    }

    const results: { chapter: number; section?: number; success: boolean; error?: string }[] = [];
    const updatedChapters = JSON.parse(JSON.stringify(chapters));

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const sections: any[] = ch.sections || [];

      // If chapter has sections, sync each section as a separate document
      if (sections.length > 0) {
        for (let s = 0; s < sections.length; s++) {
          const sec = sections[s];
          try {
            // Delete old doc if re-syncing
            if (sec.cartesia_document_id) {
              try { await cartesia(apiKey, "DELETE", `/agents/documents/${sec.cartesia_document_id}`); } catch { /* ignore */ }
            }

            const doc = await cartesia(apiKey, "POST", "/agents/documents", {
              folder_id: folderId,
              name: `${book.title} — Ch ${ch.number}: ${ch.title} — Section ${sec.number}`,
              content: sec.text,
              metadata: {
                book_id: bookId,
                chapter_number: String(ch.number),
                chapter_title: ch.title,
                section_number: String(sec.number),
              },
            });

            updatedChapters[i].sections[s] = { ...sec, cartesia_document_id: doc.id };
            results.push({ chapter: ch.number, section: sec.number, success: true });
          } catch (err: any) {
            results.push({ chapter: ch.number, section: sec.number, success: false, error: err.message });
          }
        }

        // Also delete old whole-chapter doc if exists (replaced by sections)
        if (ch.cartesia_document_id) {
          try { await cartesia(apiKey, "DELETE", `/agents/documents/${ch.cartesia_document_id}`); } catch { /* ignore */ }
          updatedChapters[i].cartesia_document_id = null;
        }

      } else if (ch.content) {
        // No sections — sync whole chapter as one document
        try {
          if (ch.cartesia_document_id) {
            try { await cartesia(apiKey, "DELETE", `/agents/documents/${ch.cartesia_document_id}`); } catch { /* ignore */ }
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
          updatedChapters[i] = { ...updatedChapters[i], cartesia_document_id: doc.id };
          results.push({ chapter: ch.number, success: true });
        } catch (err: any) {
          results.push({ chapter: ch.number, success: false, error: err.message });
        }
      }
    }

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
