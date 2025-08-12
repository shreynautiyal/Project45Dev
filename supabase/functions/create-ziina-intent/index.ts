import "jsr:@supabase/functions-js/edge-runtime.d.ts";

type PlanKey = "pro" | "elite";
const PRICES_AED: Record<PlanKey, number> = { pro: 22, elite: 110 };
const ZIINA_API = "https://api-v2.ziina.com/api";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const token = Deno.env.get("ZIINA_ACCESS_TOKEN");
  const FRONTEND_URL = Deno.env.get("FRONTEND_URL") ?? "http://localhost:5173";
  if (!token) {
    return new Response("Missing ZIINA_ACCESS_TOKEN", { status: 500, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  // Fetch payment intent by ID
  if (req.method === "GET" && id) {
    const r = await fetch(`${ZIINA_API}/payment_intent/${id}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const { plan, userId } = (await req.json()) as { plan: PlanKey; userId?: string };
    if (!plan || !(plan in PRICES_AED)) {
      return new Response("Invalid plan", { status: 400, headers: corsHeaders });
    }

    // amounts are in fils (integer)
    const amount = PRICES_AED[plan] * 100;

    const body = {
      amount,
      currency: "AED",                  // <-- FIX
      description: `Project 45 – ${plan.toUpperCase()} plan`, // <-- FIX
      success_url: `${FRONTEND_URL}/billing?status=success&plan=${plan}&pi={PAYMENT_INTENT_ID}`,
      cancel_url: `${FRONTEND_URL}/upgrade?status=cancelled&pi={PAYMENT_INTENT_ID}`,
      metadata: { userId, plan },
      test: true, // set false when going live
    };

    const r = await fetch(`${ZIINA_API}/payment_intent`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await r.text();

    // Forward Ziina's actual status + body to the client (much easier to debug)
    if (!r.ok) {
      console.error("[Ziina /payment_intent error]", r.status, text);
      return new Response(text, {
        status: r.status, // <-- don't rewrap as 502
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = JSON.parse(text) as { redirect_url: string; id: string };
    return new Response(JSON.stringify({ url: data.redirect_url, id: data.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[create-ziina-intent] Bad request:", e);
    return new Response(`Bad request: ${e}`, { status: 400, headers: corsHeaders });
  }
});
