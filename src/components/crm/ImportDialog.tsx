import { useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileSpreadsheet, Loader2, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import {
  IMPORT_FIELD_LABELS,
  ImportField,
  ParsedSheet,
  buildFamiliesFromSheet,
  guessField,
  readSpreadsheet,
} from "@/lib/excel";
import {
  GRADE_LABEL,
  Grade,
  REGISTRATION_TRACK_LABELS,
  REGISTRATION_TRACK_ORDER,
  RegistrationTrack,
  STAGE_LABELS,
  STAGE_ORDER,
  Stage,
} from "@/types/crm";
import { useCrm } from "@/store/crmStore";
import { normalizeId, normalizeText } from "@/lib/validation";
import { toast } from "sonner";

const FIELDS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[];
const GRADES = (Object.keys(GRADE_LABEL).map(Number) as Grade[]).sort((a, b) => a - b);

export const ImportDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { importFamilies, allFamilies } = useCrm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<Record<string, ImportField>>({});
  const [grade, setGrade] = useState<Grade>(7);
  const [track, setTrack] = useState<RegistrationTrack | "none">("none");
  const [stage, setStage] = useState<Stage>("leads");
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setSheet(null);
    setFileName("");
    setMapping({});
    setBusy(false);
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const s = await readSpreadsheet(file);
      if (s.rows.length === 0) throw new Error("לא נמצאו שורות בקובץ");
      setSheet(s);
      setFileName(file.name);
      const m: Record<string, ImportField> = {};
      for (const h of s.headers) m[h] = guessField(h);
      setMapping(m);
    } catch (e) {
      toast.error("לא ניתן לקרוא את הקובץ: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const preview = useMemo(() => {
    if (!sheet) return null;
    const { families, skipped } = buildFamiliesFromSheet(sheet, mapping, {
      grade,
      track: track === "none" ? undefined : track,
      stage,
    });
    const existingIds = new Set(allFamilies.map((f) => normalizeId(f.studentId)).filter(Boolean));
    const existingNames = new Set(allFamilies.map((f) => normalizeText(f.studentName)));
    const seen = new Set<string>();
    let dups = 0;
    const toImport = families.filter((f) => {
      const id = normalizeId(f.studentId);
      const key = id || normalizeText(f.studentName);
      const isDup = (id && existingIds.has(id)) || (!id && existingNames.has(normalizeText(f.studentName))) || seen.has(key);
      seen.add(key);
      if (isDup) dups++;
      return !(skipDuplicates && isDup);
    });
    return { families, toImport, skipped, dups };
  }, [sheet, mapping, grade, track, stage, allFamilies, skipDuplicates]);

  const hasName = Object.values(mapping).some((v) => v === "firstName" || v === "lastName" || v === "fullName");

  const run = async () => {
    if (!preview || preview.toImport.length === 0) return;
    setBusy(true);
    try {
      const n = await importFamilies(preview.toImport);
      toast.success(`יובאו ${n} תלמידים בהצלחה`);
      reset();
      onClose();
    } catch (e) {
      toast.error("הייבוא נכשל: " + (e instanceof Error ? e.message : String(e)));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && !busy) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-2">
            <FileSpreadsheet className="text-primary" /> ייבוא תלמידים מאקסל
          </DialogTitle>
          <DialogDescription>
            קובץ Excel או CSV. המערכת מזהה את העמודות לבד — אפשר לתקן לפני הייבוא. כפילויות (לפי ת.ז. או שם) מסומנות.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />

        {!sheet ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-full p-10 border-2 border-dashed rounded-2xl hover:border-primary hover:bg-primary/5 transition-colors flex flex-col items-center gap-3"
            disabled={busy}
          >
            {busy ? <Loader2 className="animate-spin text-primary" size={36} /> : <Upload className="text-primary" size={36} />}
            <span className="font-display font-semibold text-lg">בחירת קובץ</span>
            <span className="text-sm text-muted-foreground">xlsx / xls / csv</span>
          </button>
        ) : (
          <div className="space-y-5">
            <div className="text-sm">
              <span className="font-semibold">{fileName}</span> · {sheet.rows.length} שורות
              <Button variant="link" size="sm" onClick={reset}>
                קובץ אחר
              </Button>
            </div>

            <section>
              <h4 className="font-semibold mb-2">1. התאמת עמודות</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sheet.headers.map((h) => (
                  <div key={h} className="flex items-center gap-2 p-2 rounded-lg border bg-muted/30">
                    <span className="text-sm font-medium flex-1 truncate" title={h}>
                      {h}
                    </span>
                    <Select value={mapping[h]} onValueChange={(v) => setMapping((m) => ({ ...m, [h]: v as ImportField }))}>
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FIELDS.map((f) => (
                          <SelectItem key={f} value={f}>
                            {IMPORT_FIELD_LABELS[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
              {!hasName && (
                <p className="text-sm text-destructive mt-2 flex items-center gap-1">
                  <AlertTriangle size={14} /> יש לבחור לפחות עמודה אחת של שם
                </p>
              )}
            </section>

            <section>
              <h4 className="font-semibold mb-2">2. ברירות מחדל (כשאין עמודה בקובץ)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">כיתה</Label>
                  <Select value={String(grade)} onValueChange={(v) => setGrade(Number(v) as Grade)}>
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
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">מסלול</Label>
                  <Select value={track} onValueChange={(v) => setTrack(v as RegistrationTrack | "none")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ללא</SelectItem>
                      {REGISTRATION_TRACK_ORDER.map((t) => (
                        <SelectItem key={t} value={t}>
                          {REGISTRATION_TRACK_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">סטטוס</Label>
                  <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[...STAGE_ORDER, "persuasion" as Stage].map((s) => (
                        <SelectItem key={s} value={s}>
                          {STAGE_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>

            {preview && (
              <section className="rounded-xl border p-4 bg-muted/20 space-y-3">
                <h4 className="font-semibold">3. תצוגה מקדימה</h4>
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="inline-flex items-center gap-1 text-success font-semibold">
                    <CheckCircle2 size={16} /> {preview.toImport.length} ייובאו
                  </span>
                  {preview.dups > 0 && (
                    <span className="inline-flex items-center gap-1 text-warning-foreground">
                      <AlertTriangle size={16} /> {preview.dups} כפילויות {skipDuplicates ? "(ידולגו)" : "(ייובאו בכל זאת)"}
                    </span>
                  )}
                  {preview.skipped > 0 && <span className="text-muted-foreground">{preview.skipped} שורות ללא שם ידולגו</span>}
                </div>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
                  לדלג על תלמידים שכבר קיימים במערכת
                </label>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground">
                        <th className="text-right p-1">שם</th>
                        <th className="text-right p-1">ת.ז.</th>
                        <th className="text-right p-1">כיתה</th>
                        <th className="text-right p-1">עיר</th>
                        <th className="text-right p-1">טלפון</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.toImport.slice(0, 6).map((f, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-1">{f.studentName}</td>
                          <td className="p-1" dir="ltr">
                            {f.studentId}
                          </td>
                          <td className="p-1">{GRADE_LABEL[f.grade]}</td>
                          <td className="p-1">{f.city}</td>
                          <td className="p-1" dir="ltr">
                            {f.phone}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => (reset(), onClose())} disabled={busy}>
                ביטול
              </Button>
              <Button onClick={run} disabled={busy || !hasName || !preview?.toImport.length}>
                {busy && <Loader2 className="animate-spin" />}
                ייבוא {preview?.toImport.length ?? 0} תלמידים
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
