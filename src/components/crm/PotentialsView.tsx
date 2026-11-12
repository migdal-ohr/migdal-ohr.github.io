import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCan } from "@/lib/session";
import { ScanLine, Upload, Loader2, UserPlus, Trash2, Check, FileImage, FileText, AlertTriangle, ExternalLink } from "lucide-react";
import { api, type PotentialRow, type ScannedChild } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { useCrm } from "@/store/crmStore";
import { Grade, GRADE_LABEL, emptyStations } from "@/types/crm";
import { isValidIsraeliId, normalizeId } from "@/lib/validation";

const ageInYears = (dobIso: string): number => {
  const dob = new Date(dobIso);
  if (isNaN(+dob)) return -1;
  return (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
};

/** Returns matching grade (6–12) or null per the agreed brackets. */
export const matchGrade = (dobIso: string): Grade | null => {
  const a = ageInYears(dobIso);
  if (a < 1.0) return null;
  if (a >= 11.0 && a < 12.0) return 6;
  if (a >= 12.0 && a < 13.0) return 7;
  if (a >= 13.0 && a < 14.5) return 8;
  if (a >= 14.5 && a < 15.0) return 9;
  if (a >= 15.0 && a < 16.0) return 10;
  if (a >= 16.0 && a < 17.0) return 11;
  if (a >= 17.0 && a < 18.5) return 12;
  return null;
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return isNaN(+d) ? iso : d.toLocaleDateString("he-IL");
};

const MAX_FILE_MB = 20;

export const PotentialsView = ({ onOpenFamily }: { onOpenFamily?: (id: string) => void }) => {
  const { addFamily, allFamilies } = useCrm();
  const can = useCan();
  const [rows, setRows] = useState<PotentialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanLabel, setScanLabel] = useState("מנתח את הספח...");
  const [dragOver, setDragOver] = useState(false);
  const [showConverted, setShowConverted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const familyByIdNumber = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of allFamilies) {
      const id = normalizeId(f.studentId);
      if (id) m.set(id, f.id);
    }
    return m;
  }, [allFamilies]);

  const fetchRows = useCallback(async () => {
    try {
      setRows(await api.listPotentials());
    } catch (e) {
      toast.error("שגיאה בטעינת פוטנציאלים: " + (e instanceof Error ? e.message : String(e)));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => {
        const s = String(r.result || "");
        const idx = s.indexOf(",");
        resolve(idx >= 0 ? s.slice(idx + 1) : s);
      };
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const renderPdfAllPagesToJpegs = async (file: File): Promise<string[]> => {
    const pdfjsLib = await import("pdfjs-dist");
    const worker = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
    pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
    const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
    const out: string[] = [];
    for (let i = 1; i <= Math.min(pdf.numPages, 12); i++) {
      setScanLabel(`מעבד עמוד ${i} מתוך ${pdf.numPages}...`);
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      out.push(canvas.toDataURL("image/jpeg", 0.9).split(",")[1]);
    }
    return out;
  };

  const handleFile = async (file: File) => {
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    const isImage = file.type.startsWith("image/");
    if (!isPdf && !isImage) return toast.error("יש להעלות קובץ תמונה או PDF");
    if (file.size > MAX_FILE_MB * 1024 * 1024) return toast.error(`הקובץ גדול מ-${MAX_FILE_MB}MB`);
    setScanLabel(isPdf ? "מעבד קובץ PDF..." : "מנתח את הספח...");
    setScanning(true);
    try {
      const images = isPdf ? await renderPdfAllPagesToJpegs(file) : [await fileToBase64(file)];
      setScanLabel(`מנתח ${images.length > 1 ? `${images.length} עמודים` : "את הספח"} בעזרת AI...`);
      const { children, totalDetected } = await api.scanIdSlip(images, isPdf ? "image/jpeg" : file.type || "image/jpeg");
      if (!children || children.length === 0) {
        toast.warning(totalDetected ? `זוהו ${totalDetected} ילדים, אך אין בנים בקובץ` : "לא זוהו ילדים בקובץ");
        return;
      }
      const relevant = (children as ScannedChild[])
        .map((c) => ({ ...c, grade: matchGrade(c.dateOfBirth) }))
        .filter((c) => c.grade !== null) as (ScannedChild & { grade: Grade })[];

      if (relevant.length === 0) {
        toast.info(`זוהו ${children.length} בנים, אך אף אחד לא בטווח הגילאים הרלוונטי`);
        return;
      }
      const already = relevant.filter((c) => c.idNumber && familyByIdNumber.has(normalizeId(c.idNumber)));
      const fresh = relevant.filter((c) => !(c.idNumber && familyByIdNumber.has(normalizeId(c.idNumber))));
      const inserted = await api.insertPotentials(
        fresh.map((c) => ({
          full_name: c.fullName || "(שם לא ברור)",
          id_number: c.idNumber || null,
          date_of_birth: c.dateOfBirth,
          grade: c.grade,
          source: file.name,
        })),
      );
      const parts = [`נוספו ${inserted} פוטנציאלים`];
      if (already.length) parts.push(`${already.length} כבר רשומים במערכת`);
      if (fresh.length - inserted > 0) parts.push(`${fresh.length - inserted} כבר היו ברשימה`);
      const badIds = relevant.filter((c) => c.idValid === false).length;
      if (badIds) parts.push(`⚠ ${badIds} ת.ז. לא תקינות — לבדוק ידנית`);
      toast.success(parts.join(" · "), { duration: 8000 });
      await fetchRows();
    } catch (e) {
      toast.error("הסריקה נכשלה: " + (e instanceof Error ? e.message : "שגיאה לא ידועה"));
    } finally {
      setScanning(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const convertToApplicant = async (row: PotentialRow) => {
    if (row.converted) return;
    const parts = row.full_name.trim().split(/\s+/);
    const created = await addFamily({
      studentName: row.full_name,
      firstName: parts[0] ?? row.full_name,
      lastName: parts.slice(1).join(" "),
      studentId: row.id_number ?? "",
      grade: row.grade as Grade,
      parentNames: "",
      phone: "",
      stage: "leads",
      notes: row.source ? `נוסף מסריקת ספח: ${row.source}` : undefined,
      documents: {},
      stations: emptyStations(),
    });
    if (!created) return;
    try {
      await api.updatePotential(row.id, { converted: true, converted_family_id: created.id });
      toast.success(`${row.full_name} נוסף כמועמד — כדאי להשלים טלפון ומסלול`, {
        action: onOpenFamily ? { label: "פתח", onClick: () => onOpenFamily(created.id) } : undefined,
      });
      fetchRows();
    } catch (e) {
      toast.error("עדכון נכשל: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const removeRow = async (id: string) => {
    try {
      await api.deletePotential(id);
      fetchRows();
    } catch (e) {
      toast.error("מחיקה נכשלה: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  const visibleRows = rows.filter((r) => showConverted || !r.converted);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-soft">
            <ScanLine className="text-primary-foreground" size={22} />
          </div>
          <div>
            <h1 className="font-display font-bold text-2xl">בוט פוטנציאלים</h1>
            <p className="text-sm text-muted-foreground">סריקת ספח תעודת זהות וזיהוי אחים בגילאים הרלוונטיים (כיתות ו׳–י״ב)</p>
          </div>
        </div>
      </header>

      <Card
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files?.[0];
          if (f) handleFile(f);
        }}
        onClick={() => !scanning && can.edit && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={`p-10 border-2 border-dashed cursor-pointer transition-colors text-center ${
          dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/60 hover:bg-muted/30"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/*,application/pdf,.pdf"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <div className="flex flex-col items-center gap-3">
          {scanning ? (
            <>
              <Loader2 className="size-10 text-primary animate-spin" />
              <p className="font-medium">{scanLabel}</p>
              <p className="text-sm text-muted-foreground">זיהוי שמות, ת.ז ותאריכי לידה</p>
            </>
          ) : (
            <>
              <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Upload className="text-primary" size={28} />
              </div>
              <p className="font-display font-semibold text-lg">העלאת ספח תעודת זהות</p>
              <p className="text-sm text-muted-foreground">גררו קובץ תמונה או PDF לכאן או לחצו לבחירת קובץ</p>
              <p className="text-xs text-muted-foreground flex items-center gap-2">
                <span className="inline-flex items-center gap-1">
                  <FileImage size={14} /> JPG / PNG
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <FileText size={14} /> PDF (עד 12 עמודים)
                </span>
              </p>
            </>
          )}
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between gap-2 flex-wrap">
          <div>
            <h2 className="font-display font-semibold">תלמידים פוטנציאליים</h2>
            <p className="text-xs text-muted-foreground">
              {rows.filter((r) => !r.converted).length} ממתינים · {rows.filter((r) => r.converted).length} הומרו
            </p>
          </div>
          <label className="text-sm flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={showConverted} onChange={(e) => setShowConverted(e.target.checked)} />
            הצג גם שהומרו
          </label>
        </div>
        {loading ? (
          <div className="p-10 text-center text-muted-foreground flex items-center justify-center gap-2">
            <Loader2 className="animate-spin" size={16} /> טוען...
          </div>
        ) : visibleRows.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">אין פוטנציאלים ממתינים. העלו ספח כדי להתחיל.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>שם</TableHead>
                <TableHead>ת.ז</TableHead>
                <TableHead>תאריך לידה</TableHead>
                <TableHead>כיתה</TableHead>
                <TableHead>סטטוס</TableHead>
                <TableHead>פעולות</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((r) => {
                const existing = r.id_number ? familyByIdNumber.get(normalizeId(r.id_number)) : undefined;
                const badId = r.id_number && !isValidIsraeliId(r.id_number);
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.full_name}</TableCell>
                    <TableCell className="text-muted-foreground" dir="ltr">
                      <span className="inline-flex items-center gap-1">
                        {r.id_number || "—"}
                        {badId && <AlertTriangle size={14} className="text-warning" aria-label="ת.ז. לא תקינה" />}
                      </span>
                    </TableCell>
                    <TableCell>{formatDate(r.date_of_birth)}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{GRADE_LABEL[r.grade as Grade] ?? r.grade}</Badge>
                    </TableCell>
                    <TableCell>
                      {r.converted ? (
                        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-100">
                          <Check size={12} className="ms-1" /> הומר
                        </Badge>
                      ) : existing ? (
                        <Badge variant="outline" className="border-warning text-warning-foreground">
                          כבר רשום
                        </Badge>
                      ) : (
                        <Badge variant="outline">חדש</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        {existing && onOpenFamily ? (
                          <Button size="sm" variant="outline" onClick={() => onOpenFamily(existing)}>
                            <ExternalLink size={14} /> פתח כרטיס
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => convertToApplicant(r)} disabled={r.converted || !can.edit}>
                            <UserPlus size={14} />
                            הפוך למועמד
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => removeRow(r.id)} aria-label="מחק">
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
};
