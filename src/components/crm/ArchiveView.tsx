import { useMemo, useState } from "react";
import { useCan } from "@/lib/session";
import { useCrm } from "@/store/crmStore";
import { GRADE_LABEL, STAGE_LABELS, REGISTRATION_TRACK_BADGE, REGISTRATION_TRACK_LABELS, RegistrationTrack } from "@/types/crm";
import { Archive, RotateCcw, Trash2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { formatPhone } from "@/lib/whatsapp";
import { SearchBar, matchesSearch, matchesTrack } from "./SearchBar";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  onOpenFamily: (id: string) => void;
}

const PAGE = 100;

export const ArchiveView = ({ onOpenFamily }: Props) => {
  const { archivedFamilies, setArchived, deleteFamily } = useCrm();
  const can = useCan();
  const [search, setSearch] = useState("");
  const [trackFilter, setTrackFilter] = useState<RegistrationTrack | "all">("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);

  const items = useMemo(
    () =>
      archivedFamilies
        .filter((f) => matchesSearch(f, search) && matchesTrack(f, trackFilter))
        .sort((a, b) => +new Date(b.updatedAt ?? b.createdAt) - +new Date(a.updatedAt ?? a.createdAt)),
    [archivedFamilies, search, trackFilter],
  );

  const target = archivedFamilies.find((f) => f.id === deleteId);

  const onRestore = async (id: string, name: string) => {
    await setArchived(id, false);
    toast.success(`${name} שוחזר מהארכיון`);
  };

  const onPermanentDelete = async () => {
    if (!deleteId) return;
    const name = target?.studentName ?? "";
    await deleteFamily(deleteId);
    setDeleteId(null);
    toast.success(`${name} נמחק סופית`);
  };

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-muted text-foreground flex items-center justify-center shadow-soft">
          <Archive size={22} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold">ארכיון תלמידים</h2>
          <p className="text-muted-foreground mt-1">{archivedFamilies.length} תלמידים בארכיון — ניתן לשחזר או למחוק סופית</p>
        </div>
      </header>

      <SearchBar value={search} onChange={setSearch} trackFilter={trackFilter} onTrackFilterChange={setTrackFilter} />

      {items.length === 0 ? (
        <div className="card-elev p-12 text-center text-sm text-muted-foreground">הארכיון ריק</div>
      ) : (
        <div className="card-elev divide-y divide-border overflow-hidden">
          {items.slice(0, limit).map((f) => (
            <div key={f.id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/40 transition-colors">
              <button type="button" onClick={() => onOpenFamily(f.id)} className="flex-1 min-w-0 text-right">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-bold truncate">{f.studentName}</span>
                  <span className="text-[10px] font-bold bg-primary-soft text-primary px-2 py-0.5 rounded-md">{GRADE_LABEL[f.grade]}</span>
                  {f.registrationTrack && (
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border", REGISTRATION_TRACK_BADGE[f.registrationTrack])}>
                      {REGISTRATION_TRACK_LABELS[f.registrationTrack]}
                    </span>
                  )}
                  <span className="text-[10px] font-semibold bg-muted text-muted-foreground px-2 py-0.5 rounded-md">{STAGE_LABELS[f.stage]}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-2 truncate">
                  <span className="truncate">{f.parentNames}</span>
                  <span className="inline-flex items-center gap-1">
                    <Phone size={11} /> <span dir="ltr">{formatPhone(f.phone)}</span>
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => onRestore(f.id, f.studentName)} className={can.edit ? "" : "hidden"}>
                  <RotateCcw size={14} />
                  שחזר
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setDeleteId(f.id)} className={can.delete ? "" : "hidden"}>
                  <Trash2 size={14} />
                  מחק סופית
                </Button>
              </div>
            </div>
          ))}
          {items.length > limit && (
            <div className="p-3 text-center">
              <Button variant="ghost" onClick={() => setLimit((l) => l + PAGE)}>
                הצג עוד ({items.length - limit})
              </Button>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-right">
              <Trash2 className="text-destructive" size={20} />
              מחיקה סופית
            </AlertDialogTitle>
            <AlertDialogDescription className="text-right">
              האם אתה בטוח שברצונך למחוק סופית את {target?.studentName}? כל הנתונים יימחקו מהמערכת ופעולה זו אינה הפיכה.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogAction onClick={onPermanentDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              מחק סופית
            </AlertDialogAction>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
