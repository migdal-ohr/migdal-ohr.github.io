// Private iCal feed of meetings/tours/interviews for Google Calendar ("From URL").
// Each user has a secret calendar_token; the feed respects the role's permissions and institutions.
import { createClient } from "npm:@supabase/supabase-js@2.49.4";

const KIND: Record<string, string> = { registration: "פגישת רישום", tour: "סיור", interview: "ראיון", registration_day: "יום רישום", other: "אירוע" };
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
// RFC 5545: fold lines longer than 75 octets
const fold = (line: string) => {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > 74) {
      out.push(cur);
      cur = " " + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
};

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) return new Response("not found", { status: 404 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: prof } = await db
    .from("profiles")
    .select("user_id, full_name, is_active, roles(is_admin, perms, institutions)")
    .eq("calendar_token", token)
    .maybeSingle();
  const role = (prof as { roles?: { is_admin: boolean; perms: Record<string, boolean>; institutions: string[] } } | null)?.roles;
  if (!prof?.is_active || !role || !(role.is_admin || role.perms?.["students.view"])) return new Response("not found", { status: 404 });

  const from = new Date(Date.now() - 31 * 864e5).toISOString();
  const to = new Date(Date.now() + 200 * 864e5).toISOString();
  const { data: rows } = await db
    .from("appointments")
    .select("id, kind, starts_at, type, notes, attended, students!inner(first_name, last_name, track, is_archived, father_phone, mother_phone)")
    .gte("starts_at", from)
    .lte("starts_at", to)
    .order("starts_at")
    .limit(3000);

  const scope = role.is_admin || !role.institutions?.length ? null : role.institutions;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Migdal Ohr//Registration//HE",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:רישום מגדל אור",
    "X-WR-TIMEZONE:Asia/Jerusalem",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
  ];
  for (const r of (rows ?? []) as Array<Record<string, unknown>>) {
    const s = r.students as { first_name: string; last_name: string; track: string | null; is_archived: boolean; father_phone: string | null; mother_phone: string | null };
    if (s.is_archived) continue;
    if (scope && s.track && !scope.includes(s.track)) continue;
    const start = new Date(r.starts_at as string);
    const end = new Date(start.getTime() + (r.kind === "tour" ? 60 : 45) * 60000);
    const name = `${s.first_name} ${s.last_name}`.trim();
    const desc = [r.notes, s.father_phone && `אבא: ${s.father_phone}`, s.mother_phone && `אמא: ${s.mother_phone}`, r.attended === true ? "הגיע ✓" : r.attended === false ? "לא הגיע" : ""]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@migdal-ohr`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${esc(`${KIND[r.kind as string] ?? "אירוע"} · ${name}`)}`),
      ...(desc ? [fold(`DESCRIPTION:${esc(desc)}`)] : []),
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" },
  });
});
