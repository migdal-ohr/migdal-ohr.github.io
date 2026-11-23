import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, ChevronDown, Phone, MessageSquare, StickyNote, Trash2, Users, UserPlus, Check, X, Loader2, ClipboardList, IdCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  CAMP_LABELS,
  EVENT_KIND_COLOR,
  EVENT_KIND_LABELS,
  EventKind,
  Family,
  GENDER_LABELS,
  HMO_LABELS,
  OUTCOME_BADGE,
  OUTCOME_LABELS,
  Outcome,
  RELIGIOUS_LABELS,
  STATION_LABELS,
  StationKey,
} from "@/types/crm";
import {
  addEvent,
  addLogEntry,
  deleteEvent,
  deleteLogEntry,
  LogKind,
  updateEvent,
  useRecruiters,
  useStaff,
  useStudentEvents,
  useStudentLog,
} from "@/lib/api/extras";
import { useSession } from "@/lib/session";
import { hebrewDate } from "@/lib/dates";
import { useCrm } from "@/store/crmStore";

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", { weekday: "short", day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" });
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL") : "");

const SectionToggle = ({ icon: Icon, title, badge, children, defaultOpen = false }: { icon: typeof Phone; title: string; badge?: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) => (
  <Collapsible defaultOpen={defaultOpen}>
    <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors group">
      <span className="flex items-center gap-2 font-semibold text-sm">
        <Icon size={16} className="text-primary" /> {title} {badge}
      </span>
      <ChevronDown size={16} className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
    </CollapsibleTrigger>
    <CollapsibleContent className="pt-3">{children}</CollapsibleContent>
  </Collapsible>
);

/* ------------------------------ header chips ------------------------------ */

export const OutcomeChip = ({ family }: { family: Family }) => {
  const o = (family.outcome ?? "in_process") as Outcome;
  if (o === "in_process") return null;
  return <span className={cn("px-3 py-1 rounded-lg font-bold", OUTCOME_BADGE[o])}>{OUTCOME_LABELS[o]}</span>;
};

/** "Before/after tour" + tour date, shown in the card header. */
export const TourChip = ({ familyId }: { familyId: string }) => {
  const { events } = useStudentEvents(familyId);
  const tours = events.filter((e) => e.kind === "tour");
  if (!tours.length) return null;
  const done = tours.find((t) => t.attended === true);
  const next = tours.find((t) => t.attended !== true);
  return (
    <span className="bg-primary-foreground/20 backdrop-blur px-3 py-1 rounded-lg font-medium">
      {done ? `אחרי סיור (${fmtDate(done.date)})` : `סיור: ${fmtDate(next?.date)}`}
    </span>
  );
};

/* ------------------------------ full details ------------------------------ */

const Row = ({ label, value }: { label: string; value?: React.ReactNode }) =>
  value === undefined || value === null || value === "" ? null : (
    <div className="flex justify-between gap-3 py-1.5 border-b border-border/50 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-left">{value}</span>
    </div>
  );

export const FullDetailsSection = ({ family }: { family: Family }) => {
  const { recruiters } = useRecruiters();
  const recruiter = recruiters.find((r) => r.id === family.recruiterId)?.name;
  const parent = (p: "father" | "mother") => {
    const f = family as unknown as Record<string, string | number | boolean | undefined>;
    return [
      f[`${p}IdNumber`] && `ת״ז ${f[`${p}IdNumber`]}`,
      f[`${p}BirthYear`] && `נולד/ה ${f[`${p}BirthYear`]}`,
      f[`${p}SchoolYears`] && `${f[`${p}SchoolYears`]} שנות לימוד`,
      [f[`${p}Address`], f[`${p}City`]].filter(Boolean).join(", "),
      f[`${p}Whatsapp`] === false && "לא מקבל/ת וואטסאפ",
    ]
      .filter(Boolean)
      .join(" · ");
  };
  return (
    <SectionToggle icon={IdCard} title="פרטים מלאים">
      <div className="grid gap-x-6 sm:grid-cols-2">
        <div>
          <Row label="מין" value={family.gender && GENDER_LABELS[family.gender]} />
          <Row label="תאריך לידה" value={fmtDate(family.birthDate)} />
          <Row label="כתובת" value={[family.address, family.city, family.zip].filter(Boolean).join(", ")} />
          <Row label="מען למכתבים" value={family.mailAddress} />
          <Row label="אימייל" value={family.email} />
          <Row label="טלפון בבית" value={family.homePhone} />
          <Row label="נייד התלמיד" value={family.studentMobile} />
          <Row label="ארץ לידה" value={family.birthCountry} />
          <Row label="תאריך עלייה" value={fmtDate(family.aliyahDate)} />
          <Row label="קופת חולים" value={family.hmo && HMO_LABELS[family.hmo]} />
          <Row label="שיוך דתי" value={family.religious && RELIGIOUS_LABELS[family.religious]} />
        </div>
        <div>
          <Row label="אבא" value={parent("father")} />
          <Row label="אמא" value={parent("mother")} />
          <Row label="מספר אחים" value={family.siblingsCount} />
          <Row label="בית ספר קודם" value={[family.prevSchool, family.prevCity, family.prevGrade && `כיתה ${family.prevGrade}`].filter(Boolean).join(" · ")} />
          <Row label="פעיל מגייס" value={recruiter} />
          <Row label="החלטה" value={family.outcome && OUTCOME_LABELS[family.outcome]} />
          <Row label="תאריך כניסה למוסד" value={fmtDate(family.startDate)} />
          <Row label="תאריך יציאה" value={fmtDate(family.endDate)} />
          <Row label="קייטנה" value={family.campStatus && CAMP_LABELS[family.campStatus]} />
          <Row label="נכנס למערכת" value={fmtDate(family.createdAt)} />
        </div>
      </div>
    </SectionToggle>
  );
};

/* ------------------------------ events (meetings, tours, interviews) ------------------------------ */

export const EventsSection = ({ family }: { family: Family }) => {
  const { can } = useSession();
  const { events } = useStudentEvents(family.id);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<EventKind>("tour");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!date || !time) return toast.error("בחרו תאריך ושעה");
    setBusy(true);
    try {
      await addEvent(family.id, kind, new Date(`${date}T${time}`).toISOString(), EVENT_KIND_LABELS[kind], notes);
      toast.success(`${EVENT_KIND_LABELS[kind]} נקבע`);
      setOpen(false);
      setDate("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const mark = async (id: string, attended: boolean | null) => {
    try {
      await updateEvent(id, { attended });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };
  const remove = async (id: string) => {
    if (!confirm("למחוק את האירוע?")) return;
    try {
      await deleteEvent(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SectionToggle icon={CalendarPlus} title="פגישות, סיורים וראיונות" badge={events.length ? <span className="text-xs text-muted-foreground">({events.length})</span> : null} defaultOpen={events.length > 0}>
      <div className="space-y-2">
        {events.length === 0 && <p className="text-sm text-muted-foreground">עוד לא נקבעו אירועים.</p>}
        {events.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-2 rounded-xl border p-2.5">
            <span className={cn("text-xs rounded-md border px-2 py-0.5", EVENT_KIND_COLOR[e.kind])}>{EVENT_KIND_LABELS[e.kind]}</span>
            <span className="text-sm font-medium">{fmtDateTime(e.date)}</span>
            <span className="text-xs text-muted-foreground">{hebrewDate(new Date(e.date))}</span>
            {e.notes && <span className="text-xs text-muted-foreground truncate max-w-[200px]">· {e.notes}</span>}
            <span className="ms-auto flex items-center gap-1">
              {can.attendance || can.appointments ? (
                <>
                  <Button size="sm" variant={e.attended === true ? "default" : "outline"} className="h-7 px-2" onClick={() => mark(e.id, e.attended === true ? null : true)}>
                    <Check size={13} /> הגיע
                  </Button>
                  <Button size="sm" variant={e.attended === false ? "destructive" : "outline"} className="h-7 px-2" onClick={() => mark(e.id, e.attended === false ? null : false)}>
                    <X size={13} /> לא הגיע
                  </Button>
                </>
              ) : (
                e.attended !== null && <span className="text-xs">{e.attended ? "הגיע" : "לא הגיע"}</span>
              )}
              {can.appointments && e.kind !== "registration" && (
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(e.id)} aria-label="מחיקת אירוע">
                  <Trash2 size={13} />
                </Button>
              )}
            </span>
          </div>
        ))}
        {can.appointments &&
          (open ? (
            <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
              <div className="grid grid-cols-3 gap-2">
                <Select value={kind} onValueChange={(v) => setKind(v as EventKind)}>
                  <SelectTrigger aria-label="סוג">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["tour", "interview", "registration_day", "other"] as EventKind[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {EVENT_KIND_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="תאריך" />
                <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} step={900} aria-label="שעה" />
              </div>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערה (לא חובה)" maxLength={300} />
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />} קביעה
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  ביטול
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
              <CalendarPlus size={14} /> קביעת סיור / ראיון
            </Button>
          ))}
        <p className="text-[11px] text-muted-foreground">פגישת הרישום עצמה נקבעת בכפתור "עריכה" או בלוח השנה.</p>
      </div>
    </SectionToggle>
  );
};

/* ------------------------------ log: calls, interviews, internal notes ------------------------------ */

const LOG_META: Record<LogKind, { label: string; icon: typeof Phone; placeholder: string }> = {
  call: { label: "שיחה", icon: Phone, placeholder: "על מה דיברנו" },
  interview: { label: "ראיון", icon: MessageSquare, placeholder: "סיכום הראיון" },
  note: { label: "הערה פנימית", icon: StickyNote, placeholder: "הערה פנימית לצוות (ההורים לא רואים)" },
};
const INTERVIEW_TYPES: Record<string, string> = { social: 'ראיון עו"ס', principal: "ראיון מנהל", exam: "מבחן", other: "אחר" };

export const LogSection = ({ family }: { family: Family }) => {
  const { can, profile } = useSession();
  const { entries } = useStudentLog(family.id);
  const staff = useStaff();
  const kinds = (["call", "interview", "note"] as LogKind[]).filter((k) => (k === "note" ? can.notes : k === "interview" ? can.interviews : can.edit));
  const [kind, setKind] = useState<LogKind>(kinds[0] ?? "call");
  const [summary, setSummary] = useState("");
  const [participant, setParticipant] = useState("");
  const [subtype, setSubtype] = useState("social");
  const [when, setWhen] = useState("");
  const [followup, setFollowup] = useState("");
  const [mention, setMention] = useState("none");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!kinds.includes(kind) && kinds[0]) setKind(kinds[0]);
  }, [kinds, kind]);

  const save = async () => {
    if (summary.trim().length < 2) return toast.error("כתבו סיכום קצר");
    setBusy(true);
    try {
      await addLogEntry({
        student_id: family.id,
        kind,
        at: when ? new Date(when).toISOString() : undefined,
        subtype: kind === "interview" ? subtype : kind === "call" ? "phone" : undefined,
        participant: participant.trim() || undefined,
        summary: summary.trim(),
        followup_on: followup || null,
        mentions: mention !== "none" ? [mention] : [],
      });
      // clear only what was just sent (the user may already be typing the next entry)
      const sent = { summary: summary, participant, followup, when, mention };
      setSummary((c) => (c === sent.summary ? "" : c));
      setParticipant((c) => (c === sent.participant ? "" : c));
      setFollowup((c) => (c === sent.followup ? "" : c));
      setWhen((c) => (c === sent.when ? "" : c));
      setMention((c) => (c === sent.mention ? "none" : c));
      toast.success("נשמר");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    if (!confirm("למחוק את הרשומה?")) return;
    try {
      await deleteLogEntry(id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <SectionToggle icon={ClipboardList} title="שיחות, ראיונות והערות" badge={entries.length ? <span className="text-xs text-muted-foreground">({entries.length})</span> : null} defaultOpen={entries.length > 0}>
      <div className="space-y-3">
        {kinds.length > 0 && (
          <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
            <div className="flex gap-1">
              {kinds.map((k) => {
                const Icon = LOG_META[k].icon;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={cn("flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm", kind === k ? "bg-background shadow-sm font-semibold" : "text-muted-foreground")}
                  >
                    <Icon size={13} /> {LOG_META[k].label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {kind === "interview" ? (
                <Select value={subtype} onValueChange={setSubtype}>
                  <SelectTrigger aria-label="סוג ראיון">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(INTERVIEW_TYPES).map(([k, l]) => (
                      <SelectItem key={k} value={k}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input value={participant} onChange={(e) => setParticipant(e.target.value)} placeholder={kind === "call" ? "עם מי (אבא / אמא…)" : "נושא (לא חובה)"} maxLength={120} />
              )}
              <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="מתי (ברירת מחדל: עכשיו)" title="מתי (ברירת מחדל: עכשיו)" />
            </div>
            <Textarea rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder={LOG_META[kind].placeholder} maxLength={4000} />
            <div className="flex flex-wrap items-center gap-2">
              {kind !== "interview" && (
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  מעקב ב־
                  <Input type="date" className="h-8 w-36" value={followup} onChange={(e) => setFollowup(e.target.value)} />
                </label>
              )}
              {kind === "note" && (
                <Select value={mention} onValueChange={setMention}>
                  <SelectTrigger className="h-8 w-40" aria-label="תיוג איש צוות">
                    <SelectValue placeholder="תיוג" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">בלי תיוג</SelectItem>
                    {staff
                      .filter((s) => s.user_id !== profile?.user_id)
                      .map((s) => (
                        <SelectItem key={s.user_id} value={s.user_id}>
                          @{s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              )}
              <Button size="sm" className="ms-auto" onClick={save} disabled={busy}>
                {busy && <Loader2 className="animate-spin" />} שמירה
              </Button>
            </div>
          </div>
        )}
        {entries.length === 0 && <p className="text-sm text-muted-foreground">אין עדיין רשומות.</p>}
        <ul className="space-y-2">
          {entries.map((e) => {
            const Icon = LOG_META[e.kind].icon;
            const tagged = staff.filter((s) => e.mentions?.includes(s.user_id)).map((s) => `@${s.name}`);
            return (
              <li key={e.id} className={cn("rounded-xl border p-3", e.kind === "note" && "bg-amber-50/60 border-amber-200")}>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Icon size={13} />
                  <b className="text-foreground">
                    {LOG_META[e.kind].label}
                    {e.kind === "interview" && e.subtype ? ` · ${INTERVIEW_TYPES[e.subtype] ?? STATION_LABELS[e.subtype as StationKey] ?? e.subtype}` : ""}
                  </b>
                  {e.participant && <span>· {e.participant}</span>}
                  <span>· {fmtDateTime(e.at)}</span>
                  <span>· {e.author_name ?? "—"}</span>
                  {(e.author_id === profile?.user_id || can.isAdmin) && (
                    <button className="ms-auto hover:text-destructive" onClick={() => remove(e.id)} aria-label="מחיקה">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{e.summary}</p>
                {(e.followup_on || tagged.length > 0) && (
                  <p className="text-xs mt-1 text-primary">
                    {e.followup_on && `מעקב ב־${fmtDate(e.followup_on)} `}
                    {tagged.join(" ")}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </SectionToggle>
  );
};

/* ------------------------------ siblings ------------------------------ */

export const SiblingsSection = ({ family, onOpenFamily, onAddSibling }: { family: Family; onOpenFamily: (id: string) => void; onAddSibling: (prefill: Partial<Family>) => void }) => {
  const { can } = useSession();
  const { allFamilies, updateFamily } = useCrm();
  const group = family.familyGroup;
  const siblings = useMemo(() => (group ? allFamilies.filter((f) => f.familyGroup === group && f.id !== family.id) : []), [allFamilies, group, family.id]);

  const add = async () => {
    let g = group;
    if (!g) {
      g = family.id;
      await updateFamily(family.id, { familyGroup: g });
    }
    const keep = [
      "lastName", "city", "fatherName", "motherName", "fatherPhone", "motherPhone", "familyStatus", "fatherEmployment", "motherEmployment", "fatherAvrech",
      "address", "zip", "mailAddress", "homePhone", "hmo", "religious", "siblingsCount",
      "fatherIdNumber", "fatherBirthYear", "fatherSchoolYears", "fatherAddress", "fatherCity", "fatherWhatsapp",
      "motherIdNumber", "motherBirthYear", "motherSchoolYears", "motherAddress", "motherCity", "motherWhatsapp", "registrationTrack",
    ] as const;
    const prefill = Object.fromEntries(keep.map((k) => [k, (family as unknown as Record<string, unknown>)[k]])) as Partial<Family>;
    onAddSibling({ ...prefill, familyGroup: g });
  };

  if (!siblings.length && !can.add) return null;
  return (
    <section>
      <h3 className="text-xs font-bold text-muted-foreground tracking-wider mb-3 flex items-center gap-1">
        <Users size={13} /> אחים במערכת
      </h3>
      <div className="flex flex-wrap gap-2">
        {siblings.map((s) => (
          <button key={s.id} onClick={() => onOpenFamily(s.id)} className="rounded-xl border px-3 py-1.5 text-sm hover:bg-muted">
            {s.studentName} <span className="text-xs text-muted-foreground">· כיתה {s.grade}</span>
          </button>
        ))}
        {can.add && (
          <Button size="sm" variant="outline" onClick={add}>
            <UserPlus size={14} /> הוסף אח לתלמיד
          </Button>
        )}
      </div>
    </section>
  );
};

/* ------------------------------ @mention alerts ------------------------------ */

/** Pops a toast when someone tags me in an internal note. */
export const MentionAlerts = ({ onOpenFamily }: { onOpenFamily: (id: string) => void }) => {
  const { profile, can } = useSession();
  useEffect(() => {
    if (!profile?.user_id || !can.notes) return;
    const ch = supabase
      .channel(`mentions-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "student_log" }, (p) => {
        const r = p.new as { mentions?: string[]; author_name?: string; summary?: string; student_id: string; author_id?: string };
        if (!r.mentions?.includes(profile.user_id) || r.author_id === profile.user_id) return;
        toast.info(`${r.author_name ?? "מישהו"} תייג/ה אותך`, {
          description: (r.summary ?? "").slice(0, 120),
          action: { label: "פתח כרטיס", onClick: () => onOpenFamily(r.student_id) },
          duration: 15000,
        });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.user_id, can.notes, onOpenFamily]);
  return null;
};
