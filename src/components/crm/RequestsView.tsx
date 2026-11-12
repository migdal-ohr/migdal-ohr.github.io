import { useCallback, useEffect, useMemo, useState } from "react";
import { MessageSquarePlus, Bug, Lightbulb, HelpCircle, Loader2, Send, ArrowUpCircle, Inbox, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/api";
import { useSession, ROLE_LABELS, Role } from "@/lib/session";
import {
  StaffRequest,
  RequestKind,
  RequestStatus,
  KIND_LABELS,
  STATUS_LABELS,
  handledLevel,
  routeFor,
} from "@/lib/requests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AssistantChat } from "@/components/crm/AssistantChat";

const KIND_ICON: Record<RequestKind, typeof Bug> = { bug: Bug, feature: Lightbulb, question: HelpCircle };
const KIND_STYLE: Record<RequestKind, string> = {
  bug: "bg-red-50 text-red-700 border-red-200",
  feature: "bg-amber-50 text-amber-800 border-amber-200",
  question: "bg-sky-50 text-sky-700 border-sky-200",
};
const STATUS_STYLE: Record<RequestStatus, string> = {
  new: "bg-primary/10 text-primary",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  rejected: "bg-muted text-muted-foreground",
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", year: "2-digit", hour: "2-digit", minute: "2-digit" });

const NewRequestForm = ({ onSent }: { onSent: () => void }) => {
  const { role } = useSession();
  const [kind, setKind] = useState<RequestKind>("bug");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const goesTo = routeFor(role) === "admin" ? "מנהל המערכת" : "מנהלת הרישום";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim().length < 2) return toast.error("כתבו נושא קצר");
    setSaving(true);
    const { error } = await supabase.from("requests").insert({ kind, title: title.trim(), body: body.trim() });
    setSaving(false);
    if (error) return toast.error("השליחה נכשלה, נסו שוב");
    toast.success(`הפנייה נשלחה ל${goesTo}`);
    setTitle("");
    setBody("");
    onSent();
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border bg-card p-5 space-y-4 shadow-soft">
      <div className="flex items-center gap-2 font-display font-bold text-lg">
        <MessageSquarePlus className="text-primary" size={20} /> פנייה חדשה
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {(Object.keys(KIND_LABELS) as RequestKind[]).map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-medium transition",
                kind === k ? KIND_STYLE[k] + " ring-2 ring-offset-1 ring-current/20" : "hover:bg-muted",
              )}
            >
              <Icon size={16} /> {KIND_LABELS[k]}
            </button>
          );
        })}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="req-title">נושא</Label>
        <Input
          id="req-title"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={kind === "bug" ? "לדוגמה: כפתור ההדפסה לא עובד" : kind === "feature" ? "לדוגמה: להוסיף שדה קופת חולים" : "לדוגמה: איך מעבירים תלמיד לשנה הבאה?"}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="req-body">פירוט (לא חובה)</Label>
        <Textarea
          id="req-body"
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="מה קרה, באיזה מסך, ומה הייתם רוצים שיקרה"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">הפנייה תגיע ל{goesTo}</span>
        <Button disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : <Send size={16} />} שליחה
        </Button>
      </div>
    </form>
  );
};

const RequestCard = ({ r, canHandle, isAdmin, onChanged }: { r: StaffRequest; canHandle: boolean; isAdmin: boolean; onChanged: () => void }) => {
  const Icon = KIND_ICON[r.kind];
  const [response, setResponse] = useState(r.response ?? "");
  const [version, setVersion] = useState(r.version ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setResponse(r.response ?? "");
    setVersion(r.version ?? "");
  }, [r.response, r.version]);

  const save = async (patch: Partial<StaffRequest>, msg: string) => {
    setBusy(true);
    const { error } = await supabase.from("requests").update(patch).eq("id", r.id);
    setBusy(false);
    if (error) return toast.error("השמירה נכשלה");
    toast.success(msg);
    onChanged();
  };

  const editable = canHandle && (isAdmin || r.level === "manager");

  return (
    <div className="rounded-2xl border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-medium", KIND_STYLE[r.kind])}>
            <Icon size={13} /> {KIND_LABELS[r.kind]}
          </span>
          <h4 className="font-bold truncate">{r.title}</h4>
        </div>
        <div className="flex items-center gap-2">
          {r.level === "admin" && (
            <span className="text-xs rounded-lg bg-violet-100 text-violet-800 px-2 py-0.5">אצל מנהל המערכת</span>
          )}
          <span className={cn("text-xs rounded-lg px-2 py-0.5 font-medium", STATUS_STYLE[r.status])}>{STATUS_LABELS[r.status]}</span>
        </div>
      </div>
      {r.body && <p className="text-sm whitespace-pre-wrap text-foreground/90">{r.body}</p>}
      <p className="text-xs text-muted-foreground">
        {r.author_name ?? "—"}
        {r.author_role ? ` · ${ROLE_LABELS[r.author_role as Role] ?? r.author_role}` : ""} · {fmt(r.created_at)}
      </p>

      {!editable && (r.response || r.version) && (
        <div className="rounded-xl bg-muted/60 p-3 text-sm space-y-1">
          {r.response && <p className="whitespace-pre-wrap">{r.response}</p>}
          <p className="text-xs text-muted-foreground">
            {r.handled_by ? `טופל ע״י ${r.handled_by}` : ""}
            {r.version ? ` · נוסף בגרסה ${r.version}` : ""}
          </p>
        </div>
      )}

      {editable && (
        <div className="rounded-xl bg-muted/40 p-3 space-y-3">
          <Textarea rows={2} value={response} onChange={(e) => setResponse(e.target.value)} placeholder="תשובה למי שפנה (תופיע אצלו)" />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={r.status} onValueChange={(v) => save({ status: v as RequestStatus, response: response || null }, "הסטטוס עודכן")}>
              <SelectTrigger className="w-36" aria-label="סטטוס">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as RequestStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isAdmin && (
              <Input className="w-32" dir="ltr" placeholder="גרסה (3.1.0)" value={version} onChange={(e) => setVersion(e.target.value)} aria-label="גרסה" />
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => save({ response: response.trim() || null, ...(isAdmin ? { version: version.trim() || null } : {}) }, "נשמר")}
            >
              {busy ? <Loader2 className="animate-spin" /> : <CheckCircle2 size={15} />} שמירה
            </Button>
            {!isAdmin && r.level === "manager" && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => save({ level: "admin", response: response.trim() || null }, "הועבר למנהל המערכת")}>
                <ArrowUpCircle size={15} /> העבר למנהל המערכת
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const RequestsView = () => {
  const { role, profile } = useSession();
  const demo = isDemoMode();
  const level = handledLevel(role);
  const isAdmin = role === "admin";
  const [rows, setRows] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(!demo);
  const [filter, setFilter] = useState<"open" | "all">("open");

  const load = useCallback(async () => {
    if (demo) return;
    const { data, error } = await supabase.from("requests").select("*").order("created_at", { ascending: false }).limit(500);
    if (!error) setRows((data ?? []) as StaffRequest[]);
    setLoading(false);
  }, [demo]);

  useEffect(() => {
    load();
    if (demo) return;
    const ch = supabase
      .channel(`requests-view-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load, demo]);

  const mine = useMemo(() => rows.filter((r) => r.author_id === profile?.user_id), [rows, profile]);
  // "waiting for me": open, and at my level (a manager's escalated items are the admin's now)
  const isOpenForMe = useCallback(
    (r: StaffRequest) => (r.status === "new" || r.status === "in_progress") && (isAdmin || r.level === "manager"),
    [isAdmin],
  );
  const toHandle = useMemo(
    () => rows.filter((r) => r.author_id !== profile?.user_id).filter((r) => (filter === "open" ? isOpenForMe(r) : true)),
    [rows, profile, filter, isOpenForMe],
  );
  const openCount = rows.filter((r) => r.author_id !== profile?.user_id && isOpenForMe(r)).length;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <header className="flex items-center gap-3">
        <div className="size-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-soft">
          <Inbox className="text-primary-foreground" size={22} />
        </div>
        <div>
          <h1 className="font-display text-3xl font-bold">בקשות ותקלות</h1>
          <p className="text-muted-foreground text-sm">יש שאלה? שאלו את העוזר. מצאתם תקלה או חסר משהו? שלחו פנייה.</p>
        </div>
      </header>

      {demo ? (
        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-sm">במצב הדגמה אי אפשר לשלוח פניות.</div>
      ) : loading ? (
        <div className="h-40 flex items-center justify-center">
          <Loader2 className="animate-spin text-primary" />
        </div>
      ) : (
        <Tabs defaultValue={level && openCount ? "handle" : "ask"} dir="rtl">
          <TabsList>
            <TabsTrigger value="ask">שאל את העוזר</TabsTrigger>
            <TabsTrigger value="mine">הפניות שלי ({mine.length})</TabsTrigger>
            {level && <TabsTrigger value="handle">לטיפולי ({openCount})</TabsTrigger>}
          </TabsList>
          <TabsContent value="ask" className="mt-4">
            <AssistantChat />
          </TabsContent>
          <TabsContent value="mine" className="space-y-4 mt-4">
            <NewRequestForm onSent={load} />
            {mine.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">עוד לא שלחת פניות.</p>
            ) : (
              mine.map((r) => <RequestCard key={r.id} r={r} canHandle={false} isAdmin={false} onChanged={load} />)
            )}
          </TabsContent>
          {level && (
            <TabsContent value="handle" className="space-y-4 mt-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  {isAdmin ? "כל הפניות במערכת: גם מה שהמזכירות שולחות למנהלת הרישום, וגם מה שמגיע ישר אליך." : "פניות של המזכירות והמראיינים. מה שצריך שינוי במערכת — העבירי למנהל המערכת."}
                </p>
                <Select value={filter} onValueChange={(v) => setFilter(v as "open" | "all")}>
                  <SelectTrigger className="w-32" aria-label="סינון">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">פתוחות</SelectItem>
                    <SelectItem value="all">הכל</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {toHandle.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-10">אין פניות פתוחות 🎉</p>
              ) : (
                toHandle.map((r) => <RequestCard key={r.id} r={r} canHandle isAdmin={isAdmin} onChanged={load} />)
              )}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
};
