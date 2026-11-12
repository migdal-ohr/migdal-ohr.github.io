// In-app help assistant: answers staff questions about how to use the registration system.
// Knows the system from KNOWLEDGE; never sees student data. Signed-in active staff only, rate-limited.
import Anthropic from "npm:@anthropic-ai/sdk@1.8.0";
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const DAILY_LIMIT = 80;
const ROLE_HE: Record<string, string> = {
  admin: "מנהל מערכת",
  manager: "מנהל/ת רישום",
  secretary: "מזכירה",
  interviewer: "מראיין (תחנות בלבד)",
  viewer: "צפייה בלבד",
};

const RULES = `את/ה "העוזר של מערכת הרישום" של מוסדות מגדל אור. עונים לצוות (מזכירות, מנהלים, מראיינים) על שאלות איך משתמשים במערכת.

כללים:
- עונים תמיד בעברית פשוטה וחמה, קצר וממוקד: צעדים ממוספרים כשמסבירים איך עושים משהו, ושמות כפתורים ומסכים בדיוק כפי שהם מופיעים במערכת (בגרשיים או מודגשים).
- עונים רק לפי המדריך שלמטה. אם משהו לא כתוב במדריך — אומרים בכנות שלא בטוחים או שזה עוד לא קיים, לא ממציאים כפתורים או מסכים.
- מתאימים את התשובה לתפקיד של מי ששואל: אם הפעולה דורשת הרשאה שאין לו, אומרים את זה ואומרים למי לפנות.
- אין לך גישה לנתוני התלמידים ואין לך יכולת לבצע פעולות במערכת. אם מבקשים פרטים על תלמיד מסוים או לבצע פעולה — מסבירים איך עושים את זה בעצמם.
- אם זו תקלה (משהו לא עובד כמו שצריך) או בקשה לתוספת — מציעים לשלוח פנייה בכפתור "שלח כפנייה" שמתחת לתשובה, או במסך "בקשות ותקלות".
- לא עונים על נושאים שלא קשורים למערכת; מחזירים בעדינות לנושא.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  try {
    const auth = req.headers.get("Authorization") ?? "";
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false },
    });
    const { data: u } = await sb.auth.getUser();
    if (!u?.user) return json({ error: "לא מחובר" }, 401);
    const { data: prof } = await sb.from("profiles").select("role, is_active, full_name").eq("user_id", u.user.id).single();
    if (!prof?.is_active) return json({ error: "אין הרשאה" }, 403);

    const body = await req.json().catch(() => null);
    const raw = Array.isArray(body?.messages) ? body.messages : [];
    const messages: Anthropic.MessageParam[] = raw
      .filter((m: { role?: string; content?: unknown }) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
      .slice(-16)
      .map((m: { role: "user" | "assistant"; content: string }) => ({ role: m.role, content: m.content.slice(0, 3000) }));
    while (messages.length && messages[0].role !== "user") messages.shift();
    if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "אין שאלה" }, 400);

    // daily limit per user (counted server-side)
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await sb.from("assistant_usage").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) return json({ error: "הגעת למכסת השאלות להיום. נסו שוב מחר, או שלחו פנייה." }, 429);

    // the system guide lives in app_settings.assistant_knowledge (updated without redeploying)
    const { data: kb } = await sb.from("app_settings").select("value").eq("key", "assistant_knowledge").maybeSingle();
    const SYSTEM = `${RULES}\n\n${typeof kb?.value === "string" ? kb.value : ""}`;

    const who = `מי ששואל: ${prof.full_name || "איש צוות"}, תפקיד: ${ROLE_HE[prof.role] ?? prof.role}.`;
    const lastQ = `${who}\n\n${messages[messages.length - 1].content as string}`;
    let answer = "";
    let usage = { input_tokens: 0, output_tokens: 0 };

    const geminiKey = Deno.env.get("GEMINI_API_KEY");
    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (geminiKey) {
      // Google Gemini (REST generateContent). Model can be changed with the GEMINI_MODEL secret.
      // primary model (GEMINI_MODEL or the current Flash), then fallbacks when Google is overloaded
      const models = [...new Set([Deno.env.get("GEMINI_MODEL") || "gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"])];
      const contents = [...messages.slice(0, -1), { role: "user", content: lastQ }].map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content as string }],
      }));
      // short how-to answers need little reasoning: low thinking keeps replies fast
      const body = (thinking: boolean) =>
        JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM }] },
          contents,
          generationConfig: { maxOutputTokens: 8192, ...(thinking ? { thinkingConfig: { thinkingLevel: "low" } } : {}) },
        });
      let r: Response | null = null;
      let g: any = {};
      attempts: for (const model of models) {
        let thinking = true;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
              body: body(thinking),
              signal: AbortSignal.timeout(35_000),
            });
            g = await r.json().catch(() => ({}));
          } catch {
            console.error("gemini timeout", model);
            r = new Response(null, { status: 503 });
            break; // too slow: go straight to the next model
          }
          if (r.ok) break attempts;
          console.error("gemini error", model, r.status, JSON.stringify(g).slice(0, 300));
          if (r.status === 400 && thinking) { thinking = false; continue; } // model without thinking levels
          if (r.status === 404) break; // model not available: try the next one
          if (r.status !== 503 && r.status !== 429 && r.status !== 500) break attempts;
          await new Promise((res) => setTimeout(res, 800));
        }
      }
      if (!r?.ok) {
        return json({ error: r?.status === 429 || r?.status === 503 ? "העוזר עמוס כרגע, נסו שוב בעוד דקה." : "העוזר לא זמין כרגע, נסו שוב." }, r?.status === 429 ? 429 : 502);
      }
      const cand = g?.candidates?.[0];
      answer = (cand?.content?.parts ?? []).map((p: { text?: string; thought?: boolean }) => (p.thought ? "" : p.text ?? "")).join("").trim();
      if (!answer && (cand?.finishReason === "SAFETY" || g?.promptFeedback?.blockReason)) answer = "לא אוכל לעזור בשאלה הזו. אפשר לנסח אחרת, או לשלוח פנייה במסך \"בקשות ותקלות\".";
      usage = { input_tokens: g?.usageMetadata?.promptTokenCount ?? 0, output_tokens: g?.usageMetadata?.candidatesTokenCount ?? 0 };
    } else if (anthropicKey) {
      const client = new Anthropic({ apiKey: anthropicKey });
      const response = await client.beta.messages.create({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        messages: [...messages.slice(0, -1), { role: "user", content: lastQ }],
      });
      usage = {
        input_tokens: response.usage.input_tokens + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
        output_tokens: response.usage.output_tokens,
      };
      answer = response.stop_reason === "refusal"
        ? "לא אוכל לעזור בשאלה הזו. אפשר לנסח אחרת, או לשלוח פנייה במסך \"בקשות ותקלות\"."
        : response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("\n").trim();
    } else {
      return json({ error: "העוזר עוד לא הופעל (חסר מפתח). פנו למנהל המערכת." }, 503);
    }

    await sb.from("assistant_usage").insert(usage);
    return json({ answer: answer || "לא הצלחתי לענות הפעם, נסו לנסח אחרת." });
  } catch (e) {
    const status = e instanceof Anthropic.RateLimitError ? 429 : e instanceof Anthropic.APIError ? 502 : 500;
    console.error("assistant error", e instanceof Error ? e.message : e);
    return json({ error: status === 429 ? "העוזר עמוס כרגע, נסו שוב בעוד דקה." : "העוזר לא זמין כרגע, נסו שוב." }, status);
  }
});
