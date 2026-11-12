import { useEffect, useState } from "react";
import { useCan } from "@/lib/session";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/store/crmStore";
import {
  GRADE_LABEL,
  STAGE_LABELS,
  STATION_LABELS,
  STATION_ORDER,
  StationKey,
  getRequiredDocuments,
  REGISTRATION_TRACK_LABELS,
  FAMILY_STATUS_LABELS,
  EMPLOYMENT_LABELS,
} from "@/types/crm";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatPhone, buildRemindDocsMessage, buildMeetingReminderMessage, buildRsvpUrl } from "@/lib/whatsapp";
import { WhatsAppActionButton } from "./WhatsAppActionButton";
import { StudentAvatar } from "./StudentAvatar";
import { ActivityTimeline } from "./RecentActivity";
import { DocFiles } from "./DocFiles";
import {
  Phone,
  User,
  Users,
  Check,
  X,
  CalendarClock,
  FileText,
  Pencil,
  MapPin,
  IdCard,
  Trash2,
  Archive,
  Folder,
  ChevronDown,
  CheckCircle2,
  Link2,
  StickyNote,
  History,
  AlertTriangle,
  Briefcase,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import { isValidIsraeliId } from "@/lib/validation";
import { hebrewDate } from "@/lib/dates";

interface Props {
  familyId: string | null;
  onClose: () => void;
  onEdit: (id: string) => void;
}

export const FamilyProfile = ({ familyId, onClose, onEdit }: Props) => {
  const { getFamily, toggleDocument, toggleStation, deleteFamily, setArchived, getAppointment } = useCrm();
  const can = useCan();
  const family = familyId ? getFamily(familyId) : null;
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => setHistoryOpen(false), [familyId]);

  if (!family) return null;

  const requiredDocs = getRequiredDocuments(family);
  const completed = requiredDocs.filter((d) => family.documents[d.key]).length;
  const totalDocs = requiredDocs.length;
  const progress = totalDocs ? (completed / totalDocs) * 100 : 0;

  const missingLabels = requiredDocs.filter((d) => !family.documents[d.key]).map((d) => d.label);
  const fallbackName = family.fatherName?.trim() || family.motherName?.trim() || "הורים יקרים";
  const nameFor = (parent: "father" | "mother") =>
    parent === "mother" ? family.motherName?.trim() || fallbackName : family.fatherName?.trim() || fallbackName;
  const appt = getAppointment(family.id);
  const rsvpUrl = buildRsvpUrl(family.rsvpToken);

  const remindMsg = (parent: "father" | "mother") => buildRemindDocsMessage(nameFor(parent), missingLabels);
  const meetingMsg = appt
    ? (parent: "father" | "mother") => buildMeetingReminderMessage(nameFor(parent), appt.date, rsvpUrl)
    : null;

  const onDelete = () => {
    deleteFamily(family.id);
    setConfirmDelete(false);
    toast({ title: "התלמיד נמחק" });
    onClose();
  };

  const copyRsvp = async () => {
    if (!rsvpUrl) return;
    try {
      await navigator.clipboard.writeText(rsvpUrl);
      toast({ title: "קישור אישור ההגעה הועתק" });
    } catch {
      toast({ title: "לא ניתן להעתיק", description: rsvpUrl });
    }
  };

  const idBad = family.studentId && !isValidIsraeliId(family.studentId);
  const stationsDone = STATION_ORDER.filter((k) => family.stations?.[k]).length;

  return (
    <>
      <Dialog open={!!familyId} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl p-0 gap-0 overflow-hidden" dir="rtl">
          <div className="bg-gradient-primary p-6 text-primary-foreground">
            <DialogHeader>
              <div className="flex items-start gap-4">
                <StudentAvatar
                  photoUrl={family.photoUrl}
                  photoPath={family.photoPath}
                  name={family.studentName}
                  className="size-16 rounded-2xl bg-primary-foreground/20 backdrop-blur border border-primary-foreground/30"
                />
                <div className="flex-1 min-w-0">
                  <DialogTitle className="text-2xl font-display font-bold text-primary-foreground text-right">
                    {family.studentName}
                  </DialogTitle>
                  <DialogDescription className="sr-only">כרטיס תלמיד</DialogDescription>
                  <div className="flex flex-wrap items-center gap-2 mt-2 text-sm">
                    <Chip>{GRADE_LABEL[family.grade]}</Chip>
                    {family.registrationTrack && <Chip>{REGISTRATION_TRACK_LABELS[family.registrationTrack]}</Chip>}
                    <Chip>{STAGE_LABELS[family.stage]}</Chip>
                    {family.city && (
                      <Chip>
                        <MapPin size={12} /> {family.city}
                      </Chip>
                    )}
                    {family.isArchived && <Chip>בארכיון</Chip>}
                    {family.source === "web_form" && <Chip>נרשם בטופס באתר</Chip>}
                    {family.rsvpStatus === "confirmed" && (
                      <span className="bg-success text-success-foreground px-3 py-1 rounded-lg font-bold inline-flex items-center gap-1">
                        <CheckCircle2 size={14} /> אישר הגעה
                      </span>
                    )}
                    {family.rsvpStatus === "reschedule_requested" && (
                      <span className="bg-destructive text-destructive-foreground px-3 py-1 rounded-lg font-bold inline-flex items-center gap-1">
                        <AlertTriangle size={14} /> ביקש מועד חדש
                      </span>
                    )}
                  </div>
                </div>
                <div className={can.edit ? "flex flex-col gap-2 shrink-0 ms-2 me-6" : "hidden"}>
                  <Button size="sm" variant="secondary" onClick={() => onEdit(family.id)}>
                    <Pencil size={14} />
                    ערוך
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={async () => {
                      await setArchived(family.id, !family.isArchived);
                      toast({ title: family.isArchived ? "שוחזר מהארכיון" : "הועבר לארכיון" });
                      onClose();
                    }}
                  >
                    <Archive size={14} />
                    {family.isArchived ? "שחזר" : "לארכיון"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => setConfirmDelete(true)} className={can.delete ? "" : "hidden"}>
                    <Trash2 size={14} />
                    מחק
                  </Button>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
            {appt && (
              <section className="rounded-xl border-2 border-primary/30 bg-primary-soft/50 p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="flex items-center gap-3">
                  <CalendarClock className="text-primary" />
                  <div>
                    <div className="font-bold">
                      {new Date(appt.date).toLocaleString("he-IL", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                    <div className="text-xs text-muted-foreground">{hebrewDate(new Date(appt.date))} · {appt.type}</div>
                  </div>
                </div>
                {rsvpUrl && (
                  <Button size="sm" variant="outline" onClick={copyRsvp}>
                    <Link2 size={14} /> העתק קישור אישור הגעה
                  </Button>
                )}
              </section>
            )}

            <section>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wider mb-3">פרטי קשר</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {family.fatherName && <InfoRow icon={Users} label="שם אבא" value={family.fatherName} />}
                {family.motherName && <InfoRow icon={Users} label="שם אמא" value={family.motherName} />}
                {!family.fatherName && !family.motherName && <InfoRow icon={Users} label="הורים" value={family.parentNames} />}
                {family.fatherPhone && (
                  <InfoRow
                    icon={Phone}
                    label="טלפון אבא"
                    value={
                      <a href={`tel:${family.fatherPhone}`} dir="ltr" className="hover:underline">
                        {formatPhone(family.fatherPhone)}
                      </a>
                    }
                  />
                )}
                {family.motherPhone && (
                  <InfoRow
                    icon={Phone}
                    label="טלפון אמא"
                    value={
                      <a href={`tel:${family.motherPhone}`} dir="ltr" className="hover:underline">
                        {formatPhone(family.motherPhone)}
                      </a>
                    }
                  />
                )}
                {family.studentId && (
                  <InfoRow
                    icon={IdCard}
                    label={idBad ? "תעודת זהות (ספרת ביקורת שגויה!)" : "תעודת זהות"}
                    value={<span dir="ltr" className={cn(idBad && "text-destructive")}>{family.studentId}</span>}
                  />
                )}
                <InfoRow
                  icon={Briefcase}
                  label="מצב משפחתי / תעסוקה"
                  value={`${FAMILY_STATUS_LABELS[family.familyStatus ?? "married"]} · אבא: ${EMPLOYMENT_LABELS[family.fatherEmployment ?? "na"]}${family.fatherAvrech ? " (אברך)" : ""} · אמא: ${EMPLOYMENT_LABELS[family.motherEmployment ?? "na"]}`}
                />
              </div>
            </section>

            {family.notes && (
              <section className="rounded-xl bg-muted/50 border border-border p-3 text-sm flex gap-2">
                <StickyNote size={16} className="text-primary shrink-0 mt-0.5" />
                <p className="whitespace-pre-wrap">{family.notes}</p>
              </section>
            )}
            {family.stage === "persuasion" && family.hesitationReason && (
              <section className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-sm text-rose-900">
                <div className="text-[11px] font-bold mb-1">סיבת ההיסוס</div>
                {family.hesitationReason}
              </section>
            )}

            <section>
              <h3 className="text-xs font-bold text-muted-foreground tracking-wider mb-3">פעולות מהירות</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <WhatsAppActionButton
                  fatherPhone={family.fatherPhone}
                  motherPhone={family.motherPhone}
                  message={remindMsg}
                  label="תזכורת מסמכים"
                  icon={FileText}
                  disabled={missingLabels.length === 0}
                  disabledHint="כל המסמכים התקבלו"
                />
                <WhatsAppActionButton
                  fatherPhone={family.fatherPhone}
                  motherPhone={family.motherPhone}
                  message={meetingMsg ?? ""}
                  label="תזכורת לפגישה"
                  icon={CalendarClock}
                  disabled={!meetingMsg}
                  disabledHint="לא נקבעה פגישה"
                />
              </div>
            </section>

            <section>
              <Collapsible defaultOpen={missingLabels.length > 0 && missingLabels.length <= 4}>
                <div className="flex items-center justify-between mb-2 gap-2">
                  <h3 className="text-xs font-bold text-muted-foreground tracking-wider">מסמכים נדרשים</h3>
                  <span className="text-xs font-semibold text-muted-foreground">
                    {completed}/{totalDocs} התקבלו
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-success transition-all duration-500" style={{ width: `${progress}%` }} />
                </div>
                <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors group">
                  <span className="flex items-center gap-2 font-semibold text-sm">
                    <Folder size={16} className="text-primary" />
                    מסמכים {missingLabels.length > 0 && <span className="text-warning-foreground">· חסרים {missingLabels.length}</span>}
                  </span>
                  <ChevronDown size={16} className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <ul className="space-y-2 mt-2">
                    {requiredDocs.map((d) => {
                      const done = !!family.documents[d.key];
                      return (
                        <li
                          key={d.key}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl border transition-colors gap-2",
                            done ? "bg-success-soft border-success/30" : "bg-muted/50 border-border",
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={cn(
                                "size-8 rounded-lg flex items-center justify-center shrink-0",
                                done ? "bg-success text-success-foreground" : "bg-card border border-border text-muted-foreground",
                              )}
                            >
                              {done ? <Check size={16} /> : <X size={16} />}
                            </div>
                            <span className="font-medium text-sm truncate">{d.label}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {can.edit && <DocFiles family={family} docKey={d.key} docLabel={d.label} />}
                            <Button
                              size="sm"
                              variant={done ? "outline" : "default"}
                              onClick={() => toggleDocument(family.id, d.key)}
                              disabled={!can.edit}
                              className="shrink-0"
                            >
                              {done ? "סמן כחסר" : "סמן כהתקבל"}
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </CollapsibleContent>
              </Collapsible>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-muted-foreground tracking-wider">תחנות יום רישום</h3>
                <span className="text-xs font-semibold text-muted-foreground">
                  {stationsDone}/{STATION_ORDER.length} הושלמו
                </span>
              </div>
              <Progress value={(stationsDone / STATION_ORDER.length) * 100} className="h-2 mb-3" />
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {STATION_ORDER.map((key) => {
                  const done = !!family.stations?.[key];
                  return (
                    <li
                      key={key}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-xl border transition-colors",
                        done ? "bg-success-soft border-success/30" : "bg-muted/50 border-border",
                      )}
                    >
                      <span className="font-medium text-sm flex items-center gap-2">
                        {done ? <Check size={16} className="text-success" /> : <X size={16} className="text-muted-foreground" />}
                        {STATION_LABELS[key]}
                      </span>
                      <Switch
                        checked={done}
                        onCheckedChange={() => toggleStation(family.id, key as StationKey)}
                        disabled={!can.stations}
                        aria-label={STATION_LABELS[key]}
                      />
                    </li>
                  );
                })}
              </ul>
            </section>

            <section>
              <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
                <CollapsibleTrigger className="w-full flex items-center justify-between p-3 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors group">
                  <span className="flex items-center gap-2 font-semibold text-sm">
                    <History size={16} className="text-primary" /> היסטוריית פעולות
                  </span>
                  <ChevronDown size={16} className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent>{historyOpen && <ActivityTimeline familyId={family.id} limit={30} />}</CollapsibleContent>
              </Collapsible>
              <p className="text-[11px] text-muted-foreground mt-2">
                נוצר {new Date(family.createdAt).toLocaleDateString("he-IL")}
                {family.updatedAt && ` · עודכן ${new Date(family.updatedAt).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`}
              </p>
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-right">
              <Trash2 className="text-destructive" size={20} />
              מחיקת תלמיד
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              האם אתה בטוח שברצונך למחוק את התלמיד? פעולה זו אינה הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              מחק תלמיד
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

const Chip = ({ children }: { children: React.ReactNode }) => (
  <span className="bg-primary-foreground/20 backdrop-blur px-3 py-1 rounded-lg font-medium inline-flex items-center gap-1">{children}</span>
);

const InfoRow = ({ icon: Icon, label, value }: { icon: typeof User; label: string; value: React.ReactNode }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/40 border border-border">
    <div className="size-9 rounded-lg bg-card flex items-center justify-center text-primary border border-border shrink-0">
      <Icon size={16} />
    </div>
    <div className="min-w-0">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold truncate">{value}</div>
    </div>
  </div>
);
