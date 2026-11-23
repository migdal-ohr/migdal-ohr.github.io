import { useMemo, useState } from "react";
import { HebrewCalendar, HDate, flags } from "@hebcal/core";
import { ChevronRight, ChevronLeft, CalendarDays, Search, Check, X, CheckCircle2, AlertTriangle, Link2 } from "lucide-react";
import { useCrm } from "@/store/crmStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CalendarEvent, EVENT_KIND_COLOR, EVENT_KIND_LABELS, EventKind, Family, REGISTRATION_TRACK_LABELS } from "@/types/crm";
import { cn } from "@/lib/utils";
import { hebrewDate, isSameDay, toHebrewNumeral } from "@/lib/dates";
import { useEvents, updateEvent, useInstitutionsList } from "@/lib/api/extras";
import { isDemoMode } from "@/lib/api";
import { useSession } from "@/lib/session";
import { toast } from "sonner";
import { CalendarFeedButton } from "@/components/crm/CalendarFeed";

interface Props {
  onOpenFamily: (id: string) => void;
}

type Mode = "month" | "week" | "day";
const HEB_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];
const ALL_KINDS: EventKind[] = ["registration", "tour", "interview", "registration_day", "other"];

const stripNikud = (s: string) => s.replace(/[֑-ׇ]/g, "");
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const startOfWeek = (d: Date) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay());
  return x;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
/** Hebrew day-of-month in letters, e.g. "י״ג" */
const hebDay = (d: Date) => {
  try {
    return toHebrewNumeral(new HDate(d).getDate());
  } catch {
    return "";
  }
};

/** Holidays, Rosh Chodesh and the weekly parasha (Israel schedule) for a date range. */
const useJewishDays = (from: Date, to: Date) =>
  useMemo(() => {
    const map = new Map<string, { label: string; parasha: boolean; major: boolean }[]>();
    try {
      const evs = HebrewCalendar.calendar({ start: from, end: to, sedrot: true, il: true, noModern: false });
      for (const e of evs) {
        const f = e.getFlags();
        if (f & (flags.DAF_YOMI | flags.OMER_COUNT | flags.SHABBAT_MEVARCHIM | flags.MINOR_FAST)) continue;
        const k = dayKey(e.getDate().greg());
        const list = map.get(k) ?? [];
        list.push({
          label: stripNikud(e.render("he")).replace("פרשת ", "פ' "),
          parasha: !!(f & flags.PARSHA_HASHAVUA),
          major: !!(f & (flags.CHAG | flags.MAJOR_FAST)),
        });
        map.set(k, list);
      }
    } catch {
      /* calendar library unavailable — dates still work */
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from.getTime(), to.getTime()]);

export const CalendarView = ({ onOpenFamily }: Props) => {
  const { appointments, families } = useCrm();
  const { can } = useSession();
  const { events: liveEvents, setEvents } = useEvents();
  const { institutions } = useInstitutionsList();
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [kinds, setKinds] = useState<EventKind[]>(ALL_KINDS);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Date | null>(null);

  const familyById = useMemo(() => new Map(families.map((f) => [f.id, f])), [families]);
  const instName = (k?: string) => institutions.find((i) => i.key === k)?.name ?? (k ? REGISTRATION_TRACK_LABELS[k as keyof typeof REGISTRATION_TRACK_LABELS] ?? k : "");

  // demo mode has no events table: show the registration meetings from the store
  const events: CalendarEvent[] = useMemo(
    () =>
      isDemoMode()
        ? appointments.map((a) => ({ id: a.id, familyId: a.familyId, kind: "registration" as EventKind, date: a.date, type: a.type, attended: null }))
        : liveEvents,
    [appointments, liveEvents],
  );

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      const f = familyById.get(e.familyId);
      if (!f || !kinds.includes(e.kind)) return false;
      if (!needle) return true;
      const d = new Date(e.date);
      const hay = [f.studentName, instName(f.registrationTrack), EVENT_KIND_LABELS[e.kind], e.type, e.notes, d.toLocaleDateString("he-IL"), hebrewDate(d)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return needle.split(/\s+/).every((w) => hay.includes(w));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, familyById, kinds, q, institutions]);

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of [...visible].sort((a, b) => a.date.localeCompare(b.date))) {
      const k = dayKey(new Date(e.date));
      (m.get(k) ?? m.set(k, []).get(k)!).push(e);
    }
    return m;
  }, [visible]);

  /* ---------- range for the current mode ---------- */
  const range = useMemo(() => {
    if (mode === "day") {
      const d = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      return { from: d, to: d, days: [d] };
    }
    if (mode === "week") {
      const s = startOfWeek(cursor);
      const days = Array.from({ length: 7 }, (_, i) => addDays(s, i));
      return { from: s, to: days[6], days };
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const s = startOfWeek(first);
    const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const e = addDays(startOfWeek(last), 6);
    const days: Date[] = [];
    for (let d = s; d <= e; d = addDays(d, 1)) days.push(d);
    return { from: s, to: e, days };
  }, [mode, cursor]);
  const jewish = useJewishDays(range.from, range.to);

  const move = (dir: 1 | -1) => {
    const c = new Date(cursor);
    if (mode === "month") c.setMonth(c.getMonth() + dir, 1);
    else c.setDate(c.getDate() + (mode === "week" ? 7 : 1) * dir);
    setCursor(c);
  };
  const title =
    mode === "month"
      ? `${HEB_MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
      : mode === "week"
        ? `${range.from.toLocaleDateString("he-IL")} – ${range.to.toLocaleDateString("he-IL")}`
        : `יום ${WEEKDAYS[cursor.getDay()]}, ${cursor.toLocaleDateString("he-IL")}`;
  const hebTitle =
    mode === "month"
      ? (() => {
          const a = hebrewDate(range.days[7] ?? cursor).split(" ").slice(1, 2).join(" ");
          const b = hebrewDate(range.days[range.days.length - 8] ?? cursor);
          return `${a} – ${b.split(" ").slice(1).join(" ")}`;
        })()
      : hebrewDate(mode === "day" ? cursor : range.from);

  const inRange = visible.filter((e) => {
    const d = new Date(e.date);
    return mode === "month" ? d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear() : d >= range.from && d < addDays(range.to, 1);
  }).length;

  const mark = async (e: CalendarEvent, attended: boolean | null) => {
    const prev = events;
    setEvents(events.map((x) => (x.id === e.id ? { ...x, attended } : x)));
    try {
      await updateEvent(e.id, { attended });
    } catch (err) {
      setEvents(prev);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const EventLine = ({ e, compact = false }: { e: CalendarEvent; compact?: boolean }) => {
    const f = familyById.get(e.familyId) as Family;
    const rsvp = e.kind === "registration" ? f.rsvpStatus : undefined;
    return (
      <div className={cn("flex items-center gap-2 rounded-lg border px-2 py-1.5", EVENT_KIND_COLOR[e.kind], e.attended === false && "opacity-60 line-through")}>
        <button className="flex-1 min-w-0 text-right" onClick={() => onOpenFamily(f.id)}>
          <div className="flex items-center gap-1 text-sm font-semibold truncate">
            {fmtTime(e.date)} · {f.studentName}
            {rsvp === "confirmed" && <CheckCircle2 size={13} className="text-success shrink-0" />}
            {rsvp === "reschedule_requested" && <AlertTriangle size={13} className="text-destructive shrink-0" />}
            {e.attended === true && <Check size={13} className="shrink-0" />}
          </div>
          {!compact && (
            <div className="text-xs opacity-80 truncate">
              {EVENT_KIND_LABELS[e.kind]}
              {f.registrationTrack ? ` · ${instName(f.registrationTrack)}` : ""}
              {e.notes ? ` · ${e.notes}` : ""}
            </div>
          )}
        </button>
        {!compact && !isDemoMode() && (can.attendance || can.appointments) && (
          <span className="flex gap-1 shrink-0">
            <Button size="sm" variant={e.attended === true ? "default" : "outline"} className="h-7 px-2 text-xs" onClick={() => mark(e, e.attended === true ? null : true)}>
              <Check size={12} /> הגיע
            </Button>
            <Button size="sm" variant={e.attended === false ? "destructive" : "outline"} className="h-7 px-2 text-xs" onClick={() => mark(e, e.attended === false ? null : false)}>
              <X size={12} /> לא הגיע
            </Button>
          </span>
        )}
      </div>
    );
  };

  const DayLabels = ({ d }: { d: Date }) => (
    <>
      {(jewish.get(dayKey(d)) ?? []).map((j, i) => (
        <div key={i} className={cn("text-[10px] leading-tight truncate", j.major ? "text-rose-700 font-semibold" : j.parasha ? "text-violet-700" : "text-amber-700")}>
          {j.label}
        </div>
      ))}
    </>
  );

  const today = new Date();
  const selItems = selected ? byDay.get(dayKey(selected)) ?? [] : [];

  return (
    <div className="space-y-5 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" /> לוח שנה
          </h2>
          <p className="text-muted-foreground mt-1">
            {inRange} אירועים · {hebTitle}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl bg-muted p-1" role="tablist" aria-label="תצוגה">
            {(["day", "week", "month"] as Mode[]).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={cn("rounded-lg px-3 py-1 text-sm", mode === m ? "bg-background shadow-sm font-semibold" : "text-muted-foreground")}
              >
                {m === "day" ? "יום" : m === "week" ? "שבוע" : "חודש"}
              </button>
            ))}
          </div>
          <Button variant="outline" size="icon" onClick={() => move(-1)} aria-label="הקודם">
            <ChevronRight />
          </Button>
          <div className="font-display font-bold min-w-[150px] text-center">{title}</div>
          <Button variant="outline" size="icon" onClick={() => move(1)} aria-label="הבא">
            <ChevronLeft />
          </Button>
          <Button variant="outline" onClick={() => setCursor(new Date())}>
            היום
          </Button>
          {!isDemoMode() && <CalendarFeedButton />}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש ביומן: שם, מוסד, סוג, תאריך" className="pr-9" aria-label="חיפוש ביומן" />
        </div>
        {ALL_KINDS.map((k) => {
          const on = kinds.includes(k);
          return (
            <button
              key={k}
              onClick={() => setKinds(on ? kinds.filter((x) => x !== k) : [...kinds, k])}
              aria-pressed={on}
              className={cn("rounded-full border px-3 py-1 text-xs font-medium", on ? EVENT_KIND_COLOR[k] : "bg-background text-muted-foreground opacity-60")}
            >
              {EVENT_KIND_LABELS[k]}
            </button>
          );
        })}
      </div>

      {mode === "month" && (
        <div className="card-elev overflow-hidden">
          <div className="grid grid-cols-7 bg-muted/50 text-center text-xs font-semibold text-muted-foreground">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-2">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {range.days.map((d) => {
              const items = byDay.get(dayKey(d)) ?? [];
              const other = d.getMonth() !== cursor.getMonth();
              return (
                <button
                  key={dayKey(d)}
                  onClick={() => setSelected(d)}
                  className={cn(
                    "min-h-[110px] border-t border-l p-1.5 text-right align-top hover:bg-muted/40 transition flex flex-col gap-0.5",
                    other && "bg-muted/20 text-muted-foreground",
                    d.getDay() === 6 && "bg-violet-50/40",
                  )}
                >
                  <div className="flex items-baseline justify-between">
                    <span className={cn("text-sm font-bold", isSameDay(d, today) && "bg-primary text-primary-foreground rounded-full size-6 inline-flex items-center justify-center")}>
                      {d.getDate()}
                    </span>
                    <span className="text-[11px] text-muted-foreground">{hebDay(d)}</span>
                  </div>
                  <DayLabels d={d} />
                  {items.slice(0, 3).map((e) => {
                    const f = familyById.get(e.familyId)!;
                    return (
                      <div key={e.id} className={cn("text-[11px] rounded px-1 truncate border", EVENT_KIND_COLOR[e.kind], e.attended === false && "line-through opacity-60")}>
                        {fmtTime(e.date)} {f.studentName}
                      </div>
                    );
                  })}
                  {items.length > 3 && <div className="text-[11px] text-primary font-semibold">+{items.length - 3} נוספים</div>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {mode === "week" && (
        <div className="grid gap-3 md:grid-cols-7">
          {range.days.map((d) => {
            const items = byDay.get(dayKey(d)) ?? [];
            return (
              <div key={dayKey(d)} className={cn("card-elev p-2 space-y-1.5 min-h-[200px]", isSameDay(d, today) && "ring-2 ring-primary")}>
                <button className="w-full text-right" onClick={() => (setCursor(d), setMode("day"))}>
                  <div className="font-bold text-sm">
                    {WEEKDAYS[d.getDay()]} {d.getDate()}/{d.getMonth() + 1}
                  </div>
                  <div className="text-xs text-muted-foreground">{hebrewDate(d, false)}</div>
                  <DayLabels d={d} />
                </button>
                {items.length === 0 && <div className="text-xs text-muted-foreground pt-2">—</div>}
                {items.map((e) => (
                  <EventLine key={e.id} e={e} compact />
                ))}
              </div>
            );
          })}
        </div>
      )}

      {mode === "day" && (
        <div className="card-elev p-4 space-y-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-bold">{hebrewDate(cursor)}</span>
            <DayLabels d={cursor} />
          </div>
          {(byDay.get(dayKey(cursor)) ?? []).length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">אין אירועים ביום הזה</p>}
          {(byDay.get(dayKey(cursor)) ?? []).map((e) => (
            <EventLine key={e.id} e={e} />
          ))}
        </div>
      )}

      {selected && mode === "month" && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <div className="bg-background rounded-2xl shadow-xl w-full max-w-lg p-5 space-y-3" dir="rtl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="אירועי היום">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-xl font-bold">
                  יום {WEEKDAYS[selected.getDay()]}, {selected.toLocaleDateString("he-IL")}
                </div>
                <div className="text-sm text-muted-foreground">{hebrewDate(selected)}</div>
                <DayLabels d={selected} />
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSelected(null)} aria-label="סגירה">
                <X />
              </Button>
            </div>
            {selItems.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">אין אירועים ביום הזה</p>}
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {selItems.map((e) => (
                <EventLine key={e.id} e={e} />
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => (setCursor(selected), setMode("day"), setSelected(null))}>
              <Link2 size={14} /> פתיחה בתצוגת יום
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
