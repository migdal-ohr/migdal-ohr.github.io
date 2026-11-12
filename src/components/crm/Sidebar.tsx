import { useMemo } from "react";
import { Logo } from "@/components/Logo";
import {
  LayoutDashboard,
  Kanban,
  CalendarDays,
  ScanLine,
  HeartHandshake,
  Archive,
  Users,
  BarChart3,
  Search,
  LogOut,
  FlaskConical,
  Link2,
  ShieldCheck,
  WifiOff,
  Inbox,
} from "lucide-react";
import { useOpenRequestsCount } from "@/lib/requests";
import { useSession, ROLE_LABELS } from "@/lib/session";
import { useOnline } from "@/lib/online";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { publicBaseUrl } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { useCrm } from "@/store/crmStore";
import { api } from "@/lib/api";
import { hebrewYear, isSameDay } from "@/lib/dates";

export type View = "dashboard" | "students" | "kanban" | "calendar" | "potentials" | "persuasion" | "stats" | "archive" | "requests" | "admin";

interface Props {
  view: View;
  onChange: (v: View) => void;
  onNavigate?: () => void;
  onOpenSearch?: () => void;
}

const items: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "לוח בקרה", icon: LayoutDashboard },
  { id: "students", label: "רשימת תלמידים", icon: Users },
  { id: "kanban", label: "סטטוס תלמידים", icon: Kanban },
  { id: "calendar", label: "לוח שנה", icon: CalendarDays },
  { id: "persuasion", label: "תלמידים לשכנוע", icon: HeartHandshake },
  { id: "potentials", label: "פוטנציאלים", icon: ScanLine },
  { id: "stats", label: "סטטיסטיקות", icon: BarChart3 },
  { id: "archive", label: "ארכיון", icon: Archive },
  { id: "requests", label: "בקשות ותקלות", icon: Inbox },
  { id: "admin", label: "ניהול מערכת", icon: ShieldCheck },
];

/** Registration season = the NEXT school year (registering in winter for September). */
const schoolYear = () => {
  const now = new Date();
  // from Jan the Hebrew year already equals next September's school year; in Sep–Dec it's one behind
  const target = now.getMonth() >= 8 ? new Date(now.getFullYear() + 1, 9, 15) : new Date(now.getFullYear(), 9, 15);
  const y = hebrewYear(target);
  return y ? `רישום לשנה״ל ${y}` : "רישום לשנת הלימודים";
};

export const SidebarContent = ({ view, onChange, onNavigate, onOpenSearch }: Props) => {
  const { families, archivedFamilies, appointments, backendKind } = useCrm();

  const counts = useMemo(() => {
    const today = new Date();
    return {
      students: families.length,
      kanban: families.filter((f) => f.stage !== "persuasion").length,
      persuasion: families.filter((f) => f.stage === "persuasion").length,
      archive: archivedFamilies.length,
      calendar: appointments.filter((a) => isSameDay(new Date(a.date), today)).length,
    } as Partial<Record<View, number>>;
  }, [families, archivedFamilies, appointments]);

  const { profile, role, can, years, yearId, setYearId, selectedYear } = useSession();
  const online = useOnline();
  const openRequests = useOpenRequestsCount(role, profile?.user_id);
  const visibleItems = items.filter((it) => it.id !== "admin" || can.manageYears || can.manageUsers);
  const complete = families.filter((f) => f.stage === "complete").length;
  const pct = families.length ? Math.round((complete / families.length) * 100) : 0;

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="p-6 border-b border-border">
        <div className="flex items-center gap-3">
          <Logo className="size-11" />
          <div>
            <h1 className="font-display font-bold text-lg leading-tight">רישום מגדל אור</h1>
            <p className="text-xs text-muted-foreground">ניהול רישום תלמידים</p>
          </div>
        </div>
        {!online && (
          <div className="mt-3 text-[11px] font-bold rounded-lg bg-destructive/10 text-destructive px-2 py-1 flex items-center gap-1">
            <WifiOff size={12} /> אין חיבור. מוצגים הנתונים האחרונים, ושינויים לא יישמרו
          </div>
        )}
        {backendKind === "demo" && (
          <div className="mt-3 text-[11px] font-bold rounded-lg bg-amber-100 text-amber-900 px-2 py-1 flex items-center gap-1">
            <FlaskConical size={12} /> מצב הדגמה — נתונים פיקטיביים
          </div>
        )}
      </div>
      {onOpenSearch && (
        <button
          type="button"
          onClick={() => {
            onOpenSearch();
            onNavigate?.();
          }}
          className="mx-3 mt-3 flex items-center gap-2 px-3 py-2 rounded-xl border border-border bg-muted/40 text-sm text-muted-foreground hover:bg-muted"
        >
          <Search size={16} />
          <span className="flex-1 text-right">חיפוש מהיר…</span>
          <kbd className="text-[10px] border rounded px-1 bg-card" dir="ltr">
            Ctrl K
          </kbd>
        </button>
      )}
      <nav className="p-3 flex-1 space-y-1 overflow-y-auto">
        {visibleItems.map((it) => {
          const Icon = it.icon;
          const active = view === it.id;
          const count = it.id === "requests" ? openRequests || undefined : counts[it.id];
          return (
            <button
              key={it.id}
              onClick={() => {
                onChange(it.id);
                onNavigate?.();
              }}
              aria-current={active ? "page" : undefined}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all",
                active ? "bg-primary text-primary-foreground shadow-soft" : "text-foreground/70 hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon size={18} />
              <span className="flex-1 text-right">{it.label}</span>
              {count !== undefined && count > 0 && (
                <span
                  className={cn(
                    "text-[11px] font-bold rounded-full px-2 py-0.5",
                    active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                  )}
                >
                  {count.toLocaleString("he-IL")}
                </span>
              )}
            </button>
          );
        })}
      </nav>
      <div className="p-4 m-3 rounded-xl bg-gradient-soft border border-border text-xs text-muted-foreground space-y-2">
        {years.length > 1 ? (
          <Select value={yearId ?? undefined} onValueChange={setYearId}>
            <SelectTrigger className="h-8 bg-card text-xs font-semibold" aria-label="שנת רישום">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y.id} value={y.id}>
                  רישום לשנה״ל {y.name}
                  {y.is_current ? " (נוכחית)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="font-semibold text-foreground">{selectedYear ? `רישום לשנה״ל ${selectedYear.name}` : schoolYear()}</div>
        )}
        {selectedYear && !selectedYear.is_current && <div className="text-warning-foreground font-semibold">צפייה בשנה קודמת</div>}
        <div className="flex justify-between">
          <span>השלימו רישום</span>
          <span className="font-bold text-foreground">
            {complete.toLocaleString("he-IL")} מתוך {families.length.toLocaleString("he-IL")}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-success" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <button
        type="button"
        onClick={async () => {
          const url = `${publicBaseUrl()}/register${backendKind === "demo" ? "?demo=1" : ""}`;
          try {
            await navigator.clipboard.writeText(url);
            toast.success("קישור טופס ההרשמה להורים הועתק — אפשר להדביק בוואטסאפ / פרסום", { description: url });
          } catch {
            toast.info(url);
          }
        }}
        className="mx-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-primary hover:bg-primary-soft"
      >
        <Link2 size={16} /> קישור לטופס הרשמה להורים
      </button>
      {profile && (
        <div className="mx-3 px-4 pt-2 text-[11px] text-muted-foreground">
          <span className="font-semibold text-foreground">{profile.full_name || profile.email}</span>
          {role && ` · ${ROLE_LABELS[role]}`}
        </div>
      )}
      <button
        type="button"
        onClick={() => api.signOut()}
        className="mx-3 mb-3 flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-muted-foreground hover:bg-muted"
      >
        <LogOut size={16} /> {backendKind === "demo" ? "יציאה ממצב הדגמה" : "התנתקות"}
      </button>
    </div>
  );
};

export const Sidebar = (props: Props) => (
  <aside className="hidden lg:flex w-64 shrink-0 border-l border-border flex-col sticky top-0 h-screen">
    <SidebarContent {...props} />
  </aside>
);
