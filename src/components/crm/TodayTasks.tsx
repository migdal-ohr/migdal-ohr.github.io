import { useEffect, useMemo, useState } from "react";
import { useCrm } from "@/store/crmStore";
import { Family, GRADE_LABEL, getMissingDocuments } from "@/types/crm";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { WhatsAppActionButton } from "./WhatsAppActionButton";
import { buildMeetingReminderMessage, buildRemindDocsMessage, buildRsvpUrl, buildFollowUpMessage } from "@/lib/whatsapp";
import { addDays, isSameDay, startOfDay } from "@/lib/dates";
import { CalendarCheck, BellRing, FileWarning, HeartHandshake, ListTodo, ChevronDown, ChevronUp, CalendarX } from "lucide-react";

type Priority = 1 | 2 | 3 | 4 | 5;

interface Task {
  id: string;
  familyId: string;
  priority: Priority;
  title: string;
  subtitle?: string;
  messageBuilder?: (name: string) => string;
}

const DISMISS_KEY = () => `today-tasks-dismissed:${new Date().toDateString()}`;
const PER_GROUP = 8;

const PRIO_META: Record<Priority, { label: string; icon: typeof CalendarCheck; ring: string; badge: string }> = {
  1: { label: "ביקשו מועד חדש — לחזור אליהם", icon: CalendarX, ring: "border-destructive/40 bg-destructive/5", badge: "bg-destructive text-destructive-foreground" },
  2: { label: "פגישות היום", icon: CalendarCheck, ring: "border-primary/40 bg-primary-soft/40", badge: "bg-primary text-primary-foreground" },
  3: { label: "לוודא הגעה למחר", icon: BellRing, ring: "border-info/40 bg-info-soft/40", badge: "bg-info text-white" },
  4: { label: "מסמכים חסרים לפני הפגישה", icon: FileWarning, ring: "border-warning/40 bg-warning-soft/40", badge: "bg-warning text-warning-foreground" },
  5: { label: "זמן לשכנוע", icon: HeartHandshake, ring: "border-rose-300/50 bg-rose-50 dark:bg-rose-950/20", badge: "bg-rose-500 text-white" },
};

interface Props {
  onOpenFamily: (id: string) => void;
}

export const TodayTasks = ({ onOpenFamily }: Props) => {
  const { families, appointments } = useCrm();
  const [dismissed, setDismissed] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(DISMISS_KEY());
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  useEffect(() => {
    try {
      localStorage.setItem(DISMISS_KEY(), JSON.stringify(dismissed));
    } catch {
      /* ignore */
    }
  }, [dismissed]);

  const familyById = useMemo(() => {
    const m = new Map<string, Family>();
    families.forEach((f) => m.set(f.id, f));
    return m;
  }, [families]);

  const tasks = useMemo<Task[]>(() => {
    const today = startOfDay(new Date());
    const tomorrow = addDays(today, 1);
    const list: Task[] = [];
    const time = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

    for (const f of families) {
      if (f.rsvpStatus === "reschedule_requested") {
        list.push({
          id: `p1-${f.id}-${f.updatedAt ?? ""}`,
          familyId: f.id,
          priority: 1,
          title: f.studentName,
          subtitle: `${GRADE_LABEL[f.grade]} · ${f.parentNames}`,
        });
      }
    }

    for (const a of appointments) {
      const d = new Date(a.date);
      const f = familyById.get(a.familyId);
      if (!f) continue;
      const rsvp = buildRsvpUrl(f.rsvpToken);
      if (isSameDay(d, today)) {
        list.push({
          id: `p2-${a.id}`,
          familyId: f.id,
          priority: 2,
          title: `${f.studentName} · ${time(a.date)}`,
          subtitle: `${GRADE_LABEL[f.grade]} · ${f.parentNames}`,
          messageBuilder: (name) => buildMeetingReminderMessage(name, a.date, rsvp),
        });
      } else if (isSameDay(d, tomorrow) && (f.rsvpStatus ?? "pending") === "pending") {
        list.push({
          id: `p3-${a.id}`,
          familyId: f.id,
          priority: 3,
          title: `${f.studentName} — מחר בשעה ${time(a.date)}`,
          subtitle: "טרם אישרו הגעה",
          messageBuilder: (name) => buildMeetingReminderMessage(name, a.date, rsvp),
        });
      }
      if (d >= tomorrow && d < addDays(today, 8) && f.stage !== "complete" && f.stage !== "persuasion") {
        const missing = getMissingDocuments(f).map((m) => m.label);
        if (missing.length > 0) {
          list.push({
            id: `p4-${f.id}`,
            familyId: f.id,
            priority: 4,
            title: `${f.studentName} — ${missing.length} מסמכים חסרים`,
            subtitle: missing.slice(0, 3).join(" · ") + (missing.length > 3 ? "…" : ""),
            messageBuilder: (name) => buildRemindDocsMessage(name, missing),
          });
        }
      }
    }

    const load = list.length;
    const slots = load < 8 ? 3 : load < 15 ? 2 : 1;
    const weekMs = 7 * 86400000;
    families
      .filter((f) => f.stage === "persuasion")
      .filter((f) => Date.now() - +new Date(f.updatedAt ?? f.createdAt) > weekMs)
      .sort((a, b) => +new Date(a.updatedAt ?? a.createdAt) - +new Date(b.updatedAt ?? b.createdAt))
      .slice(0, slots)
      .forEach((f) =>
        list.push({
          id: `p5-${f.id}`,
          familyId: f.id,
          priority: 5,
          title: f.studentName,
          subtitle: f.hesitationReason || "לא צוינה סיבת היסוס — כדאי לברר",
          messageBuilder: (name) => buildFollowUpMessage(name, f.studentName),
        }),
      );

    return list;
  }, [appointments, families, familyById]);

  const visible = tasks.filter((t) => !dismissed[t.id]);
  const byPriority = useMemo(() => {
    const g: Record<Priority, Task[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
    for (const t of visible) g[t.priority].push(t);
    return g;
  }, [visible]);
  const doneCount = tasks.length - visible.length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 100;

  return (
    <section className="card-elev p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="size-10 rounded-xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-soft">
            <ListTodo size={20} />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold">המשימות להיום</h3>
            <p className="text-xs text-muted-foreground">רשימת פעולות חכמה המבוססת על נתוני המערכת</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block w-32">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[11px] text-muted-foreground mt-1 text-center">
              {doneCount}/{tasks.length} בוצעו
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? "הצג" : "כווץ"}>
            {collapsed ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </Button>
        </div>
      </div>

      {!collapsed &&
        (visible.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">🎉 סיימת את כל המשימות להיום — עבודה מצוינת!</div>
        ) : (
          <div className="space-y-5">
            {([1, 2, 3, 4, 5] as Priority[]).map((p) => {
              const group = byPriority[p];
              if (group.length === 0) return null;
              const meta = PRIO_META[p];
              const Icon = meta.icon;
              const shown = expanded[p] ? group : group.slice(0, PER_GROUP);
              return (
                <div key={p}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={cn("inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-md", meta.badge)}>
                      <Icon size={12} /> {meta.label}
                    </span>
                    <span className="text-xs text-muted-foreground">({group.length})</span>
                  </div>
                  <ul className="space-y-2">
                    {shown.map((t) => {
                      const f = familyById.get(t.familyId);
                      return (
                        <li key={t.id} className={cn("flex items-center gap-3 p-3 rounded-xl border-2 transition-all hover:shadow-card", meta.ring)}>
                          <Checkbox
                            checked={false}
                            onCheckedChange={() => setDismissed((d) => ({ ...d, [t.id]: true }))}
                            aria-label="סמן כבוצע"
                          />
                          <button type="button" onClick={() => onOpenFamily(t.familyId)} className="flex-1 min-w-0 text-right">
                            <div className="font-semibold truncate">{t.title}</div>
                            {t.subtitle && <div className="text-xs text-muted-foreground truncate mt-0.5">{t.subtitle}</div>}
                          </button>
                          {f && t.messageBuilder && (
                            <WhatsAppActionButton
                              fatherPhone={f.fatherPhone}
                              motherPhone={f.motherPhone}
                              message={(parent) =>
                                t.messageBuilder!(
                                  (parent === "father" ? f.fatherName : f.motherName) || f.parentNames || "הורים יקרים",
                                )
                              }
                              variant="card"
                              label="וואטסאפ"
                            />
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  {group.length > PER_GROUP && (
                    <Button variant="link" size="sm" onClick={() => setExpanded((e) => ({ ...e, [p]: !e[p] }))}>
                      {expanded[p] ? "הצג פחות" : `הצג את כל ${group.length}`}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        ))}
    </section>
  );
};
