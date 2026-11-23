import { useEffect, useMemo, useState } from "react";
import { Gavel, Send, Loader2, CheckCircle2, XCircle, Clock, ExternalLink, Inbox, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { useCrm } from "@/store/crmStore";
import {
  cancelPrincipalReview,
  decidePrincipalReview,
  DECISION_LABELS,
  markReviewSeen,
  PrincipalReview,
  requestPrincipalReview,
  usePrincipalReviews,
  useStudentLog,
  useRecruiters,
} from "@/lib/api/extras";
import {
  EMPLOYMENT_LABELS,
  FAMILY_STATUS_LABELS,
  Family,
  GRADE_LABEL,
  HMO_LABELS,
  REGISTRATION_TRACK_LABELS,
  RELIGIOUS_LABELS,
  STATION_LABELS,
  STATION_ORDER,
  getRequiredDocuments,
} from "@/types/crm";
import { StudentAvatar } from "@/components/crm/StudentAvatar";

const fmt = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL") : "");
const INTERVIEW_TYPES: Record<string, string> = { social: 'ראיון עו"ס', principal: "ראיון מנהל", exam: "מבחן", other: "ראיון" };

const DecisionBadge = ({ d }: { d: "accept" | "reject" | null }) =>
  d ? (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2.5 py-0.5 text-sm font-bold",
        d === "accept" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800",
      )}
    >
      {d === "accept" ? <CheckCircle2 size={14} /> : <XCircle size={14} />} {DECISION_LABELS[d]}
    </span>
  ) : null;

/* ------------------------------ the student page (replaces the printed sheet) ------------------------------ */

const L = ({ label, value }: { label: string; value?: React.ReactNode }) =>
  value === undefined || value === null || value === "" ? null : (
    <div className="text-sm">
      <span className="text-muted-foreground">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );

export const StudentSheet = ({ family }: { family: Family }) => {
  const { entries } = useStudentLog(family.id);
  const { recruiters } = useRecruiters();
  const interviews = entries.filter((e) => e.kind === "interview" || e.kind === "call");
  const docs = getRequiredDocuments(family);
  const missing = docs.filter((d) => !family.documents?.[d.key]);
  const parent = (p: "father" | "mother") => {
    const f = family as unknown as Record<string, string | number | boolean | undefined>;
    const name = f[`${p}Name`];
    if (!name && !f[`${p}Phone`]) return null;
    const emp = f[`${p}Employment`] as keyof typeof EMPLOYMENT_LABELS | undefined;
    return [
      name,
      f[`${p}Phone`],
      emp && emp !== "na" ? EMPLOYMENT_LABELS[emp] : "",
      p === "father" && family.fatherAvrech ? "אברך" : "",
      f[`${p}SchoolYears`] ? `${f[`${p}SchoolYears`]} שנות לימוד` : "",
    ]
      .filter(Boolean)
      .join(" · ");
  };
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <StudentAvatar photoUrl={family.photoUrl} photoPath={family.photoPath} name={family.studentName} className="size-16 rounded-2xl bg-muted border" />
        <div>
          <div className="font-display text-xl font-bold">{family.studentName}</div>
          <div className="text-sm text-muted-foreground">
            {GRADE_LABEL[family.grade]}
            {family.registrationTrack ? ` · ${REGISTRATION_TRACK_LABELS[family.registrationTrack] ?? family.registrationTrack}` : ""}
            {family.city ? ` · ${family.city}` : ""}
          </div>
        </div>
      </div>
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <L label="ת״ז" value={family.studentId} />
        <L label="תאריך לידה" value={fmtDate(family.birthDate)} />
        <L label="כתובת" value={[family.address, family.city].filter(Boolean).join(", ")} />
        <L label="קופת חולים" value={family.hmo && HMO_LABELS[family.hmo]} />
        <L label="שיוך דתי" value={family.religious && RELIGIOUS_LABELS[family.religious]} />
        <L label="מצב משפחתי" value={family.familyStatus && FAMILY_STATUS_LABELS[family.familyStatus]} />
        <L label="אבא" value={parent("father")} />
        <L label="אמא" value={parent("mother")} />
        <L label="מספר אחים" value={family.siblingsCount} />
        <L label="בית ספר קודם" value={[family.prevSchool, family.prevCity, family.prevGrade && `כיתה ${family.prevGrade}`].filter(Boolean).join(" · ")} />
        <L label="פעיל מגייס" value={recruiters.find((r) => r.id === family.recruiterId)?.name} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATION_ORDER.map((k) => (
          <span key={k} className={cn("rounded-full border px-2.5 py-0.5 text-xs", family.stations?.[k] ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "text-muted-foreground")}>
            {family.stations?.[k] ? "✓ " : ""}
            {STATION_LABELS[k]}
          </span>
        ))}
        <span className={cn("rounded-full border px-2.5 py-0.5 text-xs", missing.length ? "bg-amber-50 border-amber-200 text-amber-800" : "bg-emerald-50 border-emerald-200 text-emerald-800")}>
          מסמכים {docs.length - missing.length}/{docs.length}
        </span>
      </div>
      {family.notes && (
        <div className="rounded-xl bg-muted/50 p-3 text-sm whitespace-pre-wrap">
          <div className="text-xs font-semibold text-muted-foreground mb-1">הערות</div>
          {family.notes}
        </div>
      )}
      {interviews.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">ראיונות ושיחות</div>
          {interviews.slice(0, 8).map((e) => (
            <div key={e.id} className="rounded-xl border p-2.5 text-sm">
              <div className="text-xs text-muted-foreground">
                {e.kind === "interview" ? INTERVIEW_TYPES[e.subtype ?? "other"] ?? "ראיון" : `שיחה${e.participant ? ` עם ${e.participant}` : ""}`} · {fmt(e.at)} · {e.author_name}
              </div>
              <div className="whitespace-pre-wrap mt-0.5">{e.summary}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ------------------------------ the principal's form ------------------------------ */

export const DecisionForm = ({ review, onDone }: { review: PrincipalReview; onDone?: () => void }) => {
  const [summary, setSummary] = useState(review.summary ?? "");
  const [decision, setDecision] = useState<"accept" | "reject" | null>(review.decision);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!decision) return toast.error("בחרו: מתקבל או לא מתקבל");
    setBusy(true);
    try {
      await decidePrincipalReview(review.id, decision, summary);
      toast.success("ההחלטה נשלחה למנהלת הרישום");
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
      <div className="flex items-center gap-2 font-bold">
        <Gavel size={18} className="text-primary" /> סיכום החלטת מנהל
      </div>
      {review.request_note && (
        <p className="text-sm rounded-lg bg-background border p-2">
          <span className="text-muted-foreground">הערה מ{review.requested_by_name ?? "מנהלת הרישום"}: </span>
          {review.request_note}
        </p>
      )}
      <Textarea
        rows={6}
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        placeholder="התרשמות מהתלמיד אחרי הפגישה, נקודות חשובות, תנאים..."
        maxLength={6000}
        aria-label="סיכום החלטת מנהל"
      />
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setDecision("accept")}
          aria-pressed={decision === "accept"}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border-2 p-3 font-bold transition",
            decision === "accept" ? "border-emerald-500 bg-emerald-50 text-emerald-800" : "hover:bg-muted",
          )}
        >
          <CheckCircle2 size={18} /> מתקבל
        </button>
        <button
          type="button"
          onClick={() => setDecision("reject")}
          aria-pressed={decision === "reject"}
          className={cn(
            "flex items-center justify-center gap-2 rounded-xl border-2 p-3 font-bold transition",
            decision === "reject" ? "border-rose-500 bg-rose-50 text-rose-800" : "hover:bg-muted",
          )}
        >
          <XCircle size={18} /> לא מתקבל
        </button>
      </div>
      <Button className="w-full" size="lg" onClick={send} disabled={busy || !decision}>
        {busy ? <Loader2 className="animate-spin" /> : <Send size={16} />} {review.status === "decided" ? "עדכון ההחלטה" : "שליחה"}
      </Button>
    </div>
  );
};

/* ------------------------------ section inside the student card ------------------------------ */

export const PrincipalCardSection = ({ family }: { family: Family }) => {
  const { can, profile } = useSession();
  const enabled = can.principalRequest || can.principalDecide;
  const { reviews } = usePrincipalReviews(enabled);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const mine = reviews.filter((r) => r.student_id === family.id);
  const pending = mine.find((r) => r.status === "pending");
  const last = mine.find((r) => r.status === "decided");
  if (!enabled) return null;

  const send = async () => {
    setBusy(true);
    try {
      await requestPrincipalReview(family.id, note);
      toast.success("נשלח להחלטת מנהל");
      setAsking(false);
      setNote("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-bold text-muted-foreground tracking-wider flex items-center gap-1">
        <Gavel size={13} /> החלטת מנהל
      </h3>
      {last && (
        <div className="rounded-xl border p-3 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <DecisionBadge d={last.decision} />
            <span className="text-xs text-muted-foreground">
              {last.decided_by_name} · {fmt(last.decided_at)}
            </span>
          </div>
          {last.summary && <p className="text-sm whitespace-pre-wrap">{last.summary}</p>}
        </div>
      )}
      {pending ? (
        can.principalDecide ? (
          <DecisionForm review={pending} />
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
            <Clock size={15} className="text-amber-700" /> ממתין להחלטת מנהל · נשלח ע״י {pending.requested_by_name} · {fmt(pending.requested_at)}
            {can.principalRequest && (pending.requested_by === profile?.user_id || can.isAdmin) && (
              <Button size="sm" variant="ghost" className="ms-auto h-7" onClick={() => cancelPrincipalReview(pending.id).catch((e) => toast.error(String(e?.message ?? e)))}>
                ביטול השליחה
              </Button>
            )}
          </div>
        )
      ) : (
        can.principalRequest &&
        (asking ? (
          <div className="rounded-xl border p-3 space-y-2 bg-muted/30">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="הערה למנהל (לא חובה)" maxLength={1000} />
            <div className="flex gap-2">
              <Button size="sm" onClick={send} disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <Send size={14} />} שליחה למנהל
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
                ביטול
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setAsking(true)}>
            <Gavel size={14} /> {last ? "שליחה שוב להחלטת מנהל" : "שליחה להחלטת מנהל"}
          </Button>
        ))
      )}
    </section>
  );
};

/* ------------------------------ the inbox screen ------------------------------ */

export const PrincipalView = ({ onOpenFamily }: { onOpenFamily: (id: string) => void }) => {
  const { can, profile } = useSession();
  const { reviews } = usePrincipalReviews(true);
  const { getFamily, updateFamily } = useCrm();
  const [openId, setOpenId] = useState<string | null>(null);

  const withFamily = (list: PrincipalReview[]) => list.filter((r) => getFamily(r.student_id));
  const pending = withFamily(reviews.filter((r) => r.status === "pending"));
  const decided = withFamily(reviews.filter((r) => r.status === "decided"));
  const myDecisions = decided.filter((r) => r.decided_by === profile?.user_id);
  const unseen = decided.filter((r) => !r.seen_at);
  const def = can.principalDecide ? "decide" : "answers";
  const open = reviews.find((r) => r.id === openId) ?? null;
  const openFamily = open ? getFamily(open.student_id) : undefined;

  const applyOutcome = async (r: PrincipalReview) => {
    if (!r.decision) return;
    try {
      await updateFamily(r.student_id, { outcome: r.decision === "accept" ? "accepted" : "rejected" });
      if (!r.seen_at) await markReviewSeen(r.id);
      toast.success(`עודכן בכרטיס: ${r.decision === "accept" ? "התקבל" : "לא התקבל"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const Row = ({ r, showDecision }: { r: PrincipalReview; showDecision?: boolean }) => {
    const f = getFamily(r.student_id)!;
    return (
      <div className={cn("rounded-xl border p-3 flex flex-wrap items-center gap-3", showDecision && !r.seen_at && "border-primary bg-primary/5")}>
        <StudentAvatar photoUrl={f.photoUrl} photoPath={f.photoPath} name={f.studentName} className="size-10 rounded-xl bg-muted border" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">{f.studentName}</div>
          <div className="text-xs text-muted-foreground">
            {GRADE_LABEL[f.grade]}
            {f.registrationTrack ? ` · ${REGISTRATION_TRACK_LABELS[f.registrationTrack] ?? ""}` : ""} ·{" "}
            {showDecision ? `${r.decided_by_name} · ${fmt(r.decided_at)}` : `נשלח ע״י ${r.requested_by_name ?? "—"} · ${fmt(r.requested_at)}`}
          </div>
          {showDecision && r.summary && <p className="text-sm mt-1 whitespace-pre-wrap line-clamp-3">{r.summary}</p>}
        </div>
        {showDecision && <DecisionBadge d={r.decision} />}
        <div className="flex flex-wrap gap-1.5">
          {!showDecision && can.principalDecide && (
            <Button size="sm" onClick={() => setOpenId(r.id)}>
              <Gavel size={14} /> לפתיחה ולהחלטה
            </Button>
          )}
          {showDecision && can.principalRequest && can.status && f.outcome !== (r.decision === "accept" ? "accepted" : "rejected") && (
            <Button size="sm" variant="outline" onClick={() => applyOutcome(r)}>
              עדכן בכרטיס: {r.decision === "accept" ? "התקבל" : "לא התקבל"}
            </Button>
          )}
          {showDecision && !r.seen_at && can.principalRequest && (
            <Button size="sm" variant="ghost" onClick={() => markReviewSeen(r.id).catch(() => undefined)}>
              <Eye size={14} /> סמן כנקרא
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => onOpenFamily(f.id)}>
            <ExternalLink size={14} /> כרטיס
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      <header className="flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-soft">
          <Gavel className="text-primary-foreground" size={22} />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold">החלטות מנהל</h1>
          <p className="text-muted-foreground text-sm">
            {can.principalDecide ? "תלמידים שנשלחו אליך להחלטה: פותחים, כותבים סיכום, ובוחרים מתקבל / לא מתקבל." : "התשובות של המנהלים על התלמידים ששלחתם."}
          </p>
        </div>
      </header>

      {open && openFamily ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
          <div className="card-elev p-5">
            <StudentSheet family={openFamily} />
          </div>
          <div className="space-y-3">
            {can.principalDecide && <DecisionForm review={open} onDone={() => setOpenId(null)} />}
            <Button variant="outline" className="w-full" onClick={() => setOpenId(null)}>
              חזרה לרשימה
            </Button>
          </div>
        </div>
      ) : (
        <Tabs defaultValue={def} dir="rtl">
          <TabsList>
            {can.principalDecide && <TabsTrigger value="decide">ממתינים להחלטה ({pending.length})</TabsTrigger>}
            {can.principalDecide && <TabsTrigger value="mine">החלטות שלי ({myDecisions.length})</TabsTrigger>}
            {can.principalRequest && <TabsTrigger value="answers">תשובות המנהל{unseen.length ? ` (${unseen.length} חדשות)` : ""}</TabsTrigger>}
            {can.principalRequest && <TabsTrigger value="sent">ממתינים לתשובה ({pending.length})</TabsTrigger>}
          </TabsList>
          {can.principalDecide && (
            <TabsContent value="decide" className="space-y-2 mt-4">
              {pending.length === 0 && <Empty text="אין תלמידים שממתינים להחלטה 🎉" />}
              {pending.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </TabsContent>
          )}
          {can.principalDecide && (
            <TabsContent value="mine" className="space-y-2 mt-4">
              {myDecisions.length === 0 && <Empty text="עוד לא נשלחו החלטות" />}
              {myDecisions.map((r) => (
                <div key={r.id} className="space-y-1">
                  <Row r={r} showDecision />
                  <button className="text-xs text-primary hover:underline" onClick={() => setOpenId(r.id)}>
                    עריכת ההחלטה
                  </button>
                </div>
              ))}
            </TabsContent>
          )}
          {can.principalRequest && (
            <TabsContent value="answers" className="space-y-2 mt-4">
              {decided.length === 0 && <Empty text="עוד אין תשובות מהמנהל" />}
              {decided.map((r) => (
                <Row key={r.id} r={r} showDecision />
              ))}
            </TabsContent>
          )}
          {can.principalRequest && (
            <TabsContent value="sent" className="space-y-2 mt-4">
              {pending.length === 0 && <Empty text="אין תלמידים שממתינים לתשובה" />}
              {pending.map((r) => (
                <Row key={r.id} r={r} />
              ))}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
};

const Empty = ({ text }: { text: string }) => (
  <div className="py-12 text-center text-muted-foreground">
    <Inbox className="mx-auto mb-2 opacity-50" />
    {text}
  </div>
);

/* ------------------------------ badge + popups ------------------------------ */

/** Sidebar count: decider → pending; sender → decisions not yet read. */
export const usePrincipalBadge = () => {
  const { can } = useSession();
  const { reviews } = usePrincipalReviews(can.principalRequest || can.principalDecide);
  return useMemo(() => {
    if (can.principalDecide) return reviews.filter((r) => r.status === "pending").length;
    if (can.principalRequest) return reviews.filter((r) => r.status === "decided" && !r.seen_at).length;
    return 0;
  }, [reviews, can.principalDecide, can.principalRequest]);
};

/** Popups: a new student for the principal; a decision back to the registration staff. */
export const PrincipalAlerts = ({ onOpenFamily, onOpenInbox }: { onOpenFamily: (id: string) => void; onOpenInbox: () => void }) => {
  const { can, profile } = useSession();
  const { getFamily } = useCrm();
  useEffect(() => {
    if (!profile?.user_id || !(can.principalDecide || can.principalRequest)) return;
    const ch = supabase
      .channel(`principal-alerts-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "principal_reviews" }, (p) => {
        const r = p.new as PrincipalReview;
        const old = p.old as Partial<PrincipalReview>;
        const name = getFamily(r?.student_id)?.studentName ?? "תלמיד";
        if (p.eventType === "INSERT" && can.principalDecide && r.requested_by !== profile.user_id) {
          toast.info(`תלמיד חדש ממתין להחלטתך: ${name}`, {
            description: r.request_note ?? `נשלח ע״י ${r.requested_by_name ?? ""}`,
            action: { label: "לפתיחה", onClick: onOpenInbox },
            duration: 20000,
          });
        }
        if (p.eventType === "UPDATE" && r.status === "decided" && old?.decided_at !== r.decided_at && can.principalRequest && r.decided_by !== profile.user_id) {
          toast.success(`החלטת מנהל: ${name} — ${r.decision ? DECISION_LABELS[r.decision] : ""}`, {
            description: (r.summary ?? "").slice(0, 160),
            action: { label: "פתח כרטיס", onClick: () => onOpenFamily(r.student_id) },
            duration: 30000,
          });
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [profile?.user_id, can.principalDecide, can.principalRequest, getFamily, onOpenFamily, onOpenInbox]);
  return null;
};
