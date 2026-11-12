import { useMemo, useState } from "react";
import { useCan } from "@/lib/session";
import { useCrm } from "@/store/crmStore";
import { GRADE_LABEL, REGISTRATION_TRACK_BADGE, REGISTRATION_TRACK_LABELS, RegistrationTrack } from "@/types/crm";
import { HeartHandshake, Phone, Clock, MessageCircle, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatPhone, buildFollowUpMessage } from "@/lib/whatsapp";
import { daysAgo } from "@/lib/dates";
import { SearchBar, matchesSearch, matchesTrack } from "./SearchBar";
import { WhatsAppActionButton } from "./WhatsAppActionButton";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  onOpenFamily: (id: string) => void;
}

export const PersuasionView = ({ onOpenFamily }: Props) => {
  const { families, updateFamilyStage } = useCrm();
  const can = useCan();
  const [search, setSearch] = useState("");
  const [trackFilter, setTrackFilter] = useState<RegistrationTrack | "all">("all");

  const items = useMemo(
    () =>
      families
        .filter((f) => f.stage === "persuasion")
        .filter((f) => matchesSearch(f, search) && matchesTrack(f, trackFilter))
        .sort((a, b) => +new Date(a.updatedAt ?? a.createdAt) - +new Date(b.updatedAt ?? b.createdAt)),
    [families, search, trackFilter],
  );

  return (
    <div className="animate-fade-in space-y-6">
      <header className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-rose-500 text-white flex items-center justify-center shadow-soft">
          <HeartHandshake size={22} />
        </div>
        <div>
          <h2 className="font-display text-3xl font-bold">תלמידים לשכנוע</h2>
          <p className="text-muted-foreground mt-1">משפחות שביטלו או מתלבטות — מסודר מהזמן הכי ארוך בלי קשר</p>
        </div>
      </header>

      <SearchBar value={search} onChange={setSearch} trackFilter={trackFilter} onTrackFilterChange={setTrackFilter} />

      {items.length === 0 ? (
        <div className="card-elev p-12 text-center text-sm text-muted-foreground">אין כרגע תלמידים לשכנוע 🎉</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((f) => {
            const stale = daysAgo(f.updatedAt ?? f.createdAt);
            const staleBadge =
              stale !== null && stale > 7
                ? { text: `${stale} ימים ללא עדכון`, cls: "bg-rose-100 text-rose-800" }
                : stale !== null
                  ? { text: stale === 0 ? "עודכן היום" : `עודכן לפני ${stale} ימים`, cls: "bg-muted text-muted-foreground" }
                  : null;
            return (
              <div
                key={f.id}
                onClick={() => onOpenFamily(f.id)}
                className="card-elev p-4 cursor-pointer hover:-translate-y-0.5 transition-all border-r-4 border-rose-400"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-display font-bold truncate">{f.studentName}</h4>
                    <p className="text-xs text-muted-foreground truncate">
                      {GRADE_LABEL[f.grade]} · {f.parentNames}
                    </p>
                  </div>
                  {f.registrationTrack && (
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-md border", REGISTRATION_TRACK_BADGE[f.registrationTrack])}>
                      {REGISTRATION_TRACK_LABELS[f.registrationTrack]}
                    </span>
                  )}
                </div>

                <div className="mt-3 p-3 rounded-lg bg-rose-50 border border-rose-200 min-h-[64px]">
                  <div className="text-[11px] font-bold text-rose-700 mb-1">סיבת ההיסוס</div>
                  <p className="text-sm text-rose-900 whitespace-pre-wrap">
                    {f.hesitationReason || <span className="italic text-muted-foreground">לא צוינה — כדאי לברר</span>}
                  </p>
                </div>

                <div className="flex items-center justify-between mt-3 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Phone size={12} /> <span dir="ltr">{formatPhone(f.phone)}</span>
                  </span>
                  {staleBadge && (
                    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-semibold", staleBadge.cls)}>
                      <Clock size={11} /> {staleBadge.text}
                    </span>
                  )}
                </div>

                <div className={can.edit ? "mt-3 flex items-center gap-2 flex-wrap" : "hidden"} onClick={(e) => e.stopPropagation()}>
                  <WhatsAppActionButton
                    fatherPhone={f.fatherPhone}
                    motherPhone={f.motherPhone}
                    message={(parent) =>
                      buildFollowUpMessage((parent === "father" ? f.fatherName : f.motherName) || f.parentNames, f.studentName)
                    }
                    label="פנייה"
                    variant="card"
                  />
                  <Button size="sm" variant="outline" onClick={() => onOpenFamily(f.id)}>
                    <MessageCircle size={14} />
                    פרטים
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await updateFamilyStage(f.id, "leads");
                      toast.success(`${f.studentName} חזר למתעניינים 🎉`);
                    }}
                  >
                    <Undo2 size={14} /> חזר להתעניין
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
