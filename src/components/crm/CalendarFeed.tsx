import { useState } from "react";
import { CalendarPlus, Copy, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/session";
import { toast } from "sonner";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/calendar-feed`;

/** Personal Google Calendar link (iCal feed) with copy + regenerate. */
export const CalendarFeedButton = () => {
  const { profile } = useSession();
  const [token, setToken] = useState<string | undefined>(profile?.calendar_token);
  const [busy, setBusy] = useState(false);
  const link = token ? `${FN_URL}?t=${token}` : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("הקישור הועתק");
    } catch {
      toast.message(link);
    }
  };
  const regenerate = async () => {
    if (!confirm("ליצור קישור חדש? הקישור הקודם יפסיק לעבוד, וצריך יהיה להוסיף את החדש ליומן גוגל.")) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("regenerate_calendar_token");
    setBusy(false);
    if (error) return toast.error("לא הצלחנו ליצור קישור חדש");
    setToken(data as string);
    toast.success("נוצר קישור חדש");
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <CalendarPlus size={15} /> ליומן גוגל
        </Button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" className="w-96 space-y-3">
        <div className="font-bold">הוספת הפגישות ליומן גוגל</div>
        <ol className="text-sm space-y-1 list-decimal pr-4">
          <li>מעתיקים את הקישור למטה.</li>
          <li>
            ביומן גוגל (במחשב): ליד "יומנים אחרים" לוחצים <b>+</b> ואז <b>"מכתובת URL"</b>.
          </li>
          <li>מדביקים ולוחצים "הוספת יומן". הפגישות, הסיורים והראיונות יופיעו ויתעדכנו לבד.</li>
        </ol>
        <div className="rounded-lg bg-muted p-2 text-[11px] break-all" dir="ltr">
          {link || "…"}
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={copy} disabled={!link}>
            <Copy size={14} /> העתקת הקישור
          </Button>
          <Button size="sm" variant="ghost" onClick={regenerate} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <RefreshCw size={14} />} קישור חדש
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">הקישור אישי וסודי: מי שמחזיק בו רואה את הפגישות. אם הוא דלף, לוחצים "קישור חדש".</p>
      </PopoverContent>
    </Popover>
  );
};
