import { useRef, useState } from "react";
import { Paperclip, Loader2, FileText, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useCrm } from "@/store/crmStore";
import type { DocFile, Family } from "@/types/crm";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLog";

const MAX_MB = 15;

/** Upload / view / delete the scanned files of ONE required document. Uploading marks it as received. */
export const DocFiles = ({ family, docKey, docLabel }: { family: Family; docKey: string; docLabel: string }) => {
  const { updateFamily } = useCrm();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const files: DocFile[] = family.files?.[docKey] ?? [];

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    try {
      const added: DocFile[] = [];
      for (const file of Array.from(list)) {
        if (file.size > MAX_MB * 1024 * 1024) {
          toast.error(`${file.name} גדול מ-${MAX_MB}MB`);
          continue;
        }
        const path = await api.uploadDoc(family.id, file);
        added.push({ path, name: file.name, uploadedAt: new Date().toISOString() });
      }
      if (added.length) {
        await updateFamily(family.id, {
          files: { ...(family.files ?? {}), [docKey]: [...files, ...added] },
          documents: { ...family.documents, [docKey]: true },
        });
        logActivity("document_uploaded", `הועלה מסמך "${docLabel}" ל${family.studentName}`, family.id);
        toast.success(`${docLabel}: הקובץ נשמר וסומן כהתקבל`);
      }
    } catch (e) {
      toast.error("ההעלאה נכשלה: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const open = async (f: DocFile) => {
    const w = window.open("", "_blank");
    const url = await api.docUrl(f.path);
    if (!url) {
      w?.close();
      return toast.error("לא ניתן לפתוח את הקובץ");
    }
    if (w) {
      if (url.startsWith("data:")) w.document.write(`<iframe src="${url}" style="border:0;width:100%;height:100%"></iframe>`);
      else w.location.href = url;
    }
  };

  const remove = async (f: DocFile) => {
    if (!window.confirm(`למחוק את הקובץ "${f.name}"?`)) return;
    try {
      await api.deleteDoc(f.path);
      await updateFamily(family.id, { files: { ...(family.files ?? {}), [docKey]: files.filter((x) => x.path !== f.path) } });
    } catch (e) {
      toast.error("המחיקה נכשלה: " + (e instanceof Error ? e.message : String(e)));
    }
  };

  return (
    <div className="flex items-center gap-1 flex-wrap justify-end">
      {files.map((f) => (
        <span key={f.path} className="inline-flex items-center gap-1 text-[11px] bg-card border rounded-md ps-1.5">
          <button type="button" onClick={() => open(f)} className="inline-flex items-center gap-1 hover:underline max-w-[110px] truncate" title={f.name}>
            <FileText size={12} className="text-primary shrink-0" />
            <span className="truncate">{f.name}</span>
          </button>
          <button type="button" onClick={() => remove(f)} className="p-1 text-muted-foreground hover:text-destructive" aria-label={`מחק ${f.name}`}>
            <Trash2 size={11} />
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => upload(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1 text-[11px] font-semibold text-primary hover:bg-primary-soft rounded-md px-1.5 py-1"
        title="העלאת סריקה / צילום של המסמך"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
        {files.length ? "" : "צרף"}
      </button>
    </div>
  );
};
