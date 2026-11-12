import { useEffect, useMemo, useState } from "react";
import { useCan } from "@/lib/session";
import { useCrm } from "@/store/crmStore";
import {
  Family,
  GRADE_LABEL,
  Grade,
  REGISTRATION_TRACK_BADGE,
  REGISTRATION_TRACK_LABELS,
  RegistrationTrack,
  STAGE_DOT,
  STAGE_LABELS,
  STAGE_ORDER,
  Stage,
  getRequiredDocuments,
  stationsDoneCount,
  STATION_ORDER,
} from "@/types/crm";
import { SearchBar, matchesSearch, matchesTrack } from "./SearchBar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  FileSpreadsheet,
  Filter,
  ListChecks,
  Archive,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  AlertTriangle,
  Copy,
  UserPlus,
  X,
  Users,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPhone } from "@/lib/whatsapp";
import { exportFamiliesToExcel } from "@/lib/excel";
import { ImportDialog } from "./ImportDialog";
import { WhatsAppQueue } from "./WhatsAppQueue";
import { toast } from "sonner";
import { isSameDay, addDays, startOfDay } from "@/lib/dates";

type SortKey = "name" | "grade" | "track" | "stage" | "city" | "meeting" | "docs" | "created" | "updated";
type DocsFilter = "all" | "missing" | "complete";
type MeetingFilter = "all" | "none" | "has" | "today" | "week" | "past";
type RsvpFilter = "all" | "pending" | "confirmed" | "reschedule_requested";

const PAGE_SIZES = [25, 50, 100, 200];
const GRADES = (Object.keys(GRADE_LABEL).map(Number) as Grade[]).sort((a, b) => a - b);
const STAGES: Stage[] = [...STAGE_ORDER, "persuasion"];

interface Props {
  onOpenFamily: (id: string) => void;
  onAddStudent: () => void;
  /** optional preset filter coming from the dashboard / stats */
  preset?: Partial<{ stage: Stage; docs: DocsFilter; meeting: MeetingFilter }>;
}

const SS_KEY = "students-table-state";

export const StudentsTable = ({ onOpenFamily, onAddStudent, preset }: Props) => {
  const { families, archivedFamilies, getAppointment, bulkUpdateStage, bulkArchive } = useCrm();
  const can = useCan();

  const saved = useMemo(() => {
    try {
      return JSON.parse(sessionStorage.getItem(SS_KEY) || "{}");
    } catch {
      return {};
    }
  }, []);

  const [search, setSearch] = useState<string>(saved.search ?? "");
  const [track, setTrack] = useState<RegistrationTrack | "all">(saved.track ?? "all");
  const [stage, setStage] = useState<Stage | "all">(preset?.stage ?? saved.stage ?? "all");
  const [grade, setGrade] = useState<string>(saved.grade ?? "all");
  const [city, setCity] = useState<string>(saved.city ?? "all");
  const [docs, setDocs] = useState<DocsFilter>(preset?.docs ?? saved.docs ?? "all");
  const [meeting, setMeeting] = useState<MeetingFilter>(preset?.meeting ?? saved.meeting ?? "all");
  const [rsvp, setRsvp] = useState<RsvpFilter>(saved.rsvp ?? "all");
  const [showArchived, setShowArchived] = useState<boolean>(saved.showArchived ?? false);
  const [sortKey, setSortKey] = useState<SortKey>(saved.sortKey ?? "updated");
  const [sortDir, setSortDir] = useState<"asc" | "desc">(saved.sortDir ?? "desc");
  const [pageSize, setPageSize] = useState<number>(saved.pageSize ?? 50);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  useEffect(() => {
    try {
      sessionStorage.setItem(
        SS_KEY,
        JSON.stringify({ search, track, stage, grade, city, docs, meeting, rsvp, showArchived, sortKey, sortDir, pageSize }),
      );
    } catch {
      /* ignore */
    }
  }, [search, track, stage, grade, city, docs, meeting, rsvp, showArchived, sortKey, sortDir, pageSize]);

  const source = showArchived ? archivedFamilies : families;

  const cities = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of families) if (f.city) counts.set(f.city.trim(), (counts.get(f.city.trim()) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [families]);

  const docStats = useMemo(() => {
    const m = new Map<string, { done: number; total: number }>();
    for (const f of source) {
      const req = getRequiredDocuments(f);
      m.set(f.id, { done: req.filter((d) => f.documents[d.key]).length, total: req.length });
    }
    return m;
  }, [source]);

  const filtered = useMemo(() => {
    const today = startOfDay(new Date());
    const weekEnd = addDays(today, 7);
    return source.filter((f) => {
      if (!matchesSearch(f, search) || !matchesTrack(f, track)) return false;
      if (stage !== "all" && f.stage !== stage) return false;
      if (grade !== "all" && String(f.grade) !== grade) return false;
      if (city !== "all" && (f.city ?? "").trim() !== city) return false;
      if (rsvp !== "all" && (f.rsvpStatus ?? "pending") !== rsvp) return false;
      const ds = docStats.get(f.id)!;
      if (docs === "missing" && ds.done >= ds.total) return false;
      if (docs === "complete" && ds.done < ds.total) return false;
      if (meeting !== "all") {
        const a = getAppointment(f.id);
        const d = a ? new Date(a.date) : null;
        if (meeting === "none" && d) return false;
        if (meeting === "has" && !d) return false;
        if (meeting === "today" && (!d || !isSameDay(d, today))) return false;
        if (meeting === "week" && (!d || d < today || d >= weekEnd)) return false;
        if (meeting === "past" && (!d || d >= today)) return false;
      }
      return true;
    });
  }, [source, search, track, stage, grade, city, rsvp, docs, meeting, docStats, getAppointment]);

  const sorted = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    const val = (f: Family): string | number => {
      switch (sortKey) {
        case "name":
          return `${f.lastName} ${f.firstName}`;
        case "grade":
          return f.grade;
        case "track":
          return f.registrationTrack ?? "";
        case "stage":
          return STAGES.indexOf(f.stage);
        case "city":
          return f.city ?? "";
        case "meeting": {
          const a = getAppointment(f.id);
          return a ? +new Date(a.date) : sortDir === "asc" ? Infinity : -Infinity;
        }
        case "docs": {
          const d = docStats.get(f.id)!;
          return d.total ? d.done / d.total : 1;
        }
        case "created":
          return +new Date(f.createdAt);
        case "updated":
          return +new Date(f.updatedAt ?? f.createdAt);
      }
    };
    return [...filtered].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (typeof x === "string" && typeof y === "string") return x.localeCompare(y, "he") * dir;
      return ((x as number) - (y as number)) * dir;
    });
  }, [filtered, sortKey, sortDir, getAppointment, docStats]);

  // keep page in range when filters change
  useEffect(() => setPage(0), [search, track, stage, grade, city, docs, meeting, rsvp, showArchived, pageSize]);
  // drop selections that are no longer visible
  useEffect(() => {
    setSelected((prev) => {
      const ids = new Set(filtered.map((f) => f.id));
      const next = new Set([...prev].filter((id) => ids.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const pageRows = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((f) => selected.has(f.id));

  const activeFilters =
    (search ? 1 : 0) +
    (track !== "all" ? 1 : 0) +
    (stage !== "all" ? 1 : 0) +
    (grade !== "all" ? 1 : 0) +
    (city !== "all" ? 1 : 0) +
    (docs !== "all" ? 1 : 0) +
    (meeting !== "all" ? 1 : 0) +
    (rsvp !== "all" ? 1 : 0);

  const clearFilters = () => {
    setSearch("");
    setTrack("all");
    setStage("all");
    setGrade("all");
    setCity("all");
    setDocs("all");
    setMeeting("all");
    setRsvp("all");
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir(k === "name" || k === "city" || k === "meeting" ? "asc" : "desc");
    }
  };

  const selectedFamilies = () => sorted.filter((f) => selected.has(f.id));

  const exportRows = (rows: Family[], label: string) => {
    if (rows.length === 0) return toast.info("אין שורות לייצוא");
    exportFamiliesToExcel(rows, getAppointment, label);
    toast.success(`יוצאו ${rows.length} תלמידים לאקסל`);
  };

  const copyPhones = async () => {
    const phones = selectedFamilies()
      .flatMap((f) => [f.fatherPhone, f.motherPhone])
      .filter(Boolean)
      .map((p) => formatPhone(p));
    const unique = [...new Set(phones)];
    try {
      await navigator.clipboard.writeText(unique.join("\n"));
      toast.success(`הועתקו ${unique.length} מספרי טלפון`);
    } catch {
      toast.error("לא ניתן להעתיק");
    }
  };

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <th className={cn("text-right font-semibold text-muted-foreground px-3 py-2.5 whitespace-nowrap", className)}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        {sortKey === k ? sortDir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} /> : <ArrowUpDown size={13} className="opacity-40" />}
      </button>
    </th>
  );

  return (
    <div className="space-y-4 animate-fade-in">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-3xl font-bold flex items-center gap-2">
            <Users className="text-primary" /> רשימת תלמידים
          </h2>
          <p className="text-muted-foreground mt-1">
            {sorted.length.toLocaleString("he-IL")} מתוך {source.length.toLocaleString("he-IL")} {showArchived ? "בארכיון" : "פעילים"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)} className={can.edit ? "" : "hidden"}>
            <FileSpreadsheet size={16} /> ייבוא מאקסל
          </Button>
          <Button variant="outline" onClick={() => exportRows(sorted, "רשימת-תלמידים")}>
            <Download size={16} /> ייצוא ({sorted.length})
          </Button>
          <Button onClick={onAddStudent} className={can.edit ? "" : "hidden"}>
            <UserPlus size={16} /> תלמיד חדש
          </Button>
        </div>
      </header>

      <div className="card-elev p-3 space-y-3">
        <SearchBar value={search} onChange={setSearch} trackFilter={track} onTrackFilterChange={setTrack} />
        <div className="flex flex-wrap gap-2 items-center">
          <Filter size={16} className="text-muted-foreground" />
          <FilterSelect value={stage} onChange={(v) => setStage(v as Stage | "all")} label="סטטוס" options={STAGES.map((s) => [s, STAGE_LABELS[s]])} />
          <FilterSelect value={grade} onChange={setGrade} label="כיתה" options={GRADES.map((g) => [String(g), GRADE_LABEL[g]])} />
          <FilterSelect value={city} onChange={setCity} label="עיר" options={cities.map(([c, n]) => [c, `${c} (${n})`])} />
          <FilterSelect
            value={docs}
            onChange={(v) => setDocs(v as DocsFilter)}
            label="מסמכים"
            options={[
              ["missing", "חסרים מסמכים"],
              ["complete", "כל המסמכים התקבלו"],
            ]}
          />
          <FilterSelect
            value={meeting}
            onChange={(v) => setMeeting(v as MeetingFilter)}
            label="פגישה"
            options={[
              ["today", "היום"],
              ["week", "בשבוע הקרוב"],
              ["past", "פגישה שעברה"],
              ["has", "נקבעה פגישה"],
              ["none", "ללא פגישה"],
            ]}
          />
          <FilterSelect
            value={rsvp}
            onChange={(v) => setRsvp(v as RsvpFilter)}
            label="אישור הגעה"
            options={[
              ["pending", "ממתין"],
              ["confirmed", "אישר"],
              ["reschedule_requested", "ביקש מועד חדש"],
            ]}
          />
          <label className="flex items-center gap-2 text-sm px-2 cursor-pointer">
            <Checkbox checked={showArchived} onCheckedChange={(c) => setShowArchived(!!c)} />
            ארכיון
          </label>
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X size={14} /> נקה {activeFilters} סינונים
            </Button>
          )}
        </div>
      </div>

      {selected.size > 0 && can.edit && (
        <div className="sticky top-2 z-20 card-elev p-3 flex flex-wrap items-center gap-2 border-primary/40 bg-primary-soft">
          <ListChecks size={18} className="text-primary" />
          <span className="font-semibold">{selected.size} נבחרו</span>
          <DropdownMenu dir="rtl">
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                העבר לסטטוס…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>העברת {selected.size} תלמידים ל:</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {STAGES.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={async () => {
                    await bulkUpdateStage([...selected], s);
                    toast.success(`${selected.size} תלמידים הועברו ל"${STAGE_LABELS[s]}"`);
                    setSelected(new Set());
                  }}
                >
                  <span className={cn("size-2 rounded-full me-2", STAGE_DOT[s])} />
                  {STAGE_LABELS[s]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button size="sm" variant="outline" onClick={() => exportRows(selectedFamilies(), "תלמידים-נבחרים")}>
            <Download size={14} /> ייצוא
          </Button>
          <Button size="sm" variant="outline" onClick={() => setQueueOpen(true)}>
            <MessageSquare size={14} className="text-[#25D366]" /> וואטסאפ לנבחרים
          </Button>
          <Button size="sm" variant="outline" onClick={copyPhones}>
            <Copy size={14} /> העתק טלפונים
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              const ids = [...selected];
              await bulkArchive(ids, !showArchived);
              toast.success(showArchived ? `${ids.length} שוחזרו` : `${ids.length} הועברו לארכיון`);
              setSelected(new Set());
            }}
          >
            <Archive size={14} /> {showArchived ? "שחזר מהארכיון" : "העבר לארכיון"}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            ביטול בחירה
          </Button>
          {selected.size < sorted.length && (
            <Button size="sm" variant="link" onClick={() => setSelected(new Set(sorted.map((f) => f.id)))}>
              בחר את כל {sorted.length} התוצאות
            </Button>
          )}
        </div>
      )}

      <div className="card-elev overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="w-10 px-3">
                  <Checkbox
                    aria-label="בחר את כל העמוד"
                    checked={allOnPageSelected}
                    onCheckedChange={(c) =>
                      setSelected((prev) => {
                        const next = new Set(prev);
                        for (const f of pageRows) {
                          if (c) next.add(f.id);
                          else next.delete(f.id);
                        }
                        return next;
                      })
                    }
                  />
                </th>
                <SortHead k="name">שם</SortHead>
                <SortHead k="grade">כיתה</SortHead>
                <SortHead k="track">מסלול</SortHead>
                <SortHead k="stage">סטטוס</SortHead>
                <SortHead k="city" className="hidden lg:table-cell">
                  עיר
                </SortHead>
                <th className="text-right font-semibold text-muted-foreground px-3 py-2.5 hidden xl:table-cell">טלפון</th>
                <SortHead k="meeting">פגישה</SortHead>
                <SortHead k="docs">מסמכים</SortHead>
                <th className="text-right font-semibold text-muted-foreground px-3 py-2.5 hidden md:table-cell">תחנות</th>
                <SortHead k="updated" className="hidden lg:table-cell">
                  עודכן
                </SortHead>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((f) => {
                const a = getAppointment(f.id);
                const ds = docStats.get(f.id)!;
                const complete = ds.done >= ds.total;
                const st = stationsDoneCount(f);
                return (
                  <tr
                    key={f.id}
                    className={cn("border-b last:border-0 hover:bg-muted/40 cursor-pointer transition-colors", selected.has(f.id) && "bg-primary-soft/60")}
                    onClick={() => onOpenFamily(f.id)}
                  >
                    <td className="px-3" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        aria-label={`בחר ${f.studentName}`}
                        checked={selected.has(f.id)}
                        onCheckedChange={(c) =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (c) next.add(f.id);
                            else next.delete(f.id);
                            return next;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="font-semibold">{f.studentName}</div>
                      <div className="text-xs text-muted-foreground truncate max-w-[200px]">{f.parentNames}</div>
                    </td>
                    <td className="px-3 whitespace-nowrap">{GRADE_LABEL[f.grade]}</td>
                    <td className="px-3">
                      {f.registrationTrack && (
                        <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-md border whitespace-nowrap", REGISTRATION_TRACK_BADGE[f.registrationTrack])}>
                          {REGISTRATION_TRACK_LABELS[f.registrationTrack]}
                        </span>
                      )}
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={cn("size-2 rounded-full", STAGE_DOT[f.stage])} />
                        {STAGE_LABELS[f.stage]}
                      </span>
                    </td>
                    <td className="px-3 hidden lg:table-cell">{f.city}</td>
                    <td className="px-3 hidden xl:table-cell whitespace-nowrap" dir="ltr">
                      {formatPhone(f.phone)}
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      {a ? (
                        <span className="inline-flex items-center gap-1">
                          {new Date(a.date).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}{" "}
                          <span className="text-muted-foreground">{new Date(a.date).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
                          {f.rsvpStatus === "confirmed" && <CheckCircle2 size={14} className="text-success" aria-label="אישר הגעה" />}
                          {f.rsvpStatus === "reschedule_requested" && <AlertTriangle size={14} className="text-destructive" aria-label="ביקש מועד חדש" />}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 whitespace-nowrap">
                      <span
                        className={cn(
                          "text-xs font-semibold px-2 py-0.5 rounded-md",
                          complete ? "bg-success-soft text-success" : "bg-warning-soft text-warning-foreground",
                        )}
                      >
                        {ds.done}/{ds.total}
                      </span>
                    </td>
                    <td className="px-3 hidden md:table-cell text-xs text-muted-foreground">
                      {st}/{STATION_ORDER.length}
                    </td>
                    <td className="px-3 hidden lg:table-cell text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(f.updatedAt ?? f.createdAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })}
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="text-center py-16 text-muted-foreground">
                    לא נמצאו תלמידים התואמים לסינון
                    {activeFilters > 0 && (
                      <div>
                        <Button variant="link" onClick={clearFilters}>
                          נקה סינונים
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-t bg-muted/20 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">שורות בעמוד</span>
            <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
              <SelectTrigger className="h-8 w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZES.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button size="icon" variant="outline" className="size-8" disabled={page === 0} onClick={() => setPage((p) => p - 1)} aria-label="עמוד קודם">
              <ChevronRight size={16} />
            </Button>
            <span>
              עמוד {page + 1} מתוך {pages}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="size-8"
              disabled={page >= pages - 1}
              onClick={() => setPage((p) => p + 1)}
              aria-label="עמוד הבא"
            >
              <ChevronLeft size={16} />
            </Button>
          </div>
        </div>
      </div>

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} />
      <WhatsAppQueue
        open={queueOpen}
        onClose={() => setQueueOpen(false)}
        title={`${selected.size} תלמידים נבחרים`}
        defaultTemplate="custom"
        families={queueOpen ? selectedFamilies() : []}
      />
    </div>
  );
};

const FilterSelect = ({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: [string, string][];
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className={cn("h-9 w-auto min-w-[120px] gap-2 bg-card", value !== "all" && "border-primary text-primary font-semibold")}>
      <SelectValue placeholder={label} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="all">{label}: הכל</SelectItem>
      {options.map(([v, l]) => (
        <SelectItem key={v} value={v}>
          {l}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);
