import { useMemo, useState } from "react";
import { useCan } from "@/lib/session";
import { Calendar, Users, AlertTriangle, Clock, Phone, UserPlus, MapPin, CalendarX, CheckCircle2, ArrowLeft } from "lucide-react";
import { useCrm } from "@/store/crmStore";
import { GRADE_LABEL, STAGE_LABELS, STATION_ORDER, RegistrationTrack, getMissingDocuments } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatPhone } from "@/lib/whatsapp";
import { hebrewDate, isSameDay } from "@/lib/dates";
import { SearchBar, matchesSearch, matchesTrack } from "./SearchBar";
import { RecentActivity } from "./RecentActivity";
import { TodayTasks } from "./TodayTasks";
import type { View } from "./Sidebar";
import { WhatsAppQueue } from "./WhatsAppQueue";
import { Send } from "lucide-react";
import { addDays, startOfDay } from "@/lib/dates";

interface Props {
  onOpenFamily: (id: string) => void;
  onAddStudent: () => void;
  onNavigate?: (v: View) => void;
}

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return "בוקר טוב";
  if (h < 17) return "צהריים טובים";
  if (h < 21) return "ערב טוב";
  return "לילה טוב";
};

export const Dashboard = ({ onOpenFamily, onAddStudent, onNavigate }: Props) => {
  const { families, appointments, getFamily } = useCrm();
  const can = useCan();
  const [search, setSearch] = useState("");
  const [trackFilter, setTrackFilter] = useState<RegistrationTrack | "all">("all");
  const [queue, setQueue] = useState<null | "tomorrow" | "docs">(null);

  const filteredFamilies = useMemo(
    () => families.filter((f) => matchesSearch(f, search) && matchesTrack(f, trackFilter)),
    [families, search, trackFilter],
  );
  const filteredIds = useMemo(() => new Set(filteredFamilies.map((f) => f.id)), [filteredFamilies]);

  const today = new Date();
  const todayAppts = useMemo(
    () => appointments.filter((a) => isSameDay(new Date(a.date), today) && filteredIds.has(a.familyId)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appointments, filteredIds, today.toDateString()],
  );

  const inPipeline = filteredFamilies.filter((f) => f.stage !== "complete" && f.stage !== "persuasion").length;
  const complete = filteredFamilies.filter((f) => f.stage === "complete").length;
  const missingDocs = useMemo(
    () =>
      filteredFamilies
        .filter((f) => f.stage !== "complete" && f.stage !== "persuasion" && f.stage !== "leads")
        .map((f) => ({ f, missing: getMissingDocuments(f).length }))
        .filter((x) => x.missing > 0)
        .sort((a, b) => b.missing - a.missing),
    [filteredFamilies],
  );
  const reschedule = filteredFamilies.filter((f) => f.rsvpStatus === "reschedule_requested");
  const tomorrowFamilies = useMemo(() => {
    const t = addDays(startOfDay(new Date()), 1);
    return appointments
      .filter((a) => isSameDay(new Date(a.date), t))
      .map((a) => getFamily(a.familyId))
      .filter((f): f is NonNullable<typeof f> => !!f && !f.isArchived);
  }, [appointments, getFamily]);

  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold">{greeting()}, צוות הרישום 👋</h2>
          <p className="text-muted-foreground mt-1">
            {today.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })} · {hebrewDate(today)}
          </p>
        </div>
        {can.edit && (
          <Button size="lg" onClick={onAddStudent} className="shadow-soft gap-2">
            <UserPlus size={18} />
            הוסף תלמיד חדש
          </Button>
        )}
      </header>

      <SearchBar value={search} onChange={setSearch} trackFilter={trackFilter} onTrackFilterChange={setTrackFilter} />

      <div className={can.edit ? "flex flex-wrap gap-2" : "hidden"}>
        <Button variant="outline" className="bg-card" onClick={() => setQueue("tomorrow")} disabled={tomorrowFamilies.length === 0}>
          <Send size={16} className="text-[#25D366]" /> סבב תזכורות לפגישות מחר ({tomorrowFamilies.length})
        </Button>
        <Button variant="outline" className="bg-card" onClick={() => setQueue("docs")} disabled={missingDocs.length === 0}>
          <Send size={16} className="text-[#25D366]" /> סבב תזכורת מסמכים ({missingDocs.length})
        </Button>
      </div>
      <WhatsAppQueue
        open={queue !== null}
        onClose={() => setQueue(null)}
        title={queue === "docs" ? "מסמכים חסרים" : "פגישות מחר"}
        defaultTemplate={queue === "docs" ? "docs" : "meeting"}
        families={queue === "docs" ? missingDocs.map((x) => x.f) : tomorrowFamilies}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Calendar} label="פגישות היום" value={todayAppts.length} tone="info" onClick={() => onNavigate?.("calendar")} />
        <StatCard icon={Users} label="בתהליך רישום" value={inPipeline} tone="primary" onClick={() => onNavigate?.("kanban")} />
        <StatCard icon={AlertTriangle} label="חסרים מסמכים" value={missingDocs.length} tone="warning" onClick={() => onNavigate?.("students")} />
        <StatCard icon={CheckCircle2} label="השלימו רישום" value={complete} tone="success" onClick={() => onNavigate?.("stats")} />
      </div>

      {reschedule.length > 0 && (
        <section className="rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-4">
          <h3 className="font-display font-bold flex items-center gap-2 text-destructive mb-2">
            <CalendarX size={18} /> {reschedule.length} משפחות ביקשו מועד חדש — לחזור אליהן
          </h3>
          <div className="flex flex-wrap gap-2">
            {reschedule.slice(0, 12).map((f) => (
              <Button key={f.id} size="sm" variant="outline" className="bg-card" onClick={() => onOpenFamily(f.id)}>
                {f.studentName}
              </Button>
            ))}
            {reschedule.length > 12 && <span className="text-sm text-muted-foreground self-center">ועוד {reschedule.length - 12}</span>}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <section className="card-elev p-6 lg:col-span-3">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-bold flex items-center gap-2">
              <Calendar size={20} className="text-primary" /> פגישות היום
            </h3>
            <span className="text-sm text-muted-foreground">{todayAppts.length} פגישות</span>
          </div>
          {todayAppts.length === 0 ? (
            <EmptyState text="אין פגישות מתוכננות להיום" />
          ) : (
            <ul className="space-y-2 max-h-[560px] overflow-y-auto scrollbar-thin pe-1">
              {todayAppts.map((a) => {
                const f = getFamily(a.familyId);
                if (!f || f.isArchived) return null;
                const stationsDone = STATION_ORDER.filter((k) => f.stations?.[k]).length;
                const stationsPct = Math.round((stationsDone / STATION_ORDER.length) * 100);
                return (
                  <li
                    key={a.id}
                    onClick={() => onOpenFamily(f.id)}
                    className="group flex flex-col gap-3 p-3 rounded-xl border-2 border-primary/30 bg-primary-soft/40 hover:bg-primary-soft cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="size-12 rounded-xl bg-primary text-primary-foreground flex flex-col items-center justify-center shrink-0">
                        <Clock size={14} />
                        <span className="text-xs font-bold mt-0.5">{fmtTime(a.date)}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="font-semibold truncate">{f.studentName}</div>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary-foreground bg-primary px-2 py-0.5 rounded-md">
                            <MapPin size={10} /> נמצא היום במוסד
                          </span>
                          {f.rsvpStatus === "confirmed" && (
                            <span className="text-[10px] font-bold bg-success text-success-foreground px-2 py-0.5 rounded-md">אישר הגעה</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {GRADE_LABEL[f.grade]} · {f.parentNames}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground hidden sm:flex items-center gap-1" dir="ltr">
                        <Phone size={12} /> {formatPhone(f.phone)}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[11px] font-semibold text-muted-foreground">תחנות יום רישום</span>
                        <span className="text-[11px] font-bold">
                          {stationsDone}/{STATION_ORDER.length} · {stationsPct}%
                        </span>
                      </div>
                      <Progress value={stationsPct} className="h-2.5" />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="card-elev p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-bold flex items-center gap-2">
              <AlertTriangle size={20} className="text-warning" /> חסרים מסמכים
            </h3>
            <span className="text-sm text-muted-foreground">{missingDocs.length}</span>
          </div>
          {missingDocs.length === 0 ? (
            <EmptyState text="כל המסמכים תקינים 🎉" />
          ) : (
            <>
              <ul className="space-y-2">
                {missingDocs.slice(0, 7).map(({ f, missing }) => (
                  <li key={f.id} className="flex items-center justify-between p-3 rounded-xl border border-warning/20 bg-warning-soft/40">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{f.studentName}</div>
                      <div className="text-xs text-warning-foreground/80">
                        חסרים {missing} מסמכים · {STAGE_LABELS[f.stage]}
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => onOpenFamily(f.id)}>
                      פתח
                    </Button>
                  </li>
                ))}
              </ul>
              {missingDocs.length > 7 && onNavigate && (
                <Button variant="link" className="mt-2 px-0" onClick={() => onNavigate("students")}>
                  לכל {missingDocs.length} התלמידים ברשימה <ArrowLeft size={14} />
                </Button>
              )}
            </>
          )}
        </section>
      </div>

      <TodayTasks onOpenFamily={onOpenFamily} />

      <RecentActivity />
    </div>
  );
};

const StatCard = ({
  icon: Icon,
  label,
  value,
  tone,
  onClick,
}: {
  icon: typeof Calendar;
  label: string;
  value: number;
  tone: "info" | "primary" | "warning" | "success";
  onClick?: () => void;
}) => {
  const tones: Record<string, string> = {
    info: "bg-info-soft text-info",
    primary: "bg-primary-soft text-primary",
    warning: "bg-warning-soft text-warning",
    success: "bg-success-soft text-success",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className="card-elev p-5 flex items-center gap-4 text-right hover:-translate-y-0.5 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className={`size-14 rounded-2xl flex items-center justify-center shrink-0 ${tones[tone]}`}>
        <Icon size={26} />
      </div>
      <div>
        <div className="text-3xl font-display font-bold leading-none">{value.toLocaleString("he-IL")}</div>
        <div className="text-sm text-muted-foreground mt-1">{label}</div>
      </div>
    </button>
  );
};

const EmptyState = ({ text }: { text: string }) => <div className="py-10 text-center text-sm text-muted-foreground">{text}</div>;
