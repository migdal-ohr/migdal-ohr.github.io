import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, MessageCircle, SkipForward, Send, PhoneOff, RotateCcw } from "lucide-react";
import { useCrm } from "@/store/crmStore";
import type { Family } from "@/types/crm";
import { getMissingDocuments } from "@/types/crm";
import {
  buildFollowUpMessage,
  buildMeetingReminderMessage,
  buildRemindDocsMessage,
  buildRsvpUrl,
  formatPhone,
  waLink,
} from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { logActivity } from "@/lib/activityLog";

export type QueueTemplate = "meeting" | "docs" | "followup" | "custom";

const TEMPLATE_LABEL: Record<QueueTemplate, string> = {
  meeting: "תזכורת לפגישה + קישור אישור הגעה",
  docs: "תזכורת מסמכים חסרים",
  followup: "פנייה לשימור קשר",
  custom: "הודעה חופשית",
};

interface Props {
  open: boolean;
  onClose: () => void;
  families: Family[];
  title: string;
  defaultTemplate?: QueueTemplate;
}

const storeKey = (title: string) => `wa-queue:${new Date().toDateString()}:${title}`;

/**
 * "סבב וואטסאפ" — send a personal message to a whole list, one tap per family.
 * WhatsApp does not allow sending without a click, so we prepare everything and
 * open the next chat each time; sent rows are remembered for the day.
 */
export const WhatsAppQueue = ({ open, onClose, families, title, defaultTemplate = "meeting" }: Props) => {
  const { getAppointment } = useCrm();
  const [template, setTemplate] = useState<QueueTemplate>(defaultTemplate);
  const [custom, setCustom] = useState("שלום {הורה},\n\n\n\nבברכה,\nצוות רישום מגדל אור");
  const [sent, setSent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!open) return;
    setTemplate(defaultTemplate);
    try {
      setSent(JSON.parse(localStorage.getItem(storeKey(title)) || "{}"));
    } catch {
      setSent({});
    }
  }, [open, title, defaultTemplate]);

  const persist = (next: Record<string, boolean>) => {
    setSent(next);
    try {
      localStorage.setItem(storeKey(title), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const rows = useMemo(
    () =>
      families.map((f) => {
        const phone = f.fatherPhone || f.motherPhone || "";
        const parent = f.fatherPhone ? f.fatherName || f.parentNames : f.motherName || f.parentNames;
        const name = parent || "הורים יקרים";
        const appt = getAppointment(f.id);
        let message = "";
        let skipReason = "";
        if (template === "meeting") {
          if (!appt) skipReason = "אין פגישה";
          else message = buildMeetingReminderMessage(name, appt.date, buildRsvpUrl(f.rsvpToken));
        } else if (template === "docs") {
          const missing = getMissingDocuments(f).map((d) => d.label);
          if (missing.length === 0) skipReason = "אין מסמכים חסרים";
          else message = buildRemindDocsMessage(name, missing);
        } else if (template === "followup") {
          message = buildFollowUpMessage(name, f.studentName);
        } else {
          message = custom.split("{הורה}").join(name).split("{תלמיד}").join(f.studentName);
        }
        if (!phone) skipReason = "אין טלפון";
        return { f, phone, message, skipReason };
      }),
    [families, template, custom, getAppointment],
  );

  const sendable = rows.filter((r) => !r.skipReason);
  const doneCount = sendable.filter((r) => sent[r.f.id]).length;
  const next = sendable.find((r) => !sent[r.f.id]);

  const sendRow = (r: (typeof rows)[number]) => {
    window.open(waLink(r.phone, r.message), "_blank", "noopener");
    const nextSent = { ...sent, [r.f.id]: true };
    persist(nextSent);
    if (sendable.every((x) => nextSent[x.f.id])) {
      logActivity("whatsapp_round", `סבב וואטסאפ "${title}" הושלם: ${sendable.length} הודעות`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <Send className="text-[#25D366]" /> סבב וואטסאפ: {title}
          </DialogTitle>
          <DialogDescription>
            לחיצה על "שלח לבא בתור" פותחת את הצ׳אט עם ההודעה המוכנה. שולחים, חוזרים לכאן ולוחצים שוב.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(TEMPLATE_LABEL) as QueueTemplate[]).map((t) => (
            <Button key={t} size="sm" variant={template === t ? "default" : "outline"} onClick={() => setTemplate(t)}>
              {TEMPLATE_LABEL[t]}
            </Button>
          ))}
        </div>
        {template === "custom" && (
          <div className="space-y-1">
            <Textarea value={custom} onChange={(e) => setCustom(e.target.value)} rows={5} />
            <p className="text-xs text-muted-foreground">אפשר להשתמש ב-{"{הורה}"} וב-{"{תלמיד}"} — יוחלפו בשם של כל משפחה</p>
          </div>
        )}

        <div className="rounded-xl border p-4 bg-muted/30 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              נשלחו {doneCount} מתוך {sendable.length}
            </span>
            {rows.length - sendable.length > 0 && <span className="text-muted-foreground">{rows.length - sendable.length} ידולגו</span>}
          </div>
          <Progress value={sendable.length ? (doneCount / sendable.length) * 100 : 0} className="h-2.5" />
          {next ? (
            <Button className="w-full h-12 text-base bg-[#25D366] hover:bg-[#1fb457] text-white" onClick={() => sendRow(next)}>
              <MessageCircle /> שלח לבא בתור: {next.f.studentName} ({formatPhone(next.phone)})
            </Button>
          ) : (
            <div className="text-center font-semibold text-success flex items-center justify-center gap-2 py-2">
              <CheckCircle2 /> {sendable.length ? "הסבב הושלם!" : "אין למי לשלוח"}
            </div>
          )}
          {doneCount > 0 && (
            <Button variant="ghost" size="sm" onClick={() => persist({})}>
              <RotateCcw size={14} /> התחל מחדש
            </Button>
          )}
        </div>

        {next && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">תצוגה מקדימה של ההודעה הבאה</summary>
            <pre className="whitespace-pre-wrap font-sans bg-muted/40 rounded-lg p-3 mt-2 text-xs">{next.message}</pre>
          </details>
        )}

        <ul className="divide-y border rounded-xl max-h-72 overflow-y-auto">
          {rows.map((r) => (
            <li key={r.f.id} className={cn("flex items-center gap-3 px-3 py-2 text-sm", sent[r.f.id] && "bg-success-soft/40")}>
              {r.skipReason ? (
                <PhoneOff size={14} className="text-muted-foreground shrink-0" />
              ) : sent[r.f.id] ? (
                <CheckCircle2 size={14} className="text-success shrink-0" />
              ) : (
                <span className="size-3.5 rounded-full border-2 shrink-0" />
              )}
              <span className="flex-1 truncate">{r.f.studentName}</span>
              {r.skipReason ? (
                <span className="text-xs text-muted-foreground">{r.skipReason}</span>
              ) : (
                <>
                  <span className="text-xs text-muted-foreground" dir="ltr">
                    {formatPhone(r.phone)}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => sendRow(r)} title="שלח עכשיו">
                    {sent[r.f.id] ? <RotateCcw size={13} /> : <SkipForward size={13} />}
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
};
