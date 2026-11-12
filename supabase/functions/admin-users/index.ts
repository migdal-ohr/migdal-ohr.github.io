// Admin-only user management for the registration system.
// actions: create | set_password
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const ROLES = ["admin", "manager", "secretary", "interviewer", "viewer"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) return json({ error: "לא מחובר" }, 401);
    const { data: prof } = await admin.from("profiles").select("role, is_active").eq("user_id", caller.user.id).maybeSingle();
    if (!prof || !prof.is_active || prof.role !== "admin") return json({ error: "רק מנהל מערכת יכול לנהל משתמשים" }, 403);

    const body = await req.json();
    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const role = ROLES.includes(body.role) ? body.role : "secretary";
      const password = String(body.password || "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "כתובת אימייל לא תקינה" }, 400);
      if (password.length < 8) return json({ error: "סיסמה של 8 תווים לפחות" }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: String(body.full_name || "").slice(0, 80) },
        app_metadata: { initial_role: role },
      });
      if (error) return json({ error: error.message.includes("already") ? "המשתמש כבר קיים" : error.message }, 400);
      await admin.from("profiles").update({ role, full_name: String(body.full_name || "").slice(0, 80), is_active: true }).eq("user_id", data.user.id);
      await admin.from("activity_logs").insert({ action_type: "user_admin", description: `נוצר משתמש ${email} (${role})`, actor_id: caller.user.id });
      return json({ ok: true, user_id: data.user.id });
    }
    if (body.action === "set_password") {
      const password = String(body.password || "");
      if (password.length < 8) return json({ error: "סיסמה של 8 תווים לפחות" }, 400);
      const { error } = await admin.auth.admin.updateUserById(String(body.user_id), { password });
      if (error) return json({ error: error.message }, 400);
      await admin.from("activity_logs").insert({ action_type: "user_admin", description: `אופסה סיסמה למשתמש`, actor_id: caller.user.id });
      return json({ ok: true });
    }
    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
