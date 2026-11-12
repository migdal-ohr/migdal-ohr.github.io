import { memo, useMemo, useState, DragEvent } from "react";
import { useCan } from "@/lib/session";
import { useCrm } from "@/store/crmStore";
import {
  Family,
  Stage,
  STAGE_LABELS,
  STAGE_ORDER,
  STAGE_DOT,
  GRADE_LABEL,
  STATION_ORDER,
  REGISTRATION_TRACK_LABELS,
  REGISTRATION_TRACK_BADGE,
  RegistrationTrack,
} from "@/types/crm";
import {
  Phone,
  FileWarning,
  CheckCircle2,
  GripVertical,
  UserPlus,
  CalendarClock,
  MapPin,
  Maximize2,
  Archive,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/whatsapp";
import { WhatsAppActionButton } from "./WhatsAppActionButton";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScheduleMeetingPopover } from "./ScheduleMeetingPopover";
import { SearchBar, matchesSearch, matchesTrack } from "./SearchBar";
import { toast } from "sonner";

const isToday = (iso?: string) => !!iso && new Date(iso).toDateString() === new Date().toDateString();

interface Props {
  onOpenFamily: (id: string) => void;
  onAddStudent: () => void;
}

const COL_BG: Record<Stage, string> = {
  leads: "bg-col-leads",
  meeting: "bg-col-meeting",
  documents: "bg-col-docs",
  complete: "bg-col-done",
  persuasion: "bg-muted/30",
};

/** Rendering 1,400 rich cards at once is slow — show a page per column and grow on demand. */
const PAGE = 40;

const PALETTE = [
  "bg-blue-50 border-blue-200",
  "bg-green-50 border-green-200",
  "bg-yellow-50 border-yellow-200",
  "bg-purple-50 border-purple-200",
  "bg-pink-50 border-pink-200",
  "bg-orange-50 border-orange-200",
  "bg-teal-50 border-teal-200",
  "bg-indigo-50 border-indigo-200",
  "bg-rose-50 border-rose-200",
  "bg-cyan-50 border-cyan-200",
];

export const KanbanBoard = ({ onOpenFamily, onAddStudent }: Props) => {
  const { families, updateFamilyStage, getAppointment } = useCrm();
  const can = useCan();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Stage | null>(null);
  const [search, setSearch] = useState("");
  const [trackFilter, setTrackFilter] = useState<RegistrationTrack | "all">("all");
  const [expandedCol, setExpandedCol] = useState<Stage | null>(null);
  const [limits, setLimits] = useState<Record<string, number>>({});

  const grouped = useMemo(() => {
    const g: Record<Stage, Family[]> = { leads: [], meeting: [], documents: [], complete: [], persuasion: [] };
    families
      .filter((f) => matchesSearch(f, search) && matchesTrack(f, trackFilter))
      .forEach((f) => g[f.stage]?.push(f));
    // meetings first by date, then newest leads
    const key = (f: Family) => {
      const a = getAppointment(f.id);
      return a ? +new Date(a.date) : Number.MAX_SAFE_INTEGER - +new Date(f.createdAt);
    };
    for (const s of Object.keys(g) as Stage[]) g[s].sort((a, b) => key(a) - key(b));
    return g;
  }, [families, search, trackFilter, getAppointment]);

  const onDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const onDrop = (stage: Stage) => {
    if (dragId && !can.edit) {
      toast.error("אין לך הרשאה לשנות סטטוס");
    } else if (dragId) {
      const f = families.find((x) => x.id === dragId);
      if (f && f.stage !== stage) {
        updateFamilyStage(dragId, stage);
        toast.success(`${f.studentName} הועבר ל"${STAGE_LABELS[stage]}"`);
      }
    }
    setDragId(null);
    setOverCol(null);
  };

  return (
    <div className="animate-fade-in">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold">סטטוס תלמידים</h2>
          <p className="text-muted-foreground mt-1">גררו כרטיסים בין העמודות לעדכון סטטוס הרישום</p>
        </div>
        {can.edit && (
          <Button size="lg" onClick={onAddStudent} className="shadow-soft gap-2">
            <UserPlus size={18} />
            הוסף תלמיד חדש
          </Button>
        )}
      </header>

      <div className="mb-4">
        <SearchBar value={search} onChange={setSearch} trackFilter={trackFilter} onTrackFilterChange={setTrackFilter} />
      </div>

      <div className="flex md:grid md:grid-cols-2 xl:grid-cols-4 gap-4 overflow-x-auto md:overflow-visible snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        {STAGE_ORDER.map((stage) => {
          const list = grouped[stage];
          const limit = limits[stage] ?? PAGE;
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOverCol(stage);
              }}
              onDragLeave={() => setOverCol((c) => (c === stage ? null : c))}
              onDrop={() => onDrop(stage)}
              className={cn(
                "rounded-2xl border border-border p-3 flex flex-col max-h-[calc(100vh-14rem)] min-h-[60vh] transition-all snap-start shrink-0 w-[85vw] md:w-auto",
                COL_BG[stage],
                overCol === stage && "ring-2 ring-primary ring-offset-2 ring-offset-background",
              )}
            >
              <div className="flex items-center justify-between px-2 py-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2.5 rounded-full", STAGE_DOT[stage])} />
                  <h3 className="font-display font-bold text-base">{STAGE_LABELS[stage]}</h3>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold bg-card/80 rounded-full px-2.5 py-0.5 border border-border">{list.length}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    onClick={() => setExpandedCol(stage)}
                    aria-label="הרחב עמודה"
                    title="הרחב עמודה"
                  >
                    <Maximize2 className="size-3.5" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2 flex-1 overflow-y-auto scrollbar-thin pe-1">
                {list.slice(0, limit).map((f) => (
                  <FamilyCard
                    key={f.id}
                    family={f}
                    apptDate={getAppointment(f.id)?.date}
                    onOpen={onOpenFamily}
                    onDragStart={onDragStart}
                    dragging={dragId === f.id}
                  />
                ))}
                {list.length > limit && (
                  <Button
                    variant="ghost"
                    className="w-full"
                    onClick={() => setLimits((l) => ({ ...l, [stage]: limit + PAGE * 2 }))}
                  >
                    <ChevronDown size={16} /> הצג עוד ({list.length - limit})
                  </Button>
                )}
                {list.length === 0 && (
                  <div className="text-center text-xs text-muted-foreground py-8 border-2 border-dashed border-border/60 rounded-xl">
                    גררו לכאן כרטיס
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={expandedCol !== null} onOpenChange={(o) => !o && setExpandedCol(null)}>
        <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto" dir="rtl">
          {expandedCol && (
            <ExpandedColumn
              stage={expandedCol}
              list={grouped[expandedCol]}
              getDate={(id) => getAppointment(id)?.date}
              onOpen={(id) => {
                setExpandedCol(null);
                onOpenFamily(id);
              }}
              onDragStart={onDragStart}
              dragId={dragId}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const ExpandedColumn = ({
  stage,
  list,
  getDate,
  onOpen,
  onDragStart,
  dragId,
}: {
  stage: Stage;
  list: Family[];
  getDate: (id: string) => string | undefined;
  onOpen: (id: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
  dragId: string | null;
}) => {
  const [limit, setLimit] = useState(120);
  const groups = useMemo(() => {
    const m = new Map<string, { family: Family; apptDate?: string }[]>();
    for (const f of list) {
      const apptDate = getDate(f.id);
      const d = apptDate ? new Date(apptDate) : null;
      const k = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : "no-date";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push({ family: f, apptDate });
    }
    const keys = [...m.keys()].sort((a, b) => (a === "no-date" ? 1 : b === "no-date" ? -1 : a.localeCompare(b)));
    return keys.map((k) => ({
      key: k,
      items: m.get(k)!.sort((a, b) => (a.apptDate ? +new Date(a.apptDate) : Infinity) - (b.apptDate ? +new Date(b.apptDate) : Infinity)),
    }));
  }, [list, getDate]);

  let shown = 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-3 font-display text-2xl">
          <span className={cn("size-3 rounded-full", STAGE_DOT[stage])} />
          {STAGE_LABELS[stage]}
          <span className="text-sm font-semibold bg-muted text-muted-foreground rounded-full px-3 py-0.5">{list.length} תלמידים</span>
        </DialogTitle>
        <DialogDescription>מקובץ לפי תאריך הפגישה</DialogDescription>
      </DialogHeader>
      {list.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-12 border-2 border-dashed border-border/60 rounded-xl mt-4">
          אין תלמידים בעמודה זו
        </div>
      ) : (
        <div className="space-y-6 mt-4">
          {groups.map(({ key, items }, idx) => {
            if (shown >= limit) return null;
            const visible = items.slice(0, limit - shown);
            shown += visible.length;
            const colorClass = key === "no-date" ? "bg-muted/40 border-border" : PALETTE[idx % PALETTE.length];
            const header =
              key === "no-date"
                ? "ללא תאריך פגישה"
                : `תאריך: ${new Date(items[0].apptDate!).toLocaleDateString("he-IL", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })}`;
            return (
              <div key={key}>
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="font-display font-bold text-base">{header}</h4>
                  <span className="text-xs font-semibold bg-muted text-muted-foreground rounded-full px-2.5 py-0.5">{items.length}</span>
                </div>
                <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-3 rounded-xl border", colorClass)}>
                  {visible.map(({ family: f, apptDate }) => (
                    <FamilyCard key={f.id} family={f} apptDate={apptDate} onOpen={onOpen} onDragStart={onDragStart} dragging={dragId === f.id} />
                  ))}
                </div>
              </div>
            );
          })}
          {list.length > limit && (
            <Button variant="outline" className="w-full" onClick={() => setLimit((l) => l + 120)}>
              הצג עוד ({list.length - limit})
            </Button>
          )}
        </div>
      )}
    </>
  );
};

const FamilyCard = memo(
  ({
    family,
    apptDate,
    onOpen,
    onDragStart,
    dragging,
  }: {
    family: Family;
    apptDate?: string;
    onOpen: (id: string) => void;
    onDragStart: (e: DragEvent<HTMLDivElement>, id: string) => void;
    dragging: boolean;
  }) => {
    const { setArchived } = useCrm();
  const can = useCan();
    const docsTotal = Object.keys(family.documents).length;
    const docsDone = Object.values(family.documents).filter(Boolean).length;
    const allDocs = docsDone === docsTotal;
    const stationsTotal = STATION_ORDER.length;
    const stationsDone = STATION_ORDER.filter((k) => family.stations?.[k]).length;
    const stationsPct = Math.round((stationsDone / stationsTotal) * 100);
    const here = isToday(apptDate);

    const meetingLabel = apptDate
      ? `נקבע ל: ${new Date(apptDate).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit", year: "numeric" })} בשעה ${new Date(apptDate).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
      : null;

    return (
      <div
        draggable={can.edit}
        onDragStart={(e) => onDragStart(e, family.id)}
        onClick={() => onOpen(family.id)}
        role="group"
        aria-label={family.studentName}
        tabIndex={0}
        onKeyDown={(e) => e.target === e.currentTarget && e.key === "Enter" && onOpen(family.id)}
        className={cn(
          "group bg-card rounded-xl border border-border p-3 cursor-pointer hover:shadow-card transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          here && "ring-2 ring-primary border-primary/40 shadow-card",
          dragging && "opacity-40",
        )}
      >
        <div className="flex items-start gap-2">
          <GripVertical size={16} className="text-muted-foreground/40 mt-0.5 group-hover:text-muted-foreground transition-colors hidden md:block" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-semibold truncate">{family.studentName}</h4>
              <span className="text-[10px] font-bold bg-primary-soft text-primary px-2 py-0.5 rounded-md shrink-0">{GRADE_LABEL[family.grade]}</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {family.registrationTrack && (
                <span className={cn("inline-block text-[11px] font-bold px-2.5 py-1 rounded-md border", REGISTRATION_TRACK_BADGE[family.registrationTrack])}>
                  {REGISTRATION_TRACK_LABELS[family.registrationTrack]}
                </span>
              )}
              {family.rsvpStatus === "confirmed" && apptDate && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md bg-success text-success-foreground">
                  <CheckCircle2 size={12} /> אישר הגעה
                </span>
              )}
              {family.rsvpStatus === "reschedule_requested" && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md bg-destructive text-destructive-foreground">
                  <FileWarning size={12} /> ביקש מועד חדש
                </span>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-1.5 truncate">
              {family.parentNames}
              {family.city ? ` · ${family.city}` : ""}
            </p>

            {here && (
              <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-primary-foreground bg-primary px-2 py-1 rounded-md animate-pulse">
                <MapPin size={12} />
                נמצא היום במוסד
              </div>
            )}

            {family.phone && (
              <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                <Phone size={12} />
                <span dir="ltr">{formatPhone(family.phone)}</span>
              </div>
            )}

            {meetingLabel && (
              <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-primary bg-primary-soft px-2 py-1 rounded-md">
                <CalendarClock size={12} />
                <span>{meetingLabel}</span>
              </div>
            )}

            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-semibold text-muted-foreground">תחנות יום רישום</span>
                <span className="text-[10px] font-bold text-foreground">
                  {stationsDone}/{stationsTotal} · {stationsPct}%
                </span>
              </div>
              <Progress value={stationsPct} className={cn("h-2", here && "h-2.5")} />
            </div>

            <div className="mt-3 space-y-2">
              {allDocs ? (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-success bg-success-soft px-2 py-0.5 rounded-md">
                  <CheckCircle2 size={12} /> כל המסמכים
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-foreground bg-warning-soft px-2 py-0.5 rounded-md">
                  <FileWarning size={12} /> {docsDone}/{docsTotal} מסמכים
                </span>
              )}
              <div className={can.edit ? "flex items-center gap-1.5 flex-wrap" : "hidden"}>
                <WhatsAppActionButton
                  fatherPhone={family.fatherPhone}
                  motherPhone={family.motherPhone}
                  message=""
                  label="וואטסאפ"
                  variant="card"
                />
                <ScheduleMeetingPopover familyId={family.id} initialDate={apptDate} />
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  aria-label="העבר לארכיון"
                  title="העבר לארכיון"
                  onClick={async (e) => {
                    e.stopPropagation();
                    await setArchived(family.id, true);
                    toast.success(`${family.studentName} הועבר לארכיון`, {
                      action: { label: "בטל", onClick: () => setArchived(family.id, false) },
                    });
                  }}
                >
                  <Archive size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  },
);
FamilyCard.displayName = "FamilyCard";
