import { useEffect, useMemo, useRef, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useCrm } from "@/store/crmStore";
import {
  Family,
  GRADE_LABEL,
  Grade,
  STAGE_LABELS,
  STAGE_ORDER,
  Stage,
  STATION_LABELS,
  STATION_ORDER,
  StationKey,
  emptyStations,
  FAMILY_STATUS_LABELS,
  FAMILY_STATUS_ORDER,
  FamilyStatus,
  EMPLOYMENT_LABELS,
  EMPLOYMENT_ORDER,
  Employment,
  OPTIONAL_DOCS,
  getRequiredDocuments,
  RegistrationTrack,
  REGISTRATION_TRACK_LABELS,
  REGISTRATION_TRACK_ORDER,
} from "@/types/crm";
import { isValidIsraeliPhone } from "@/lib/whatsapp";
import { isValidIsraeliId, normalizeId, normalizeText, onlyDigits } from "@/lib/validation";
import { isoToLocalParts, localToIso } from "@/lib/dates";
import { compressImage } from "@/lib/image";
import { api } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { StudentAvatar } from "./StudentAvatar";
import { Upload, Trash2, MapPin, Folder, ChevronDown, Plus, X, AlertTriangle, Loader2, CalendarX } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  family?: Family | null;
  onOpenFamily?: (id: string) => void;
}

const empty = {
  firstName: "",
  lastName: "",
  studentId: "",
  city: "",
  grade: 7 as Grade,
  fatherName: "",
  motherName: "",
  fatherPhone: "",
  motherPhone: "",
  stage: "leads" as Stage,
  registrationTrack: "" as RegistrationTrack | "",
  notes: "",
  hesitationReason: "",
  familyStatus: "married" as FamilyStatus,
  fatherEmployment: "na" as Employment,
  motherEmployment: "na" as Employment,
  fatherAvrech: false,
  motherAvrech: false,
  optionalDocs: [] as string[],
  documents: {} as Record<string, boolean>,
  stations: emptyStations(),
};

const GRADES = (Object.keys(GRADE_LABEL).map(Number) as Grade[]).sort((a, b) => a - b);

export const StudentForm = ({ open, onClose, family, onOpenFamily }: Props) => {
  const { addFamily, updateFamily, deleteFamily, getAppointment, scheduleAppointment, allFamilies } = useCrm();
  const can = useCan();
  const fileRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(empty);
  const [meetingDate, setMeetingDate] = useState("");
  const [meetingTime, setMeetingTime] = useState("");
  const [initialMeeting, setInitialMeeting] = useState<string | null>(null);
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const isEdit = !!family;

  useEffect(() => {
    if (!open) return;
    setPhotoBlob(null);
    setPhotoPreview(null);
    setRemovePhoto(false);
    setSaving(false);
    if (family) {
      setForm({
        firstName: family.firstName ?? "",
        lastName: family.lastName ?? "",
        studentId: family.studentId ?? "",
        city: family.city ?? "",
        grade: family.grade,
        fatherName: family.fatherName ?? "",
        motherName: family.motherName ?? "",
        fatherPhone: family.fatherPhone ?? family.phone ?? "",
        motherPhone: family.motherPhone ?? family.phone2 ?? "",
        stage: family.stage,
        registrationTrack: family.registrationTrack ?? "",
        notes: family.notes ?? "",
        hesitationReason: family.hesitationReason ?? "",
        familyStatus: family.familyStatus ?? "married",
        fatherEmployment: family.fatherEmployment ?? "na",
        motherEmployment: family.motherEmployment ?? "na",
        fatherAvrech: !!family.fatherAvrech,
        motherAvrech: false,
        optionalDocs: family.optionalDocs ?? [],
        documents: { ...(family.documents ?? {}) },
        stations: { ...emptyStations(), ...(family.stations ?? {}) },
      });
      const appt = getAppointment(family.id);
      const parts = isoToLocalParts(appt?.date);
      setMeetingDate(parts.date);
      setMeetingTime(parts.time);
      setInitialMeeting(appt?.date ?? null);
    } else {
      setForm(empty);
      setMeetingDate("");
      setMeetingTime("");
      setInitialMeeting(null);
    }
    // only when the dialog opens / switches family — not on every realtime update
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, family?.id]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  const requiredDocs = useMemo(
    () => getRequiredDocuments(form),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.familyStatus, form.fatherEmployment, form.motherEmployment, form.fatherAvrech, form.optionalDocs],
  );
  const docsReceived = requiredDocs.filter((d) => form.documents[d.key]).length;
  const availableOptional = OPTIONAL_DOCS.filter((d) => !form.optionalDocs.includes(d.key));

  /* ---------- live duplicate detection ---------- */
  const duplicates = useMemo(() => {
    const id = normalizeId(form.studentId);
    const name = normalizeText(`${form.firstName} ${form.lastName}`);
    const phones = [form.fatherPhone, form.motherPhone].map(onlyDigits).filter((p) => p.length >= 9);
    if (!id && name.length < 4) return [];
    return allFamilies
      .filter((f) => f.id !== family?.id)
      .filter((f) => {
        if (id && normalizeId(f.studentId) === id) return true;
        if (name.length >= 4 && normalizeText(f.studentName) === name) {
          const fp = [f.fatherPhone, f.motherPhone].map(onlyDigits);
          return phones.length === 0 || phones.some((p) => fp.includes(p));
        }
        return false;
      })
      .slice(0, 3);
  }, [allFamilies, family?.id, form.studentId, form.firstName, form.lastName, form.fatherPhone, form.motherPhone]);

  const idDigits = onlyDigits(form.studentId);
  const idLooksWrong = idDigits.length >= 5 && !isValidIsraeliId(idDigits);

  const onPhoto = async (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "יש לבחור קובץ תמונה", variant: "destructive" });
      return;
    }
    try {
      const blob = await compressImage(file);
      setPhotoBlob(blob);
      setPhotoPreview(URL.createObjectURL(blob));
      setRemovePhoto(false);
    } catch (e) {
      toast({ title: "לא ניתן לטעון את התמונה", description: String(e), variant: "destructive" });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    const fatherName = form.fatherName.trim();
    const motherName = form.motherName.trim();
    const fatherPhone = form.fatherPhone.trim();
    const motherPhone = form.motherPhone.trim();
    if (!firstName) return toast({ title: "יש להזין שם פרטי", variant: "destructive" });
    if (!lastName) return toast({ title: "יש להזין שם משפחה", variant: "destructive" });
    if (!fatherName && !motherName) return toast({ title: "יש להזין שם אבא או אמא לפחות", variant: "destructive" });
    if (!fatherPhone && !motherPhone) return toast({ title: "יש להזין מספר טלפון אחד לפחות", variant: "destructive" });
    if (fatherPhone && !isValidIsraeliPhone(fatherPhone))
      return toast({ title: "טלפון אבא לא תקין", description: "פורמט: 05X-XXXXXXX", variant: "destructive" });
    if (motherPhone && !isValidIsraeliPhone(motherPhone))
      return toast({ title: "טלפון אמא לא תקין", description: "פורמט: 05X-XXXXXXX", variant: "destructive" });
    if (form.studentId.trim() && !/^\d{5,9}$/.test(form.studentId.trim()))
      return toast({ title: "תעודת זהות לא תקינה", variant: "destructive" });
    if (!form.registrationTrack) return toast({ title: "יש לבחור מסלול רישום", variant: "destructive" });
    if ((meetingDate && !meetingTime) || (!meetingDate && meetingTime))
      return toast({ title: "לקביעת פגישה יש להזין גם תאריך וגם שעה", variant: "destructive" });

    const cleanedDocs: Record<string, boolean> = {};
    for (const r of requiredDocs) cleanedDocs[r.key] = !!form.documents[r.key];

    const payload: Partial<Family> = {
      firstName,
      lastName,
      studentName: `${firstName} ${lastName}`.trim(),
      studentId: form.studentId.trim() || undefined,
      city: form.city.trim() || undefined,
      grade: form.grade,
      fatherName: fatherName || undefined,
      motherName: motherName || undefined,
      fatherPhone: fatherPhone || undefined,
      motherPhone: motherPhone || undefined,
      parentNames: fatherName && motherName ? `${fatherName} ו${motherName}` : fatherName || motherName,
      phone: fatherPhone || motherPhone,
      phone2: fatherPhone && motherPhone ? motherPhone : undefined,
      stage: form.stage,
      registrationTrack: form.registrationTrack as RegistrationTrack,
      notes: form.notes.trim() || undefined,
      hesitationReason: form.stage === "persuasion" ? form.hesitationReason.trim() || undefined : undefined,
      familyStatus: form.familyStatus,
      fatherEmployment: form.fatherEmployment,
      motherEmployment: form.motherEmployment,
      fatherAvrech: form.fatherAvrech,
      motherAvrech: false,
      optionalDocs: form.optionalDocs,
      documents: cleanedDocs,
      stations: form.stations,
    };
    if (removePhoto) {
      payload.photoPath = undefined;
      payload.photoUrl = undefined;
    }

    const newMeeting = meetingDate && meetingTime ? localToIso(meetingDate, meetingTime) : null;
    const meetingChanged =
      (newMeeting ?? null) !== (initialMeeting ? new Date(initialMeeting).toISOString() : null);

    setSaving(true);
    try {
      let familyId = family?.id;
      if (isEdit && family) {
        await updateFamily(family.id, payload);
      } else {
        const created = await addFamily(payload as Omit<Family, "id" | "createdAt">);
        if (!created) return;
        familyId = created.id;
      }
      if (familyId && photoBlob) {
        try {
          const path = await api.uploadPhoto(familyId, photoBlob);
          await updateFamily(familyId, { photoPath: path, photoUrl: undefined });
        } catch (err) {
          toast({ title: "התמונה לא נשמרה", description: String(err), variant: "destructive" });
        }
      }
      if (familyId && meetingChanged) await scheduleAppointment(familyId, newMeeting);
      toast({ title: isEdit ? "הפרטים עודכנו בהצלחה" : "תלמיד/ה חדש/ה נוסף/ה" });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const meetingCleared = !!initialMeeting && !meetingDate && !meetingTime;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{isEdit ? "עריכת פרטי תלמיד" : "הוספת תלמיד חדש"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "עדכון הפרטים, המסמכים והסטטוס" : "מילוי פרטי התלמיד והמשפחה"}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5 pt-2">
          {/* Photo */}
          <div className="flex items-center gap-4">
            {photoPreview ? (
              <div className="size-20 rounded-2xl border border-border overflow-hidden">
                <img src={photoPreview} alt="תמונת תלמיד" className="w-full h-full object-cover" />
              </div>
            ) : (
              <StudentAvatar
                photoUrl={removePhoto ? undefined : family?.photoUrl}
                photoPath={removePhoto ? undefined : family?.photoPath}
                name={form.firstName}
                className="size-20 rounded-2xl bg-muted border border-border text-muted-foreground"
              />
            )}
            <div className="flex-1">
              <Label className="mb-1 block">תמונת תלמיד</Label>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhoto(e.target.files?.[0])}
              />
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <Upload size={14} /> העלאת תמונה
                </Button>
                {(photoPreview || ((family?.photoPath || family?.photoUrl) && !removePhoto)) && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setPhotoBlob(null);
                      setPhotoPreview(null);
                      setRemovePhoto(true);
                    }}
                  >
                    הסר
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">התמונה מוקטנת אוטומטית</p>
            </div>
          </div>

          {duplicates.length > 0 && (
            <div className="rounded-xl border-2 border-warning/50 bg-warning-soft p-3 text-sm space-y-1" role="alert">
              <div className="font-bold flex items-center gap-2">
                <AlertTriangle size={16} className="text-warning" /> ייתכן שהתלמיד כבר קיים במערכת:
              </div>
              {duplicates.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-2">
                  <span>
                    {d.studentName} · {GRADE_LABEL[d.grade]} · {STAGE_LABELS[d.stage]}
                    {d.isArchived ? " · בארכיון" : ""}
                  </span>
                  {onOpenFamily && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onClose();
                        onOpenFamily(d.id);
                      }}
                    >
                      פתח
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="שם פרטי *">
              <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="לדוגמה: משה" autoFocus={!isEdit} />
            </Field>
            <Field label="שם משפחה *">
              <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="לדוגמה: כהן" />
            </Field>
            <Field label="תעודת זהות">
              <Input
                value={form.studentId}
                onChange={(e) => set("studentId", e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                maxLength={9}
                placeholder="9 ספרות"
                dir="ltr"
                aria-invalid={idLooksWrong}
              />
              {idLooksWrong && (
                <p className="text-xs text-warning-foreground flex items-center gap-1 mt-1">
                  <AlertTriangle size={12} /> ספרת הביקורת לא תואמת — כדאי לבדוק שוב
                </p>
              )}
            </Field>
            <Field label="עיר מגורים">
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} placeholder="לדוגמה: מגדל העמק" />
            </Field>
            <Field label="כיתת יעד *">
              <Select value={String(form.grade)} onValueChange={(v) => set("grade", Number(v) as Grade)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADES.map((g) => (
                    <SelectItem key={g} value={String(g)}>
                      {GRADE_LABEL[g]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="מסלול רישום *">
              <Select value={form.registrationTrack || undefined} onValueChange={(v) => set("registrationTrack", v as RegistrationTrack)}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר/י מסלול" />
                </SelectTrigger>
                <SelectContent>
                  {REGISTRATION_TRACK_ORDER.map((t) => (
                    <SelectItem key={t} value={t}>
                      {REGISTRATION_TRACK_LABELS[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="שם אבא">
              <Input value={form.fatherName} onChange={(e) => set("fatherName", e.target.value)} placeholder="לדוגמה: אבי" />
            </Field>
            <Field label="שם אמא">
              <Input value={form.motherName} onChange={(e) => set("motherName", e.target.value)} placeholder="לדוגמה: רחל" />
            </Field>
            <Field label="טלפון אבא">
              <Input value={form.fatherPhone} onChange={(e) => set("fatherPhone", e.target.value)} placeholder="05X-XXXXXXX" dir="ltr" inputMode="tel" />
            </Field>
            <Field label="טלפון אמא">
              <Input value={form.motherPhone} onChange={(e) => set("motherPhone", e.target.value)} placeholder="05X-XXXXXXX" dir="ltr" inputMode="tel" />
            </Field>
          </div>

          <Field label="סטטוס רישום">
            <Select value={form.stage} onValueChange={(v) => set("stage", v as Stage)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STAGE_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))}
                <SelectItem value="persuasion">{STAGE_LABELS.persuasion}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          {form.stage === "persuasion" && (
            <Field label="סיבת ההיסוס / ביטול">
              <Textarea
                value={form.hesitationReason}
                onChange={(e) => set("hesitationReason", e.target.value)}
                rows={3}
                placeholder="לדוגמה: מתלבטים בין מוסדות, בעיות תקציב, ממתינים לתשובה מאחיו..."
              />
            </Field>
          )}

          <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-4">
            <Label className="font-semibold block">מצב משפחתי ותעסוקה</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="מצב משפחתי">
                <Select value={form.familyStatus} onValueChange={(v) => set("familyStatus", v as FamilyStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FAMILY_STATUS_ORDER.map((s) => (
                      <SelectItem key={s} value={s}>
                        {FAMILY_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <label className="flex items-center justify-between p-3 rounded-xl border border-border bg-card cursor-pointer self-end h-10">
                <span className="text-sm font-medium">אברך - אבא</span>
                <Switch checked={form.fatherAvrech} onCheckedChange={(c) => set("fatherAvrech", !!c)} />
              </label>
              <Field label="תעסוקה - אבא">
                <Select value={form.fatherEmployment} onValueChange={(v) => set("fatherEmployment", v as Employment)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_ORDER.map((e) => (
                      <SelectItem key={e} value={e}>
                        {EMPLOYMENT_LABELS[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="תעסוקה - אמא">
                <Select value={form.motherEmployment} onValueChange={(v) => set("motherEmployment", v as Employment)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_ORDER.map((e) => (
                      <SelectItem key={e} value={e}>
                        {EMPLOYMENT_LABELS[e]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <Label className="mb-3 block font-semibold">פגישת רישום</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="תאריך פגישה">
                <Input type="date" value={meetingDate} onChange={(e) => setMeetingDate(e.target.value)} dir="ltr" />
              </Field>
              <Field label="שעת פגישה">
                <Input type="time" value={meetingTime} onChange={(e) => setMeetingTime(e.target.value)} dir="ltr" step={900} />
              </Field>
            </div>
            {(meetingDate || meetingTime) && (
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-muted-foreground">שינוי מועד מאפס את אישור ההגעה של ההורים</p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setMeetingDate("");
                    setMeetingTime("");
                  }}
                >
                  <CalendarX size={14} /> ביטול פגישה
                </Button>
              </div>
            )}
            {meetingCleared && <p className="text-xs text-destructive mt-2">הפגישה תבוטל בשמירה</p>}
          </div>

          <Collapsible className="rounded-xl border border-border bg-muted/30" defaultOpen>
            <CollapsibleTrigger className="w-full flex items-center justify-between p-4 group" type="button">
              <span className="font-semibold text-sm flex items-center gap-2">
                <Folder size={16} className="text-primary" />
                מסמכים נדרשים
              </span>
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-muted-foreground">
                  {docsReceived}/{requiredDocs.length} התקבלו
                </span>
                <ChevronDown size={18} className="text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="px-4 pb-4 space-y-3">
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const all = requiredDocs.every((d) => form.documents[d.key]);
                      const next: Record<string, boolean> = { ...form.documents };
                      for (const d of requiredDocs) next[d.key] = !all;
                      set("documents", next);
                    }}
                  >
                    {requiredDocs.every((d) => form.documents[d.key]) ? "נקה הכל" : "סמן הכל כהתקבל"}
                  </Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {requiredDocs.map((d) => {
                    const isOptional = d.key.startsWith("opt_");
                    return (
                      <label
                        key={d.key}
                        className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border bg-card cursor-pointer hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Checkbox
                            checked={!!form.documents[d.key]}
                            onCheckedChange={(c) => set("documents", { ...form.documents, [d.key]: !!c })}
                          />
                          <span className="text-sm font-medium truncate">{d.label}</span>
                        </div>
                        {isOptional && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              set("optionalDocs", form.optionalDocs.filter((k) => k !== d.key));
                            }}
                            className="text-muted-foreground hover:text-destructive shrink-0"
                            title="הסר מסמך"
                            aria-label={`הסר ${d.label}`}
                          >
                            <X size={14} />
                          </button>
                        )}
                      </label>
                    );
                  })}
                </div>
                {availableOptional.length > 0 && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button type="button" variant="outline" size="sm" className="gap-1">
                        <Plus size={14} />
                        הוסף מסמך ייעודי
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {availableOptional.map((d) => (
                        <DropdownMenuItem key={d.key} onClick={() => set("optionalDocs", [...form.optionalDocs, d.key])}>
                          {d.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-center justify-between mb-3">
              <span className="font-semibold text-sm flex items-center gap-2">
                <MapPin size={16} className="text-primary" />
                תחנות יום רישום
              </span>
              <span className="text-xs font-semibold text-muted-foreground">
                {Object.values(form.stations).filter(Boolean).length}/{STATION_ORDER.length} הושלמו
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {STATION_ORDER.map((k) => (
                <label
                  key={k}
                  className="flex items-center gap-2 p-3 rounded-xl border border-border bg-card cursor-pointer hover:bg-muted transition-colors"
                >
                  <Checkbox
                    checked={form.stations[k]}
                    onCheckedChange={(c) => set("stations", { ...form.stations, [k]: !!c } as Record<StationKey, boolean>)}
                  />
                  <span className="text-sm font-medium">{STATION_LABELS[k]}</span>
                </label>
              ))}
            </div>
          </div>

          <Field label="הערות">
            <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} placeholder="פרטים נוספים..." />
          </Field>

          <div className="flex items-center justify-between gap-2 pt-2 border-t sticky bottom-0 bg-background pb-1">
            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving && <Loader2 className="animate-spin" />}
                {isEdit ? "שמירת שינויים" : "הוספת תלמיד"}
              </Button>
              <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
                ביטול
              </Button>
            </div>
            {isEdit && can.delete && (
              <Button type="button" variant="destructive" onClick={() => setConfirmDelete(true)} className="gap-1" disabled={saving}>
                <Trash2 size={16} />
                מחק תלמיד
              </Button>
            )}
          </div>
        </form>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent dir="rtl">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-right">
                <Trash2 className="text-destructive" size={20} />
                מחיקת תלמיד
              </AlertDialogTitle>
              <AlertDialogDescription className="text-right">
                האם אתה בטוח שברצונך למחוק את התלמיד? פעולה זו אינה הפיכה. (אפשר גם להעביר לארכיון במקום למחוק)
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="gap-2">
              <AlertDialogAction
                onClick={() => {
                  if (family) {
                    deleteFamily(family.id);
                    toast({ title: "התלמיד נמחק" });
                    setConfirmDelete(false);
                    onClose();
                  }
                }}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                מחק לצמיתות
              </AlertDialogAction>
              <AlertDialogCancel>ביטול</AlertDialogCancel>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
};

const Field = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1.5 ${className}`}>
    <Label>{label}</Label>
    {children}
  </div>
);
