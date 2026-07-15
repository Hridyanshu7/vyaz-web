import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Triggered by a Supabase Database Webhook on auth.users INSERT (not profiles — at the
// instant of signup `profiles` only has {id, phone} from handle_new_user(); auth.users
// always has the real email + OAuth name/avatar in raw_user_meta_data).
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const payload = await req.json();
    const user = payload.record;
    if (!user) throw new Error("No user record in webhook payload.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: settings } = await supabase
      .from("platform_settings")
      .select("key, value")
      .in("key", ["resend_api_key", "notify_signup_email"]);
    const map: Record<string, string> = {};
    (settings || []).forEach((r: any) => { map[r.key] = r.value; });

    if (!map.resend_api_key || !map.notify_signup_email) {
      // Not configured yet — no-op rather than error, so an unconfigured webhook
      // doesn't spam retries or block anything.
      return new Response(JSON.stringify({ skipped: "notify not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const meta = user.raw_user_meta_data || {};
    const name = meta.full_name || meta.name || "(no name)";
    const provider = user.app_metadata?.provider || "email";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${map.resend_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Vyaz <onboarding@resend.dev>",
        to: map.notify_signup_email,
        subject: `New Vyaz signup: ${name}`,
        html: `
          <p><strong>New user signed up.</strong></p>
          <ul>
            <li>Name: ${name}</li>
            <li>Email: ${user.email || "-"}</li>
            <li>Phone: ${user.phone || "-"}</li>
            <li>Provider: ${provider}</li>
            <li>Signed up: ${user.created_at}</li>
          </ul>
        `,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Resend API failed: ${res.status} ${errText}`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("[notify-signup] Error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
