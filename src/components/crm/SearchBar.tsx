import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Family,
  REGISTRATION_TRACK_LABELS,
  REGISTRATION_TRACK_ORDER,
  RegistrationTrack,
} from "@/types/crm";
import { normalizeText, onlyDigits } from "@/lib/validation";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  trackFilter?: RegistrationTrack | "all";
  onTrackFilterChange?: (v: RegistrationTrack | "all") => void;
  children?: React.ReactNode;
}

export const SearchBar = forwardRef<HTMLInputElement, Props>(
  ({ value, onChange, placeholder, trackFilter, onTrackFilterChange, children }, ref) => (
    <div className="flex flex-col sm:flex-row flex-wrap gap-2 w-full">
      <div className="relative w-full sm:max-w-md">
        <Search
          size={18}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <Input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "חיפוש לפי שם, ת.ז., טלפון או עיר..."}
          className="pr-10 pl-9 h-11 bg-card shadow-soft"
          aria-label="חיפוש"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="נקה חיפוש"
            className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
      {onTrackFilterChange && (
        <Select
          value={trackFilter ?? "all"}
          onValueChange={(v) => onTrackFilterChange(v as RegistrationTrack | "all")}
        >
          <SelectTrigger className="h-11 w-full sm:w-56 bg-card shadow-soft" aria-label="סינון לפי מסלול">
            <SelectValue placeholder="סינון לפי מסלול" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">סינון לפי מסלול: הכל</SelectItem>
            {REGISTRATION_TRACK_ORDER.map((t) => (
              <SelectItem key={t} value={t}>
                {REGISTRATION_TRACK_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {children}
    </div>
  ),
);
SearchBar.displayName = "SearchBar";

/* ---------------- search index (cached per family object) ---------------- */

interface SearchKey {
  text: string;
  digits: string[];
}
const cache = new WeakMap<Family, SearchKey>();

const keyFor = (f: Family): SearchKey => {
  let k = cache.get(f);
  if (!k) {
    k = {
      text: normalizeText(
        [f.studentName, f.parentNames, f.fatherName, f.motherName, f.city, f.notes].filter(Boolean).join(" | "),
      ),
      digits: [f.studentId, f.phone, f.phone2, f.fatherPhone, f.motherPhone].map(onlyDigits).filter(Boolean),
    };
    cache.set(f, k);
  }
  return k;
};

export const matchesSearch = (f: Family, query: string): boolean => {
  const q = query.trim();
  if (!q) return true;
  const k = keyFor(f);
  const qDigits = onlyDigits(q);
  // numeric query → ID / phone
  if (qDigits && qDigits.length >= 3 && qDigits.length === q.replace(/[\s-]/g, "").length) {
    const local = qDigits.startsWith("972") ? "0" + qDigits.slice(3) : qDigits;
    return k.digits.some((d) => d.includes(qDigits) || d.includes(local));
  }
  // every word must appear (so "כהן משה" finds "משה כהן")
  const words = normalizeText(q).split(" ").filter(Boolean);
  return words.every((w) => k.text.includes(w));
};

export const matchesTrack = (
  f: Family,
  track: RegistrationTrack | "all" | undefined,
): boolean => {
  if (!track || track === "all") return true;
  return f.registrationTrack === track;
};
