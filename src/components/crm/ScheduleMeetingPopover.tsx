import { useMemo, useState, MouseEvent } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CalendarPlus, CalendarX, Users } from "lucide-react";
import { useCrm } from "@/store/crmStore";
import { toast } from "@/hooks/use-toast";
import { isoToLocalParts, localToIso } from "@/lib/dates";

interface Props {
  familyId: string;
  initialDate?: string; // ISO
  variant?: "card" | "default";
}

export const ScheduleMeetingPopover = ({ familyId, initialDate, variant = "card" }: Props) => {
  const { scheduleAppointment, appointments } = useCrm();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");

  const onOpenChange = (o: boolean) => {
    if (o) {
      // always start from the CURRENT meeting (fixes stale values after a reschedule)
      const p = isoToLocalParts(initialDate);
      setDate(p.date);
      setTime(p.time);
    }
    setOpen(o);
  };

  /** How busy is the chosen day / exact slot — helps avoid double-booking. */
  const load = useMemo(() => {
    if (!date) return null;
    let day = 0;
    let slot = 0;
    for (const a of appointments) {
      if (a.familyId === familyId) continue;
      const p = isoToLocalParts(a.date);
      if (p.date === date) {
        day++;
        if (time && p.time === time) slot++;
      }
    }
    return { day, slot };
  }, [appointments, date, time, familyId]);

  const stop = (e: MouseEvent) => e.stopPropagation();

  const save = () => {
    if (!date || !time) {
      toast({ title: "יש להזין תאריך ושעה", variant: "destructive" });
      return;
    }
    scheduleAppointment(familyId, localToIso(date, time));
    toast({ title: "הפגישה נקבעה בהצלחה" });
    setOpen(false);
  };

  const clear = () => {
    scheduleAppointment(familyId, null);
    toast({ title: "הפגישה בוטלה" });
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild onClick={stop}>
        <Button type="button" size="sm" variant={variant === "card" ? "outline" : "default"} className="gap-1 h-7 text-xs px-2">
          <CalendarPlus size={13} />
          {initialDate ? "שנה פגישה" : "קבע פגישה"}
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" className="w-72 pointer-events-auto" onClick={stop} align="end">
        <div className="space-y-3">
          <div>
            <h4 className="font-display font-bold text-sm">{initialDate ? "שינוי מועד פגישה" : "קביעת פגישה"}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">שינוי מועד מאפס את אישור ההגעה</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">תאריך פגישה</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">שעת פגישה</Label>
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} dir="ltr" step={900} />
          </div>
          {load && (
            <div
              className={`text-xs rounded-lg px-2 py-1.5 flex items-center gap-1.5 ${
                load.slot > 0 ? "bg-warning-soft text-warning-foreground" : "bg-muted text-muted-foreground"
              }`}
            >
              <Users size={12} />
              {load.day} פגישות נוספות ביום זה
              {load.slot > 0 && ` · ${load.slot} באותה שעה בדיוק!`}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="flex-1" onClick={save}>
              שמירה
            </Button>
            {initialDate && (
              <Button size="sm" variant="ghost" onClick={clear} title="ביטול הפגישה">
                <CalendarX size={14} />
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
              סגירה
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
