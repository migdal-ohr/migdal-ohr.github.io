// Verifies the permission matrix directly against the live v3 database (test users only).
import { createClient } from "@supabase/supabase-js";
const URL = process.env.SB_URL, KEY = process.env.SB_KEY, PW = process.env.E2E_PW;
const roles = ["admin", "manager", "secretary", "interviewer", "viewer"];
const expect = {
  read:        { admin: 1, manager: 1, secretary: 1, interviewer: 1, viewer: 1 },
  insert:      { admin: 1, manager: 1, secretary: 1, interviewer: 0, viewer: 0 },
  editField:   { admin: 1, manager: 1, secretary: 1, interviewer: 0, viewer: 0 },
  stations:    { admin: 1, manager: 1, secretary: 1, interviewer: 1, viewer: 0 },
  meeting:     { admin: 1, manager: 1, secretary: 1, interviewer: 0, viewer: 0 },
  audit:       { admin: 1, manager: 1, secretary: 0, interviewer: 0, viewer: 0 },
  settings:    { admin: 1, manager: 0, secretary: 0, interviewer: 0, viewer: 0 },
  changeRoles: { admin: 1, manager: 0, secretary: 0, interviewer: 0, viewer: 0 },
  delete:      { admin: 1, manager: 1, secretary: 0, interviewer: 0, viewer: 0 },
};
let fails = 0;
const line = (role, action, ok) => {
  const want = !!expect[action][role];
  const pass = ok === want;
  if (!pass) fails++;
  console.log(`${pass ? "PASS" : "FAIL"} ${role.padEnd(11)} ${action.padEnd(11)} ${ok ? "allowed" : "blocked"}${pass ? "" : ` (expected ${want ? "allowed" : "blocked"})`}`);
};
const admin = createClient(URL, KEY);
await admin.auth.signInWithPassword({ email: "e2e-admin@test.local", password: PW });
// a fixture student owned by the test run
const { data: fx, error: fxErr } = await admin.rpc("insert_students", { p_rows: { firstName: "E2E", lastName: "Fixture", grade: 7 } });
if (fxErr) throw fxErr;
const fixtureId = fx[0].id;

for (const role of roles) {
  const c = createClient(URL, KEY, { auth: { persistSession: false } });
  const { error: le } = await c.auth.signInWithPassword({ email: `e2e-${role}@test.local`, password: PW });
  if (le) { console.log("login failed", role, le.message); fails++; continue; }
  const r1 = await c.from("students").select("id").eq("id", fixtureId);
  line(role, "read", !r1.error && r1.data.length === 1);
  const r2 = await c.rpc("insert_students", { p_rows: { firstName: "E2E", lastName: role, grade: 8 } });
  line(role, "insert", !r2.error);
  if (!r2.error) await admin.from("students").delete().eq("id", r2.data[0].id);
  const r3 = await c.rpc("patch_student", { p_id: fixtureId, p_patch: { notes: `by ${role}` } });
  line(role, "editField", !r3.error);
  const r4 = await c.rpc("patch_student", { p_id: fixtureId, p_patch: { stations: { exam: true } } });
  line(role, "stations", !r4.error && !!r4.data);
  const r5 = await c.rpc("set_student_appointment", { p_student_id: fixtureId, p_starts_at: new Date(Date.now() + 86400000).toISOString() });
  line(role, "meeting", !r5.error);
  const r6 = await c.from("audit_log").select("id").eq("row_id", fixtureId).limit(1);
  line(role, "audit", !r6.error && r6.data.length > 0);
  const r7 = await c.from("app_settings").update({ value: { name: "מוסדות מגדל אור", city: "מגדל העמק", address: "רחוב הרב בוסקילה 10, מגדל העמק", signature: "צוות רישום מגדל אור" } }).eq("key", "institution").select();
  line(role, "settings", !r7.error && r7.data.length === 1);
  const me = (await c.auth.getUser()).data.user.id;
  const r8 = await c.from("profiles").update({ full_name: `בדיקה ${role}` }).neq("user_id", me).like("email", "e2e-viewer%").select();
  line(role, "changeRoles", !r8.error && r8.data.length === 1);
  const { data: tmp } = await admin.rpc("insert_students", { p_rows: { firstName: "E2E", lastName: "ToDelete", grade: 9 } });
  const r9 = await c.from("students").delete().eq("id", tmp[0].id).select();
  line(role, "delete", !r9.error && r9.data.length === 1);
  await admin.from("students").delete().eq("id", tmp[0].id);
}
// anonymous
const anon = createClient(URL, KEY, { auth: { persistSession: false } });
const a1 = await anon.from("students").select("id");
console.log(`${!a1.error && a1.data.length === 0 ? "PASS" : "FAIL"} anonymous   read        ${a1.data?.length ?? 0} rows visible`);
if (a1.data?.length) fails++;
const tok = (await admin.from("students").select("rsvp_token").eq("id", fixtureId).single()).data.rsvp_token;
const a2 = await anon.rpc("get_rsvp", { p_token: tok });
console.log(`${a2.data?.[0]?.first_name === "E2E" ? "PASS" : "FAIL"} anonymous   rsvp-token  sees only first name`);
const a3 = await anon.rpc("get_rsvp", { p_token: "00000000-0000-0000-0000-000000000000" });
console.log(`${(a3.data ?? []).length === 0 ? "PASS" : "FAIL"} anonymous   bad-token   nothing`);
// concurrent edits from two users never overwrite each other
const sec = createClient(URL, KEY, { auth: { persistSession: false } });
await sec.auth.signInWithPassword({ email: "e2e-secretary@test.local", password: PW });
await Promise.all([
  admin.rpc("patch_student", { p_id: fixtureId, p_patch: { documents: { id_card: true } } }),
  sec.rpc("patch_student", { p_id: fixtureId, p_patch: { documents: { school_cert: true }, city: "צפת" } }),
]);
const after = (await admin.from("students").select("documents, city, version").eq("id", fixtureId).single()).data;
const concOk = after.documents.id_card && after.documents.school_cert && after.city === "צפת";
console.log(`${concOk ? "PASS" : "FAIL"} concurrency simultaneous edits merged (v${after.version})`);
if (!concOk) fails++;
await admin.from("students").delete().eq("id", fixtureId);
console.log(fails ? `\n${fails} FAILURES` : "\nALL PERMISSION CHECKS PASSED");
process.exit(fails ? 1 : 0);
