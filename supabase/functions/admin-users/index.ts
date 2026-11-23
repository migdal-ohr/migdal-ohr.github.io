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


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, service, { auth: { persistSession: false } });

    const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) return json({ error: "לא מחובר" }, 401);
    // caller needs the "admin.users" permission (or the built-in admin role)
    const { data: prof } = await admin.from("profiles").select("is_active, roles(is_admin, perms)").eq("user_id", caller.user.id).maybeSingle();
    const r = (prof as { roles?: { is_admin?: boolean; perms?: Record<string, boolean> } } | null)?.roles;
    if (!prof?.is_active || !(r?.is_admin || r?.perms?.["admin.users"])) return json({ error: "אין לך הרשאה לנהל משתמשים" }, 403);

    const body = await req.json();
    if (body.action === "create") {
      const email = String(body.email || "").trim().toLowerCase();
      const { data: roleRow } = await admin.from("roles").select("id, name, is_admin").eq("id", String(body.role_id || "")).maybeSingle();
      if (!roleRow) return json({ error: "בחרו תפקיד" }, 400);
      if (roleRow.is_admin && !r?.is_admin) return json({ error: "רק מנהל מערכת יכול למנות מנהל מערכת" }, 403);
      const password = String(body.password || "");
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "כתובת אימייל לא תקינה" }, 400);
      if (password.length < 8) return json({ error: "סיסמה של 8 תווים לפחות" }, 400);
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: String(body.full_name || "").slice(0, 80) },
        app_metadata: { initial_role_id: roleRow.id },
      });
      if (error) return json({ error: error.message.includes("already") ? "המשתמש כבר קיים" : error.message }, 400);
      await admin.from("profiles").update({ role_id: roleRow.id, full_name: String(body.full_name || "").slice(0, 80), is_active: true }).eq("user_id", data.user.id);
      await admin.from("activity_logs").insert({ action_type: "user_admin", description: `נוצר משתמש ${email} (${roleRow.name})`, actor_id: caller.user.id });
      return json({ ok: true, user_id: data.user.id });
    }
    if (body.action === "set_password") {
      const password = String(body.password || "");
      if (password.length < 8) return json({ error: "סיסמה של 8 תווים לפחות" }, 400);
      const { data: target } = await admin.from("profiles").select("roles(is_admin)").eq("user_id", String(body.user_id)).maybeSingle();
      if ((target as { roles?: { is_admin?: boolean } } | null)?.roles?.is_admin && !r?.is_admin) {
        return json({ error: "רק מנהל מערכת יכול לאפס סיסמה של מנהל מערכת" }, 403);
      }
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
