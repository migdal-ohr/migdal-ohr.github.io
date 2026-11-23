import { useMemo, useState } from "react";
import { Copy, Plus, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  CAMP_LABELS,
  GENDER_LABELS,
  HMO_LABELS,
  OUTCOME_LABELS,
  OUTCOME_ORDER,
  RELIGIOUS_LABELS,
  StudentDetails,
} from "@/types/crm";
import { addSchool, useCityNames, useRecruiters, useSchools } from "@/lib/api/extras";
import { useCan } from "@/lib/session";

export type DetailsState = StudentDetails;
type SetD = (k: keyof StudentDetails, v: StudentDetails[keyof StudentDetails]) => void;

const NONE = "__none";

const F = ({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) => (
  <div className={`space-y-1.5 ${className}`}>
    <Label>{label}</Label>
    {children}
  </div>
);

const Txt = ({ d, setD, k, ...rest }: { d: DetailsState; setD: SetD; k: keyof StudentDetails } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <Input value={(d[k] as string | number | undefined) ?? ""} onChange={(e) => setD(k, e.target.value)} {...rest} />
);

const Pick = ({ d, setD, k, options, placeholder = "בחירה" }: { d: DetailsState; setD: SetD; k: keyof StudentDetails; options: Record<string, string>; placeholder?: string }) => (
  <Select value={(d[k] as string) || NONE} onValueChange={(v) => setD(k, v === NONE ? null : v)}>
    <SelectTrigger>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value={NONE}>—</SelectItem>
      {Object.entries(options).map(([v, l]) => (
        <SelectItem key={v} value={v}>
          {l}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
);

/** City input with the national list of localities as suggestions. */
export const CityInput = ({ value, onChange, id, placeholder }: { value: string; onChange: (v: string) => void; id?: string; placeholder?: string }) => {
  const cities = useCityNames();
  const listId = useMemo(() => `cities-${Math.random().toString(36).slice(2)}`, []);
  return (
    <>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} list={cities.length ? listId : undefined} placeholder={placeholder} />
      {cities.length > 0 && (
        <datalist id={listId}>
          {cities.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      )}
    </>
  );
};

/* ------------------------------ step 1: the student ------------------------------ */

export const StudentExtraFields = ({ d, setD, birthDate, setBirthDate }: { d: DetailsState; setD: SetD; birthDate: string; setBirthDate: (v: string) => void }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <F label="מין">
      <Pick d={d} setD={setD} k="gender" options={GENDER_LABELS} />
    </F>
    <F label="תאריך לידה">
      <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} />
    </F>
    <F label="כתובת">
      <Txt d={d} setD={setD} k="address" placeholder="רחוב ומספר" />
    </F>
    <F label="מיקוד">
      <Txt d={d} setD={setD} k="zip" inputMode="numeric" dir="ltr" maxLength={7} />
    </F>
    <F label="מען למכתבים (אם שונה)">
      <Txt d={d} setD={setD} k="mailAddress" />
    </F>
    <F label="אימייל">
      <Txt d={d} setD={setD} k="email" type="email" dir="ltr" />
    </F>
    <F label="טלפון בבית">
      <Txt d={d} setD={setD} k="homePhone" inputMode="tel" dir="ltr" placeholder="04-XXXXXXX" />
    </F>
    <F label="נייד של התלמיד">
      <Txt d={d} setD={setD} k="studentMobile" inputMode="tel" dir="ltr" placeholder="05X-XXXXXXX" />
    </F>
    <F label="ארץ לידה">
      <Txt d={d} setD={setD} k="birthCountry" placeholder="ישראל" />
    </F>
    <F label="תאריך עלייה">
      <Input type="date" value={(d.aliyahDate as string) ?? ""} onChange={(e) => setD("aliyahDate", e.target.value)} />
    </F>
    <F label="קופת חולים">
      <Pick d={d} setD={setD} k="hmo" options={HMO_LABELS} />
    </F>
    <F label="שיוך דתי">
      <Pick d={d} setD={setD} k="religious" options={RELIGIOUS_LABELS} />
    </F>
  </div>
);

/* ------------------------------ step 2: parents ------------------------------ */

const ParentBlock = ({ d, setD, who, label }: { d: DetailsState; setD: SetD; who: "father" | "mother"; label: string }) => {
  const k = (s: string) => `${who}${s}` as keyof StudentDetails;
  const wa = d[k("Whatsapp")];
  return (
    <div className="rounded-xl border p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="font-semibold">{label}</span>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={wa !== false} onCheckedChange={(c) => setD(k("Whatsapp"), c ? null : false)} aria-label={`${label} מקבל/ת וואטסאפ`} />
          מקבל/ת וואטסאפ
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <F label="תעודת זהות">
          <Txt d={d} setD={setD} k={k("IdNumber")} inputMode="numeric" dir="ltr" maxLength={9} />
        </F>
        <F label="שנת לידה">
          <Txt d={d} setD={setD} k={k("BirthYear")} inputMode="numeric" dir="ltr" maxLength={4} placeholder="1980" />
        </F>
        <F label="שנות לימוד">
          <Txt d={d} setD={setD} k={k("SchoolYears")} inputMode="numeric" dir="ltr" maxLength={2} />
        </F>
        <F label="עיר">
          <CityInput value={(d[k("City")] as string) ?? ""} onChange={(v) => setD(k("City"), v)} />
        </F>
        <F label="כתובת" className="col-span-2">
          <Txt d={d} setD={setD} k={k("Address")} />
        </F>
      </div>
    </div>
  );
};

export const ParentsExtraFields = ({ d, setD, studentCity }: { d: DetailsState; setD: SetD; studentCity: string }) => {
  const copy = (from: "father" | "mother" | "student", to: "father" | "mother") => {
    const addr = from === "student" ? d.address : d[`${from}Address` as keyof StudentDetails];
    const city = from === "student" ? studentCity : d[`${from}City` as keyof StudentDetails];
    setD(`${to}Address` as keyof StudentDetails, (addr as string) ?? null);
    setD(`${to}City` as keyof StudentDetails, (city as string) ?? null);
    toast.success("הכתובת הועתקה");
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => (copy("student", "father"), copy("student", "mother"))}>
          <Copy size={13} /> כתובת התלמיד לשני ההורים
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => copy("father", "mother")}>
          <Copy size={13} /> העתק כתובת מאבא לאמא
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={() => copy("mother", "father")}>
          <Copy size={13} /> העתק כתובת מאמא לאבא
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <ParentBlock d={d} setD={setD} who="father" label="אבא" />
        <ParentBlock d={d} setD={setD} who="mother" label="אמא" />
      </div>
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <F label="מספר אחים">
          <Txt d={d} setD={setD} k="siblingsCount" inputMode="numeric" dir="ltr" maxLength={2} />
        </F>
      </div>
    </div>
  );
};

/* ------------------------------ step 3: registration ------------------------------ */

const AddSchoolDialog = ({ open, onClose, city, onAdded }: { open: boolean; onClose: () => void; city: string; onAdded: (name: string, symbol: string | null) => void }) => {
  const [name, setName] = useState("");
  const [c, setC] = useState(city);
  const [symbol, setSymbol] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (name.trim().length < 2) return toast.error("כתבו את שם בית הספר");
    setBusy(true);
    try {
      const s = await addSchool(name, c, symbol);
      onAdded(s.name, s.symbol);
      toast.success("בית הספר נוסף למאגר");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message.includes("duplicate") ? "סמל המוסד כבר קיים במאגר" : String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm">
        <DialogHeader>
          <DialogTitle>הוספת בית ספר</DialogTitle>
          <DialogDescription>בית הספר יישמר במאגר ויופיע לכולם</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <F label="שם בית הספר">
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </F>
          <F label="עיר">
            <CityInput value={c} onChange={setC} />
          </F>
          <F label="סמל מוסד (לא חובה)">
            <Input value={symbol} onChange={(e) => setSymbol(e.target.value.replace(/\D/g, ""))} dir="ltr" inputMode="numeric" />
          </F>
          <Button className="w-full" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="animate-spin" /> : <Plus size={15} />} הוספה
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export const RegistrationExtraFields = ({ d, setD }: { d: DetailsState; setD: SetD }) => {
  const can = useCan();
  const { recruiters } = useRecruiters();
  const { schools } = useSchools();
  const [addOpen, setAddOpen] = useState(false);
  const prevCity = (d.prevCity as string) ?? "";
  const citySchools = useMemo(
    () => (prevCity ? schools.filter((s) => (s.city ?? "").trim() === prevCity.trim()) : schools).slice(0, 500),
    [schools, prevCity],
  );
  const today = () => new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border p-4 space-y-3">
        <div className="font-semibold">החלטה</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <F label="מצב התלמיד">
            <Select value={(d.outcome as string) || "in_process"} onValueChange={(v) => setD("outcome", v === "in_process" ? null : v)} disabled={!can.status}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OUTCOME_ORDER.map((o) => (
                  <SelectItem key={o} value={o}>
                    {OUTCOME_LABELS[o]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="תאריך כניסה למוסד">
            <div className="flex gap-1">
              <Input type="date" value={(d.startDate as string) ?? ""} onChange={(e) => setD("startDate", e.target.value)} disabled={!can.status} />
              <Button type="button" size="sm" variant="outline" onClick={() => setD("startDate", today())} disabled={!can.status}>
                היום
              </Button>
            </div>
          </F>
          <F label="תאריך יציאה">
            <div className="flex gap-1">
              <Input type="date" value={(d.endDate as string) ?? ""} onChange={(e) => setD("endDate", e.target.value)} disabled={!can.status} />
              <Button type="button" size="sm" variant="outline" onClick={() => setD("endDate", today())} disabled={!can.status}>
                היום
              </Button>
            </div>
          </F>
        </div>
      </div>

      <div className="rounded-xl border p-4 space-y-3">
        <div className="font-semibold">לימודים קודמים</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <F label="עיר">
            <CityInput value={prevCity} onChange={(v) => setD("prevCity", v)} />
          </F>
          <F label="בית ספר קודם">
            <div className="flex gap-1">
              <Select
                value={(d.prevSchool as string) || NONE}
                onValueChange={(v) => {
                  if (v === NONE) return setD("prevSchool", null);
                  const s = schools.find((x) => x.name === v);
                  setD("prevSchool", v);
                  setD("prevSchoolSymbol", s?.symbol ?? null);
                  if (!prevCity && s?.city) setD("prevCity", s.city);
                }}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={citySchools.length ? "בחירה" : "אין בתי ספר בעיר"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {d.prevSchool && !citySchools.some((s) => s.name === d.prevSchool) && <SelectItem value={d.prevSchool as string}>{d.prevSchool as string}</SelectItem>}
                  {citySchools.map((s) => (
                    <SelectItem key={s.id} value={s.name}>
                      {s.name}
                      {s.symbol ? ` (${s.symbol})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="button" size="icon" variant="outline" onClick={() => setAddOpen(true)} aria-label="הוסף בית ספר" title='הוסף בי"ס'>
                <Plus size={15} />
              </Button>
            </div>
          </F>
          <F label="למד בכיתה">
            <Txt d={d} setD={setD} k="prevGrade" placeholder="ו׳" />
          </F>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <F label='הרישום בוצע ע"י פעיל'>
          <Select value={(d.recruiterId as string) || NONE} onValueChange={(v) => setD("recruiterId", v === NONE ? null : v)}>
            <SelectTrigger>
              <SelectValue placeholder={recruiters.length ? "בחירה" : "אין פעילים ברשימה"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {recruiters
                .filter((r) => r.is_active || r.id === d.recruiterId)
                .map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </F>
        <F label="קייטנה">
          <Pick d={d} setD={setD} k="campStatus" options={CAMP_LABELS} placeholder="לא ידוע" />
        </F>
      </div>
      <AddSchoolDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        city={prevCity}
        onAdded={(name, symbol) => {
          setD("prevSchool", name);
          setD("prevSchoolSymbol", symbol);
        }}
      />
    </div>
  );
};
