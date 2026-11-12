import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserPlus, KeyRound, Loader2, CalendarPlus, Save, Building2, Users, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/api";
import { useSession, ROLE_LABELS, ROLE_DESCRIPTIONS, Role, Profile } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ROLES: Role[] = ["admin", "manager", "secretary", "interviewer", "viewer"];

const genPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join("");
};

const callAdmin = async (body: Record<string, unknown>) => {
  const { data, error } = await supabase.functions.invoke("admin-users", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    try {
      const b = await ctx?.json();
      if (b?.error) throw new Error(b.error);
    } catch (e) {
      if (e instanceof Error && e.message) throw e;
    }
    throw new Error(error.message);
  }
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data;
};

/* =============================== Users =============================== */

const UsersTab = () => {
  const { profile: me } = useSession();
  const [users, setUsers] = useState<Profile[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [pwFor, setPwFor] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("user_id, email, full_name, role, is_active").order("created_at");
    if (error) toast.error(error.message);
    setUsers((data as Profile[]) ?? []);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const update = async (u: Profile, patch: Partial<Profile>) => {
    if (u.user_id === me?.user_id && (patch.role && patch.role !== "admin" || patch.is_active === false)) {
      toast.error("אי אפשר להוריד לעצמך את הרשאת המנהל");
      return;
    }
    const { error } = await supabase.from("profiles").update(patch).eq("user_id", u.user_id);
    if (error) toast.error(error.message);
    else {
      toast.success("עודכן");
      load();
    }
  };

  if (!users)
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-sm text-muted-foreground">{users.length} משתמשים. כל שינוי תפקיד נכנס לתוקף מיד בכל המחשבים.</p>
        <Button onClick={() => setCreateOpen(true)}>
          <UserPlus size={16} /> משתמש חדש
        </Button>
      </div>
      <div className="card-elev divide-y overflow-hidden">
        {users.map((u) => (
          <div key={u.user_id} className={cn("flex flex-wrap items-center gap-3 p-4", !u.is_active && "opacity-60")}>
            <div className="flex-1 min-w-[200px]">
              <Input
                defaultValue={u.full_name}
                placeholder="שם מלא"
                className="h-8 max-w-xs font-semibold"
                onBlur={(e) => e.target.value !== u.full_name && update(u, { full_name: e.target.value })}
              />
              <div className="text-xs text-muted-foreground mt-1" dir="ltr" style={{ textAlign: "right" }}>
                {u.email}
                {u.user_id === me?.user_id && " (את/ה)"}
              </div>
            </div>
            <Select value={u.role} onValueChange={(v) => update(u, { role: v as Role })}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={u.is_active} onCheckedChange={(c) => update(u, { is_active: c })} aria-label="פעיל" />
              {u.is_active ? "פעיל" : "מושבת"}
            </label>
            <Button size="sm" variant="ghost" onClick={() => setPwFor(u)}>
              <KeyRound size={14} /> סיסמה
            </Button>
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-4 bg-muted/30 text-sm space-y-1">
        <div className="font-semibold mb-1">מה כל תפקיד יכול לעשות</div>
        {ROLES.map((r) => (
          <div key={r}>
            <b>{ROLE_LABELS[r]}:</b> {ROLE_DESCRIPTIONS[r]}
          </div>
        ))}
      </div>
      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={load} />
      <PasswordDialog user={pwFor} onClose={() => setPwFor(null)} />
    </div>
  );
};

const CreateUserDialog = ({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) => {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("secretary");
  const [password, setPassword] = useState(genPassword());
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setEmail("");
      setName("");
      setRole("secretary");
      setPassword(genPassword());
      setDone(null);
    }
  }, [open]);

  const submit = async () => {
    setBusy(true);
    try {
      await callAdmin({ action: "create", email, full_name: name, role, password });
      setDone(`אימייל: ${email}\nסיסמה זמנית: ${password}`);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>משתמש חדש</DialogTitle>
          <DialogDescription>המשתמש יוכל להיכנס מיד עם הסיסמה הזמנית, ולהחליף אותה דרך "שכחתי סיסמה".</DialogDescription>
        </DialogHeader>
        {done ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-success font-semibold">
              <CheckCircle2 /> המשתמש נוצר. העבירו לו את הפרטים:
            </div>
            <pre className="bg-muted rounded-lg p-3 text-sm whitespace-pre-wrap" dir="ltr">
              {done}
            </pre>
            <Button
              className="w-full"
              onClick={() => {
                navigator.clipboard.writeText(done).catch(() => undefined);
                toast.success("הועתק");
              }}
            >
              העתק פרטים
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>שם מלא</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>אימייל</Label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" type="email" />
            </div>
            <div className="space-y-1">
              <Label>תפקיד</Label>
              <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</p>
            </div>
            <div className="space-y-1">
              <Label>סיסמה זמנית</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
            </div>
            <Button className="w-full" onClick={submit} disabled={busy || !email}>
              {busy && <Loader2 className="animate-spin" />} יצירת משתמש
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

const PasswordDialog = ({ user, onClose }: { user: Profile | null; onClose: () => void }) => {
  const [password, setPassword] = useState(genPassword());
  const [busy, setBusy] = useState(false);
  useEffect(() => setPassword(genPassword()), [user]);
  const submit = async () => {
    if (!user) return;
    setBusy(true);
    try {
      await callAdmin({ action: "set_password", user_id: user.user_id, password });
      navigator.clipboard.writeText(password).catch(() => undefined);
      toast.success("הסיסמה עודכנה והועתקה");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>סיסמה חדשה</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <Input value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
        <Button onClick={submit} disabled={busy || password.length < 8}>
          {busy && <Loader2 className="animate-spin" />} קביעת סיסמה
        </Button>
      </DialogContent>
    </Dialog>
  );
};

/* =============================== Years =============================== */

const YearsTab = () => {
  const { years, reloadYears, setYearId, yearId } = useSession();
  const [name, setName] = useState("");
  const [carry, setCarry] = useState(true);
  const [busy, setBusy] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    (async () => {
      const out: Record<string, number> = {};
      for (const y of years) {
        const { count } = await supabase.from("students").select("id", { count: "exact", head: true }).eq("school_year_id", y.id);
        out[y.id] = count ?? 0;
      }
      setCounts(out);
    })();
  }, [years]);

  const start = async () => {
    if (!name.trim()) return;
    if (!window.confirm(`לפתוח שנת רישום "${name}"? היא תהפוך לשנה הנוכחית${carry ? ", ותלמידים שלא סיימו רישום יועברו אליה" : ""}.`)) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("start_school_year", { p_name: name.trim(), p_carry_over: carry });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`נפתחה שנת רישום ${name}`);
    setName("");
    await reloadYears();
    if (data) setYearId(String(data));
  };

  return (
    <div className="space-y-5">
      <div className="card-elev divide-y overflow-hidden">
        {years.map((y) => (
          <div key={y.id} className="flex items-center gap-3 p-4">
            <div className="flex-1">
              <div className="font-display font-bold text-lg">{y.name}</div>
              <div className="text-xs text-muted-foreground">{counts[y.id] ?? "…"} תלמידים</div>
            </div>
            {y.is_current && <span className="text-xs font-bold bg-success text-success-foreground rounded-full px-3 py-1">שנה נוכחית</span>}
            <Button size="sm" variant={y.id === yearId ? "default" : "outline"} onClick={() => setYearId(y.id)}>
              {y.id === yearId ? "מוצגת עכשיו" : "הצג"}
            </Button>
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-4 space-y-3 bg-muted/30">
        <div className="font-semibold flex items-center gap-2">
          <CalendarPlus size={18} className="text-primary" /> פתיחת שנת רישום חדשה
        </div>
        <p className="text-sm text-muted-foreground">
          כל שנה נשמרת בנפרד, ואפשר לחזור ולצפות בשנים קודמות בכל רגע. מומלץ לפתוח שנה חדשה כשמתחיל הרישום לשנה הבאה.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <div className="space-y-1">
            <Label>שם השנה</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='לדוגמה: תשפ"ט' className="w-40" />
          </div>
          <label className="flex items-center gap-2 text-sm pb-2">
            <Switch checked={carry} onCheckedChange={setCarry} />
            להעביר תלמידים שלא סיימו רישום
          </label>
          <Button onClick={start} disabled={busy || !name.trim()}>
            {busy && <Loader2 className="animate-spin" />} פתיחה
          </Button>
        </div>
      </div>
    </div>
  );
};

/* =============================== Settings =============================== */

const SettingsTab = () => {
  const { settings, reloadSettings } = useSession();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(settings), [settings]);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("app_settings").upsert({ key: "institution", value: form });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("ההגדרות נשמרו");
    reloadSettings();
  };
  const field = (k: keyof typeof form, label: string, hint?: string) => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
  return (
    <div className="max-w-lg space-y-4">
      {field("name", "שם המוסד")}
      {field("city", "עיר")}
      {field("address", "כתובת לפגישות", "מופיעה בתזכורות הוואטסאפ לפגישה")}
      {field("signature", "חתימה בהודעות", 'מופיעה בסוף כל הודעה, אחרי "בברכה,"')}
      <Button onClick={save} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Save size={16} />} שמירה
      </Button>
    </div>
  );
};

/* =============================== View =============================== */

export const AdminView = () => {
  const { can } = useSession();
  const demo = isDemoMode();
  const def = can.manageUsers ? "users" : "years";
  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-soft">
          <ShieldCheck size={22} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold">ניהול מערכת</h2>
          <p className="text-muted-foreground mt-1">משתמשים והרשאות, שנות רישום והגדרות המוסד</p>
        </div>
      </header>
      {demo && <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm">במצב הדגמה מסך הניהול מוצג לצפייה בלבד.</div>}
      <Tabs defaultValue={def} dir="rtl">
        <TabsList>
          {can.manageUsers && (
            <TabsTrigger value="users">
              <Users size={14} className="me-1" /> משתמשים
            </TabsTrigger>
          )}
          {can.manageYears && (
            <TabsTrigger value="years">
              <CalendarPlus size={14} className="me-1" /> שנות רישום
            </TabsTrigger>
          )}
          {can.settings && (
            <TabsTrigger value="settings">
              <Building2 size={14} className="me-1" /> הגדרות מוסד
            </TabsTrigger>
          )}
        </TabsList>
        {!demo && can.manageUsers && (
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        )}
        {!demo && can.manageYears && (
          <TabsContent value="years">
            <YearsTab />
          </TabsContent>
        )}
        {!demo && can.settings && (
          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
};
