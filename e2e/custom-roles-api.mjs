// Custom roles: fine-grained permissions + institution scope, enforced by the live database.
import { createClient } from "@supabase/supabase-js";
const URL = process.env.SB_URL, KEY = process.env.SB_KEY, PW = process.env.E2E_PW;
const login = async (r) => { const c = createClient(URL, KEY, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email: `e2e-${r}@test.local`, password: PW }); if (error) throw error; return c; };
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const adm = await login("admin");
// fixtures: one metivta student, one maor_israel student
const { data: fx } = await adm.rpc("insert_students", { p_rows: [
  { firstName: "E2E", lastName: "Metivta", grade: 7, registrationTrack: "metivta" },
  { firstName: "E2E", lastName: "Maor", grade: 7, registrationTrack: "maor_israel" }] });
const [met, maor] = fx;
// custom role: view + edit details, metivta only, no status / delete
const { data: role, error: re } = await adm.from("roles").insert({ name: "E2E מזכירת מתיבתא", perms: { "students.view": true, "students.edit": true }, institutions: ["metivta"], is_admin: true, key: "hack" }).select().single();
ok("admin creates custom role", !re, re?.message);
ok("custom role can never be super-admin or built-in", role && role.is_admin === false && role.key === null);
const { data: vp } = await adm.from("profiles").select("user_id").eq("email", "e2e-viewer@test.local").single();
const { error: ae } = await adm.from("profiles").update({ role_id: role.id }).eq("user_id", vp.user_id);
ok("assign role to user", !ae, ae?.message);
const v = await login("viewer");
const ids = ((await v.from("students").select("id").in("id", [met.id, maor.id])).data ?? []).map((r) => r.id);
ok("sees own institution", ids.includes(met.id));
ok("does NOT see other institution", !ids.includes(maor.id));
const e1 = await v.rpc("patch_student", { p_id: met.id, p_patch: { city: "צפת", details: { hmo: "clalit" } } });
ok("edit details allowed", !e1.error, e1.error?.message);
const e2 = await v.rpc("patch_student", { p_id: met.id, p_patch: { stage: "complete" } });
ok("status change blocked (no students.status)", !!e2.error);
const e3 = await v.rpc("patch_student", { p_id: met.id, p_patch: { details: { outcome: "accepted" } } });
ok("decision change blocked", !!e3.error);
const e4 = await v.rpc("patch_student", { p_id: met.id, p_patch: { registrationTrack: "maor_israel" } });
ok("cannot move student to an institution it can't see", !!e4.error);
const e5 = await v.from("students").delete().eq("id", met.id).select();
ok("delete blocked", (e5.data ?? []).length === 0);
const e6 = await v.from("student_log").insert({ student_id: met.id, kind: "note", summary: "x" });
ok("internal note blocked (no sensitive.notes)", !!e6.error);
const e7 = await v.from("student_log").insert({ student_id: met.id, kind: "call", participant: "אבא", summary: "דיברנו" });
ok("call log allowed (students.edit)", !e7.error, e7.error?.message);
// grant status permission live → takes effect immediately
await adm.from("roles").update({ perms: { "students.view": true, "students.edit": true, "students.status": true } }).eq("id", role.id);
const e8 = await v.rpc("patch_student", { p_id: met.id, p_patch: { details: { outcome: "accepted" } } });
ok("permission change takes effect immediately", !e8.error, e8.error?.message);
// built-in admin role cannot be locked down
await adm.from("roles").update({ is_admin: false, institutions: ["metivta"] }).eq("key", "admin");
const { data: ar } = await adm.from("roles").select("is_admin, institutions").eq("key", "admin").single();
ok("built-in admin role cannot be restricted", ar.is_admin === true && ar.institutions.length === 0);
const del = await adm.from("roles").delete().eq("key", "admin").select();
ok("built-in admin role cannot be deleted", !!del.error || (del.data ?? []).length === 0);
// interviewer: attendance yes, rescheduling no
const intv = await login("interviewer");
const { data: ap } = await adm.from("appointments").insert({ student_id: met.id, starts_at: new Date(Date.now() + 864e5).toISOString(), kind: "tour", type: "סיור" }).select().single();
const a1 = await intv.from("appointments").update({ attended: true }).eq("id", ap.id).select();
ok("interviewer marks attended", (a1.data ?? []).length === 1, a1.error?.message);
const a2 = await intv.from("appointments").update({ starts_at: new Date().toISOString() }).eq("id", ap.id).select();
ok("interviewer cannot reschedule", !!a2.error || (a2.data ?? []).length === 0);
const a3 = await intv.from("student_log").insert({ student_id: met.id, kind: "interview", subtype: "social", summary: "ראיון טוב" });
ok("interviewer writes interview summary", !a3.error, a3.error?.message);
const s1 = await (await login("secretary")).from("student_log").select("author_name").eq("student_id", met.id).eq("kind", "interview").single();
ok("log carries author name", s1.data?.author_name === "בדיקה interviewer");
// cleanup
await adm.from("profiles").update({ role_id: (await adm.from("roles").select("id").eq("key", "viewer").single()).data.id }).eq("user_id", vp.user_id);
await adm.from("students").delete().in("id", [met.id, maor.id]);
await adm.from("roles").delete().eq("id", role.id);
console.log(fails ? `${fails} FAILED` : "ALL CUSTOM-ROLE CHECKS PASSED");
