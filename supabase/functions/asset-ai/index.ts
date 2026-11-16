// Fixnar — asset-ai edge function
// Uses Claude (Anthropic API) to: identify equipment from a photo, look up technical specs,
// and estimate the current market price in AED.
// Secret in Supabase → Edge Functions → Secrets: OPENROUTER_API_KEY (free models) or ANTHROPIC_API_KEY
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const USD_TO_AED = 3.6725;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const CATEGORIES = ["Kitchen Equipment", "Refrigeration", "HVAC", "Electrical", "Plumbing", "Office Equipment",
  "Furniture & Fittings", "Operational Equipment", "Fire & Safety", "IT & POS", "Vehicles", "Other"];

const SYSTEM = `You are a senior facilities/maintenance engineer for restaurant (F&B) and retail sites in the UAE.
You know commercial kitchen, refrigeration, HVAC, electrical and plumbing equipment, their brands and models.
Always answer with ONE JSON object only — no prose, no markdown fences. Use null for anything unknown; never invent serial numbers.`;

// Provider: OpenRouter (free models) when OPENROUTER_API_KEY is set, otherwise Claude (ANTHROPIC_API_KEY)
async function askClaude(content: any[], useSearch: boolean) {
  if (Deno.env.get("OPENROUTER_API_KEY")) return askOpenRouter(content, useSearch);
  return askAnthropic(content, useSearch);
}

function parseJson(text: string) {
  const start = text.indexOf("{"), end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("The AI did not return a usable answer. Try again.");
  return JSON.parse(text.slice(start, end + 1));
}

async function askOpenRouter(content: any[], useSearch: boolean) {
  const key = Deno.env.get("OPENROUTER_API_KEY")!;
  // Free Models Router picks an available free model that supports what the request needs (e.g. images)
  const model = Deno.env.get("OPENROUTER_MODEL") ?? "openrouter/free";
  const webOn = useSearch && Deno.env.get("OPENROUTER_WEB") === "on";   // web search costs credits (or Firecrawl credits)
  const msg = content.map((c) => c.type === "image"
    ? { type: "image_url", image_url: { url: `data:${c.source.media_type};base64,${c.source.data}` } }
    : { type: "text", text: c.text });
  const body: Record<string, unknown> = {
    model, max_tokens: 2000,
    messages: [{ role: "system", content: SYSTEM }, { role: "user", content: msg }],
  };
  if (webOn) body.plugins = [{ id: "web", max_results: 5 }];
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {         // free models get busy: retry
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json",
        "HTTP-Referer": "https://fixnar.vercel.app", "X-Title": "Fixnar" },
      body: JSON.stringify(body),
    });
    if (res.status === 429) {
      lastErr = "Free AI limit reached for today (50 requests/day). Try tomorrow, or add $10 credit on OpenRouter for 1,000/day.";
      const t = await res.text();
      if (/per-day|daily|free-models-per-day/i.test(t)) break;
      await new Promise((r) => setTimeout(r, 2500)); continue;
    }
    if (!res.ok) { lastErr = `AI service error ${res.status}: ${(await res.text()).slice(0, 300)}`; if (res.status < 500) break; continue; }
    const data = await res.json();
    const m = data.choices?.[0]?.message;
    const text = typeof m?.content === "string" ? m.content : (m?.content ?? []).map((x: any) => x.text ?? "").join("\n");
    const urls = (m?.annotations ?? []).map((a: any) => a?.url_citation?.url).filter(Boolean);
    try {
      return { result: parseJson(text), searched: webOn, urls: [...new Set(urls)].slice(0, 8) as string[] };
    } catch (e) { lastErr = (e as Error).message; }
  }
  throw new Error(lastErr || "AI request failed");
}

async function askAnthropic(content: unknown[], useSearch: boolean) {
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) throw new Error("No AI key set. Add OPENROUTER_API_KEY (free) or ANTHROPIC_API_KEY in Supabase Edge Function secrets.");
  const body: Record<string, unknown> = {
    model: MODEL, max_tokens: 2000, system: SYSTEM,
    messages: [{ role: "user", content }],
  };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 5 }];
  const call = () => fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  let res = await call();
  let searched = useSearch;
  if (!res.ok && useSearch && res.status === 400) { delete body.tools; searched = false; res = await call(); }
  if (!res.ok) throw new Error(`AI service error ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
  const urls: string[] = [];
  for (const b of data.content ?? []) {
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) for (const r of b.content) if (r?.url) urls.push(r.url);
    for (const c of b.citations ?? []) if (c?.url) urls.push(c.url);
  }
  return { result: parseJson(text), searched, urls: [...new Set(urls)].slice(0, 8) };
}

const num = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  try {
    // Only signed-in Fixnar staff/technicians may use the AI (it costs money)
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
    });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "Please sign in again." }, 401);
    const { data: prof } = await sb.from("profiles").select("role").eq("id", u.user.id).maybeSingle();
    if (!prof || !["admin", "operations", "technician"].includes(prof.role)) return json({ error: "Not allowed" }, 403);

    const body = await req.json();
    const action = body.action;

    if (action === "identify") {
      const image: string = body.image ?? "";
      const m = image.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
      if (!m) return json({ error: "Send a photo (JPEG/PNG)." }, 400);
      if (m[2].length > 6_000_000) return json({ error: "Photo is too large." }, 400);
      const { result } = await askClaude([
        { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } },
        { type: "text", text:
`Identify this equipment/machine for a maintenance asset register.
Read any visible nameplate, logo or label. Return JSON:
{"name": short clear asset name (e.g. "Double-basket gas fryer"),
 "category": one of ${JSON.stringify(CATEGORIES)},
 "subcategory": e.g. "Fryer", "Reach-in chiller", "Split AC",
 "brand": brand if visible or very likely else null,
 "model": model if readable on a label else null,
 "serial_number": only if clearly readable on a nameplate else null,
 "description": one sentence describing it (size, fuel/power type, doors/baskets etc),
 "visible_text": text you can read on labels,
 "confidence": "high" | "medium" | "low"}` },
      ], false);
      return json({ ok: true, data: result });
    }

    if (action === "specs") {
      const { name, brand, model, category } = body;
      if (!name && !model) return json({ error: "Give at least the asset name or model." }, 400);
      const { result, searched, urls } = await askClaude([{ type: "text", text:
`Give the manufacturer technical specifications for this equipment (UAE / Gulf version when there is one):
name: ${name ?? ""}; brand: ${brand ?? ""}; model: ${model ?? ""}; category: ${category ?? ""}.
Search the manufacturer or distributor spec sheet if you can. Return JSON:
{"power_kw": number|null, "voltage_v": text e.g. "220-240"|null, "current_a": number|null, "phase": "1-phase"|"3-phase"|null,
 "frequency_hz": number|null, "fuel": "electric"|"gas (LPG)"|"gas (natural)"|null, "gas_consumption": text|null,
 "refrigerant": text|null, "capacity": text (litres, kg/h, BTU, tons…)|null,
 "dimensions_mm": "W x D x H"|null, "weight_kg": number|null,
 "other": [short extra spec lines],
 "spec_match": "exact model" | "same series" | "typical for this type",
 "notes": short note on accuracy}` }], true);
      return json({ ok: true, data: result, searched, sources: urls });
    }

    if (action === "price") {
      const { name, brand, model, category } = body;
      if (!name && !model) return json({ error: "Give at least the asset name or model." }, 400);
      const { result, searched, urls } = await askClaude([{ type: "text", text:
`Find the CURRENT market price to buy this equipment NEW in the UAE (or GCC if not listed in UAE):
name: ${name ?? ""}; brand: ${brand ?? ""}; model: ${model ?? ""}; category: ${category ?? ""}.
Search supplier / distributor / marketplace listings. Convert USD to AED at ${USD_TO_AED}. Prices excluding VAT.
Return JSON:
{"currency":"AED", "low": lowest credible price, "mid": typical/median price, "high": highest credible price,
 "listings": [{"seller": text, "price_aed": number, "url": text}],
 "basis": "listings found" | "estimate from similar models",
 "notes": short note}` }], true);
      const low = num(result.low), mid = num(result.mid), high = num(result.high);
      return json({
        ok: true, searched, sources: urls,
        data: { ...result, low, mid, high,
          value: low && mid ? Math.round(((low + mid) / 2) * 100) / 100 : (mid ?? low ?? null) },
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message ?? "Unexpected error" }, 500);
  }
});
