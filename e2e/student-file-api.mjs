// Student file + principal-only access, enforced by the live database.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
const URL = process.env.SB_URL, KEY = process.env.SB_KEY, PW = process.env.E2E_PW;
const login = async (r) => { const c = createClient(URL, KEY, { auth: { persistSession: false } }); const { error } = await c.auth.signInWithPassword({ email: `e2e-${r}@test.local`, password: PW }); if (error) throw error; return c; };
let fails = 0; const ok = (n, c, x = "") => { if (!c) fails++; console.log(`${c ? "PASS" : "FAIL"} ${n} ${x}`); };
const adm = await login("admin"), mgr = await login("manager"), prin = await login("principal");
const { data: fx } = await adm.rpc("insert_students", { p_rows: [
  { firstName: "E2E", lastName: "תיק-נשלח", grade: 8, registrationTrack: "metivta" },
  { firstName: "E2E", lastName: "תיק-לא-נשלח", grade: 8, registrationTrack: "metivta" }] });
const [sent, other] = fx;
// documents on both students
const up = async (sid, file, type) => {
  const path = `${sid}/${crypto.randomUUID()}.${file.split(".").pop()}`;
  const { error } = await mgr.storage.from("student-docs").upload(path, readFileSync(new globalThis.URL(`./fixtures/${file}`, import.meta.url)), { contentType: type });
  if (error) throw error; return path;
};
const pdfPath = await up(sent.id, "sample.pdf", "application/pdf");
const otherPath = await up(other.id, "sample.pdf", "application/pdf");
await mgr.rpc("patch_student", { p_id: sent.id, p_patch: { files: { school_cert: [{ path: pdfPath, name: "תעודה.pdf", uploadedAt: new Date().toISOString() }] }, documents: { school_cert: true } } });
await mgr.from("student_log").insert([{ student_id: sent.id, kind: "interview", subtype: "social", summary: "ראיון טוב" }, { student_id: sent.id, kind: "note", summary: "הערה פנימית" }]);
await mgr.from("appointments").insert({ student_id: sent.id, kind: "tour", starts_at: new Date(Date.now() + 864e5).toISOString(), type: "סיור" });

const count = async (c) => ((await c.from("students").select("id")).data ?? []).length;
ok("principal sees NO students before anything is sent", (await count(prin)) === 0);
ok("principal cannot read another student's document", !(await prin.storage.from("student-docs").createSignedUrl(otherPath, 60)).data?.signedUrl);
const r1 = await mgr.from("principal_reviews").insert({ student_id: sent.id }).select().single();
ok("manager sends the file", !r1.error, r1.error?.message);
const seen = ((await prin.from("students").select("id")).data ?? []).map((s) => s.id);
ok("principal now sees exactly the sent student", seen.length === 1 && seen[0] === sent.id, JSON.stringify(seen));
const log = (await prin.from("student_log").select("kind").eq("student_id", sent.id)).data ?? [];
ok("principal sees interviews and internal notes in the file", log.length === 2);
ok("principal sees the student's events", ((await prin.from("appointments").select("id").eq("student_id", sent.id)).data ?? []).length === 1);
const su = await prin.storage.from("student-docs").createSignedUrl(pdfPath, 60);
ok("principal opens the uploaded document", !!su.data?.signedUrl, su.error?.message);
const body = su.data?.signedUrl ? await (await fetch(su.data.signedUrl)).arrayBuffer() : new ArrayBuffer(0);
ok("document content arrives (PDF)", new TextDecoder().decode(body.slice(0, 5)) === "%PDF-");
ok("still not the other student's document", !(await prin.storage.from("student-docs").createSignedUrl(otherPath, 60)).data?.signedUrl);
ok("principal sees no other student logs", ((await prin.from("student_log").select("id").eq("student_id", other.id)).data ?? []).length === 0);
const e1 = await prin.rpc("patch_student", { p_id: sent.id, p_patch: { city: "hack" } });
ok("principal cannot edit the student", !!e1.error);
const e2 = await prin.from("student_log").insert({ student_id: other.id, kind: "call", summary: "x" });
ok("principal cannot write on other students", !!e2.error);
ok("principal sees no requests / years admin data", ((await prin.from("audit_log").select("id").limit(1)).data ?? []).length === 0);
await prin.from("principal_reviews").update({ status: "decided", decision: "accept", summary: "מתקבל" }).eq("id", r1.data.id);
ok("after deciding, the file stays open to him", (await count(prin)) === 1);
// a pending request that is cancelled removes access
const r2 = await mgr.from("principal_reviews").insert({ student_id: other.id }).select().single();
ok("second student visible while pending", (await count(prin)) === 2);
await mgr.from("principal_reviews").update({ status: "cancelled" }).eq("id", r2.data.id);
ok("cancelled request removes access", (await count(prin)) === 1);
// regular staff unaffected
ok("manager still sees all students", (await count(mgr)) > 100);
const sec = await login("secretary");
ok("secretary still sees all students", (await count(sec)) > 100);
await mgr.storage.from("student-docs").remove([pdfPath, otherPath]);
await adm.from("students").delete().in("id", [sent.id, other.id]);
console.log(fails ? `${fails} FAILED` : "ALL PASSED");
process.exit(fails ? 1 : 0);
