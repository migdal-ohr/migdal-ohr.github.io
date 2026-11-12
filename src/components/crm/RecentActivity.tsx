import { useEffect, useState } from "react";
import {
  CheckCircle2,
  CalendarX,
  UserPlus,
  Pencil,
  Activity,
  Archive,
  RotateCcw,
  CalendarClock,
  ArrowLeftRight,
  Trash2,
  FileUp,
  Loader2,
  Globe,
  Paperclip,
  Send,
} from "lucide-react";
import { api } from "@/lib/api";
import type { ActivityLog } from "@/lib/activityLog";

const iconFor = (type: string) => {
  switch (type) {
    case "rsvp_confirmed":
      return { Icon: CheckCircle2, cls: "bg-success-soft text-success" };
    case "rsvp_reschedule":
      return { Icon: CalendarX, cls: "bg-destructive/10 text-destructive" };
    case "student_added":
      return { Icon: UserPlus, cls: "bg-primary-soft text-primary" };
    case "student_edited":
      return { Icon: Pencil, cls: "bg-info-soft text-info" };
    case "stage_changed":
      return { Icon: ArrowLeftRight, cls: "bg-accent text-accent-foreground" };
    case "meeting_set":
      return { Icon: CalendarClock, cls: "bg-primary-soft text-primary" };
    case "meeting_cleared":
      return { Icon: CalendarX, cls: "bg-muted text-muted-foreground" };
    case "student_archived":
      return { Icon: Archive, cls: "bg-muted text-muted-foreground" };
    case "student_restored":
      return { Icon: RotateCcw, cls: "bg-info-soft text-info" };
    case "student_deleted":
      return { Icon: Trash2, cls: "bg-destructive/10 text-destructive" };
    case "web_registration":
      return { Icon: Globe, cls: "bg-primary-soft text-primary" };
    case "document_uploaded":
      return { Icon: Paperclip, cls: "bg-success-soft text-success" };
    case "whatsapp_round":
      return { Icon: Send, cls: "bg-success-soft text-success" };
    case "import":
      return { Icon: FileUp, cls: "bg-primary-soft text-primary" };
    default:
      return { Icon: Activity, cls: "bg-muted text-muted-foreground" };
  }
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const actorName = (email?: string | null) => (email ? email.split("@")[0] : "");

/** Live list of activity — whole system, or one family when familyId is given. */
export const ActivityTimeline = ({ familyId, limit = 20 }: { familyId?: string; limit?: number }) => {
  const [logs, setLogs] = useState<ActivityLog[] | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .listActivity(limit, familyId)
      .then((rows) => mounted && setLogs(rows))
      .catch(() => mounted && setLogs([]));
    const unsub = api.subscribe({
      activity: (row) => {
        if (familyId && row.family_id !== familyId) return;
        setLogs((prev) => [row, ...(prev ?? []).filter((l) => l.id !== row.id)].slice(0, limit));
      },
    });
    return () => {
      mounted = false;
      unsub();
    };
  }, [familyId, limit]);

  if (logs === null)
    return (
      <div className="py-6 flex justify-center text-muted-foreground">
        <Loader2 className="animate-spin" size={18} />
      </div>
    );
  if (logs.length === 0) return <div className="py-8 text-center text-sm text-muted-foreground">אין פעילות עדיין</div>;

  return (
    <ul className="space-y-2 mt-2 max-h-[520px] overflow-y-auto scrollbar-thin pe-1">
      {logs.map((l) => {
        const { Icon, cls } = iconFor(l.action_type);
        return (
          <li key={l.id} className="flex items-start gap-3 p-3 rounded-xl border border-border bg-background/50">
            <div className={`size-9 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
              <Icon size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium leading-snug">{l.description}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {fmt(l.created_at)}
                {l.actor_email && ` · ${actorName(l.actor_email)}`}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export const RecentActivity = () => (
  <section className="card-elev p-6">
    <h3 className="font-display text-xl font-bold flex items-center gap-2 mb-2">
      <Activity size={20} className="text-primary" /> פעולות אחרונות
    </h3>
    <ActivityTimeline limit={20} />
  </section>
);
