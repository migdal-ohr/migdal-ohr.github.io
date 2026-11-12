import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Search, CornerDownLeft, UserPlus, LayoutDashboard, Users, Kanban, CalendarDays, BarChart3 } from "lucide-react";
import { useCrm } from "@/store/crmStore";
import { matchesSearch } from "./SearchBar";
import { normalizeText } from "@/lib/validation";
import { GRADE_LABEL, STAGE_DOT, STAGE_LABELS } from "@/types/crm";
import { cn } from "@/lib/utils";
import type { View } from "./Sidebar";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onOpenFamily: (id: string) => void;
  onNavigate: (v: View) => void;
  onAddStudent: () => void;
}

type Item =
  | { kind: "family"; id: string; title: string; sub: string; dot: string }
  | { kind: "action"; id: string; title: string; icon: typeof Search; run: () => void };

/** Ctrl+K / "/" — jump to any of 1,400 students in two keystrokes. */
export const CommandPalette = ({ open, onOpenChange, onOpenFamily, onNavigate, onAddStudent }: Props) => {
  const { allFamilies } = useCrm();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
    }
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { kind: "action", id: "add", title: "הוספת תלמיד חדש", icon: UserPlus, run: onAddStudent },
      { kind: "action", id: "dash", title: "מעבר ללוח הבקרה", icon: LayoutDashboard, run: () => onNavigate("dashboard") },
      { kind: "action", id: "table", title: "מעבר לרשימת התלמידים", icon: Users, run: () => onNavigate("students") },
      { kind: "action", id: "kanban", title: "מעבר לסטטוס תלמידים", icon: Kanban, run: () => onNavigate("kanban") },
      { kind: "action", id: "cal", title: "מעבר ללוח השנה", icon: CalendarDays, run: () => onNavigate("calendar") },
      { kind: "action", id: "stats", title: "מעבר לסטטיסטיקות", icon: BarChart3, run: () => onNavigate("stats") },
    ];
    const query = q.trim();
    const fams: Item[] = query
      ? allFamilies
          .filter((f) => matchesSearch(f, query))
          .map((f) => ({ f, rank: (normalizeText(f.studentName).includes(normalizeText(query)) ? 0 : 2) + (f.isArchived ? 1 : 0) }))
          .sort((a, b) => a.rank - b.rank)
          .map((x) => x.f)
          .slice(0, 30)
          .map((f) => ({
            kind: "family" as const,
            id: f.id,
            title: f.studentName,
            sub: `${GRADE_LABEL[f.grade]} · ${STAGE_LABELS[f.stage]}${f.city ? ` · ${f.city}` : ""}${f.isArchived ? " · בארכיון" : ""}`,
            dot: STAGE_DOT[f.stage],
          }))
      : [];
    const matchingActions = query ? actions.filter((a) => a.title.includes(query)) : actions;
    return [...fams, ...matchingActions];
  }, [q, allFamilies, onAddStudent, onNavigate]);

  useEffect(() => setIdx(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${idx}"]`)?.scrollIntoView({ block: "nearest" });
  }, [idx]);

  const choose = (it: Item | undefined) => {
    if (!it) return;
    onOpenChange(false);
    if (it.kind === "family") onOpenFamily(it.id);
    else it.run();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden top-[20%] translate-y-0" dir="rtl">
        <DialogTitle className="sr-only">חיפוש מהיר</DialogTitle>
        <DialogDescription className="sr-only">חיפוש תלמיד או פעולה</DialogDescription>
        <div className="flex items-center gap-2 border-b ps-4 pe-12">
          <Search size={18} className="text-muted-foreground" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                choose(items[idx]);
              }
            }}
            placeholder="חפשו תלמיד (שם, ת.ז., טלפון) או פעולה…"
            className="flex-1 h-14 bg-transparent outline-none text-base"
            aria-label="חיפוש מהיר"
          />
        </div>
        <ul ref={listRef} className="max-h-[50vh] overflow-y-auto p-2" role="listbox">
          {items.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">לא נמצאו תוצאות</li>}
          {items.map((it, i) => (
            <li
              key={`${it.kind}-${it.id}`}
              data-idx={i}
              role="option"
              aria-selected={i === idx}
              onMouseEnter={() => setIdx(i)}
              onClick={() => choose(it)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer",
                i === idx ? "bg-primary text-primary-foreground" : "hover:bg-muted",
              )}
            >
              {it.kind === "family" ? (
                <span className={cn("size-2.5 rounded-full shrink-0", it.dot)} />
              ) : (
                <it.icon size={16} className="shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{it.title}</div>
                {it.kind === "family" && (
                  <div className={cn("text-xs truncate", i === idx ? "text-primary-foreground/80" : "text-muted-foreground")}>{it.sub}</div>
                )}
              </div>
              {i === idx && <CornerDownLeft size={14} />}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
};
