import { useMemo, useState } from "react";
import { useCrm } from "@/store/crmStore";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, CalendarDays, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { GRADE_LABEL, REGISTRATION_TRACK_BADGE, REGISTRATION_TRACK_LABELS } from "@/types/crm";
import { cn } from "@/lib/utils";
import { hebrewDate } from "@/lib/dates";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Props {
  onOpenFamily: (id: string) => void;
}

const HEB_MONTHS = ["ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני", "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר"];
// Hebrew week starts Sunday; in an RTL grid the first column renders on the right.
const HEB_WEEKDAYS_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];

export const CalendarView = ({ onOpenFamily }: Props) => {
  const { appointments, families } = useCrm();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);

  const familyById = useMemo(() => new Map(families.map((f) => [f.id, f])), [families]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const grid = useMemo(() => {
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null });
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d) });
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  }, [year, month]);

  /** Only appointments of active (non-archived) families */
  const monthAppts = useMemo(
    () =>
      appointments.filter((a) => {
        const d = new Date(a.date);
        return d.getFullYear() === year && d.getMonth() === month && familyById.has(a.familyId);
      }),
    [appointments, year, month, familyById],
  );

  const apptsByDay = useMemo(() => {
    const map = new Map<number, typeof appointments>();
    for (const a of monthAppts) {
      const day = new Date(a.date).getDate();
      const list = map.get(day) ?? [];
      list.push(a);
      map.set(day, list);
    }
    return map;
  }, [monthAppts]);

  const today = new Date();
  const isToday = (d: Date) => d.toDateString() === today.toDateString();
  const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });

  const dayItems = selectedDay ? apptsByDay.get(selectedDay.getDate()) ?? [] : [];

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold flex items-center gap-2">
            <CalendarDays className="text-primary" /> לוח שנה
          </h2>
          <p className="text-muted-foreground mt-1">
            {monthAppts.length} פגישות רישום ב{HEB_MONTHS[month]}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month - 1, 1))} aria-label="חודש קודם">
            <ChevronRight size={18} />
          </Button>
          <div className="px-4 py-2 rounded-xl bg-card border border-border font-display font-bold min-w-[160px] text-center">
            {HEB_MONTHS[month]} {year}
          </div>
          <Button variant="outline" size="icon" onClick={() => setCursor(new Date(year, month + 1, 1))} aria-label="חודש הבא">
            <ChevronLeft size={18} />
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              const d = new Date();
              d.setDate(1);
              d.setHours(0, 0, 0, 0);
              setCursor(d);
            }}
          >
            היום
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        <section className="card-elev p-4 xl:col-span-3 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-7 gap-2 mb-2">
              {HEB_WEEKDAYS_SHORT.map((w, i) => (
                <div
                  key={w}
                  className={cn(
                    "text-center text-xs font-bold py-2 rounded-lg",
                    i >= 5 ? "text-primary bg-primary-soft/60" : "text-muted-foreground bg-muted/40",
                  )}
                >
                  {w}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-2">
              {grid.map((cell, idx) => {
                if (!cell.date) return <div key={idx} className="h-28 rounded-xl bg-muted/20 border border-dashed border-border/50" />;
                const day = cell.date.getDate();
                const items = (apptsByDay.get(day) ?? []).slice().sort((a, b) => +new Date(a.date) - +new Date(b.date));
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedDay(cell.date)}
                    className={cn(
                      "h-28 rounded-xl border border-border bg-card p-2 flex flex-col gap-1 overflow-hidden transition-colors text-right hover:bg-muted/60 hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      isToday(cell.date) && "ring-2 ring-primary",
                    )}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className={cn("text-xs font-bold", isToday(cell.date) ? "text-primary" : "text-muted-foreground")}>{day}</span>
                      {items.length > 0 && (
                        <span className="text-[10px] font-bold bg-primary text-primary-foreground rounded-full px-1.5">{items.length}</span>
                      )}
                    </div>
                    <div className="flex-1 space-y-1 overflow-hidden w-full">
                      {items.slice(0, 3).map((a) => {
                        const f = familyById.get(a.familyId);
                        if (!f) return null;
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              "w-full text-right text-[11px] leading-tight px-1.5 py-1 rounded-md font-medium truncate",
                              f.rsvpStatus === "reschedule_requested"
                                ? "bg-destructive/10 text-destructive"
                                : f.rsvpStatus === "confirmed"
                                  ? "bg-success-soft text-success"
                                  : "bg-primary-soft text-primary",
                            )}
                            title={`${fmtTime(a.date)} · ${f.studentName}`}
                          >
                            <span className="font-bold ms-1" dir="ltr">
                              {fmtTime(a.date)}
                            </span>
                            {f.studentName}
                          </div>
                        );
                      })}
                      {items.length > 3 && <div className="text-[10px] text-muted-foreground text-center">+{items.length - 3} נוספות</div>}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground mt-3">
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded bg-success-soft border border-success" /> אישרו הגעה
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded bg-primary-soft border border-primary" /> ממתין לאישור
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2.5 rounded bg-destructive/10 border border-destructive" /> ביקשו מועד חדש
            </span>
          </div>
        </section>

        <aside className="card-elev p-5 xl:col-span-1 h-fit">
          <h3 className="font-display text-lg font-bold mb-3">פגישות החודש</h3>
          {monthAppts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">אין פגישות מתוכננות</p>
          ) : (
            <ul className="space-y-2 max-h-[60vh] overflow-y-auto scrollbar-thin pe-1">
              {monthAppts.map((a) => {
                const f = familyById.get(a.familyId)!;
                const d = new Date(a.date);
                return (
                  <li
                    key={a.id}
                    onClick={() => onOpenFamily(f.id)}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted cursor-pointer transition-colors border border-border"
                  >
                    <div className="size-12 rounded-xl bg-primary-soft text-primary flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-semibold">{HEB_MONTHS[d.getMonth()].slice(0, 3)}</span>
                      <span className="text-base font-bold leading-none">{d.getDate()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate text-sm">{f.studentName}</div>
                      <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                        <Clock size={11} />
                        <span dir="ltr">{fmtTime(a.date)}</span>· {GRADE_LABEL[f.grade]}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>
      </div>

      <Dialog open={!!selectedDay} onOpenChange={(o) => !o && setSelectedDay(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              <CalendarDays className="text-primary" size={20} />
              {selectedDay?.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </DialogTitle>
            <DialogDescription>
              {selectedDay && hebrewDate(selectedDay)} · {dayItems.length === 0 ? "אין פגישות מתוכננות ביום זה" : `${dayItems.length} פגישות`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto -mx-1 px-1">
            {dayItems
              .slice()
              .sort((a, b) => +new Date(a.date) - +new Date(b.date))
              .map((a) => {
                const f = familyById.get(a.familyId);
                if (!f) return null;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setSelectedDay(null);
                      onOpenFamily(f.id);
                    }}
                    className="w-full text-right flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:bg-muted transition-colors"
                  >
                    <div className="size-12 rounded-xl bg-primary-soft text-primary flex items-center justify-center shrink-0 font-bold text-sm" dir="ltr">
                      {fmtTime(a.date)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold truncate flex items-center gap-1">
                        {f.studentName}
                        {f.rsvpStatus === "confirmed" && <CheckCircle2 size={14} className="text-success" />}
                        {f.rsvpStatus === "reschedule_requested" && <AlertTriangle size={14} className="text-destructive" />}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {GRADE_LABEL[f.grade]} · {f.parentNames}
                      </div>
                    </div>
                    {f.registrationTrack && (
                      <span className={cn("shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-md border", REGISTRATION_TRACK_BADGE[f.registrationTrack])}>
                        {REGISTRATION_TRACK_LABELS[f.registrationTrack]}
                      </span>
                    )}
                  </button>
                );
              })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
