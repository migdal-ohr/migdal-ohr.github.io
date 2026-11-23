import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Save, Loader2, Upload, Trash2, Search, Building2, UserCheck, School as SchoolIcon, MapPin, FileText } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useInstitutionsList, useRecruiters, useSchools, Institution } from "@/lib/api/extras";
import { CatalogDoc, DocMode, getDocsCatalog, setDocsCatalog } from "@/types/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e));

/* ------------------------------ institutions ------------------------------ */

const InstitutionRow = ({ i }: { i: Institution }) => {
  const [v, setV] = useState(i);
  const dirty = JSON.stringify(v) !== JSON.stringify(i);
  const save = async () => {
    const { error } = await supabase
      .from("institutions")
      .update({ name: v.name, phone: v.phone, principal: v.principal, principal_mobile: v.principal_mobile, city: v.city, is_active: v.is_active, sort: v.sort })
      .eq("key", i.key);
    if (error) toast.error(errMsg(error));
    else toast.success("נשמר");
  };
  const f = (k: keyof Institution, label: string, ltr = false) => (
    <Input value={(v[k] as string) ?? ""} onChange={(e) => setV({ ...v, [k]: e.target.value })} placeholder={label} aria-label={label} dir={ltr ? "ltr" : undefined} className="h-9" />
  );
  return (
    <div className="grid gap-2 md:grid-cols-[1.2fr_1fr_1fr_1fr_1fr_auto_auto] items-center p-3 border-b">
      {f("name", "שם המוסד")}
      {f("city", "עיר")}
      {f("phone", "טלפון", true)}
      {f("principal", "מנהל")}
      {f("principal_mobile", "נייד המנהל", true)}
      <label className="flex items-center gap-2 text-sm">
        <Switch checked={v.is_active} onCheckedChange={(c) => setV({ ...v, is_active: c })} aria-label="פעיל" /> פעיל
      </label>
      <Button size="sm" onClick={save} disabled={!dirty}>
        <Save size={14} /> שמירה
      </Button>
    </div>
  );
};

const InstitutionsPanel = () => {
  const { institutions, reload } = useInstitutionsList();
  const [name, setName] = useState("");
  const add = async () => {
    if (name.trim().length < 2) return toast.error("כתבו שם מוסד");
    const key = `inst_${Date.now().toString(36)}`;
    const { error } = await supabase.from("institutions").insert({ key, name: name.trim(), sort: institutions.length + 1 });
    if (error) return toast.error(errMsg(error));
    setName("");
    toast.success("המוסד נוסף. הוא יופיע בבחירת המסלול בטופס התלמיד");
    reload();
  };
  return (
    <div className="space-y-3">
      <div className="card-elev overflow-hidden">
        {institutions.map((i) => (
          <InstitutionRow key={i.key} i={i} />
        ))}
      </div>
      <div className="flex gap-2 max-w-md">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מוסד חדש" />
        <Button onClick={add}>
          <Plus size={15} /> הוספה
        </Button>
      </div>
    </div>
  );
};

/* ------------------------------ recruiters ------------------------------ */

const RecruitersPanel = () => {
  const { recruiters, reload } = useRecruiters();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const add = async () => {
    if (name.trim().length < 2) return toast.error("כתבו שם");
    const { error } = await supabase.from("recruiters").insert({ name: name.trim(), phone: phone.trim() || null });
    if (error) return toast.error(errMsg(error));
    setName("");
    setPhone("");
    reload();
  };
  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await supabase.from("recruiters").update(patch).eq("id", id);
    if (error) toast.error(errMsg(error));
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">פעילים (מגייסים) מופיעים בכרטיס התלמיד בשדה "הרישום בוצע ע״י פעיל", ואפשר לסנן ולהפיק דוח לפיהם.</p>
      <div className="card-elev divide-y">
        {recruiters.length === 0 && <p className="p-4 text-sm text-muted-foreground">אין עדיין פעילים.</p>}
        {recruiters.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-2 p-3">
            <Input defaultValue={r.name} className="h-9 w-48" aria-label="שם" onBlur={(e) => e.target.value !== r.name && update(r.id, { name: e.target.value })} />
            <Input defaultValue={r.phone ?? ""} className="h-9 w-40" dir="ltr" aria-label="טלפון" onBlur={(e) => e.target.value !== (r.phone ?? "") && update(r.id, { phone: e.target.value || null })} />
            <label className="flex items-center gap-2 text-sm">
              <Switch checked={r.is_active} onCheckedChange={(c) => update(r.id, { is_active: c })} aria-label="פעיל" /> {r.is_active ? "פעיל" : "לא פעיל"}
            </label>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם הפעיל" className="w-48" />
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="טלפון" dir="ltr" className="w-40" />
        <Button onClick={add}>
          <Plus size={15} /> הוספה
        </Button>
      </div>
    </div>
  );
};

/* ------------------------------ file import helper ------------------------------ */

const readRows = async (file: File): Promise<Record<string, unknown>[]> => {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", codepage: 1255 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
};
const pick = (row: Record<string, unknown>, patterns: RegExp[]) => {
  for (const [k, v] of Object.entries(row)) if (patterns.some((p) => p.test(k.trim()))) return String(v ?? "").trim();
  return "";
};

/* ------------------------------ schools ------------------------------ */

const SchoolsPanel = () => {
  const { schools, reload } = useSchools();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const shown = useMemo(() => {
    const n = q.trim();
    return (n ? schools.filter((s) => `${s.name} ${s.city ?? ""} ${s.symbol ?? ""}`.includes(n)) : schools).slice(0, 200);
  }, [schools, q]);
  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = await readRows(file);
      const items = rows
        .map((r) => ({
          symbol: pick(r, [/סמל/, /symbol/i]) || null,
          name: pick(r, [/^שם.*מוסד/, /^שם/, /name/i]),
          city: pick(r, [/ישוב|יישוב|עיר/, /city/i]) || null,
        }))
        .filter((r) => r.name);
      for (let i = 0; i < items.length; i += 500) {
        const chunk = items.slice(i, i + 500);
        const withSym = chunk.filter((c) => c.symbol);
        const noSym = chunk.filter((c) => !c.symbol);
        if (withSym.length) {
          const { error } = await supabase.from("schools").upsert(withSym, { onConflict: "symbol" });
          if (error) throw error;
        }
        if (noSym.length) {
          const { error } = await supabase.from("schools").insert(noSym);
          if (error) throw error;
        }
      }
      toast.success(`נטענו ${items.length.toLocaleString("he-IL")} בתי ספר`);
      reload();
    } catch (e) {
      toast.error("הייבוא נכשל: " + errMsg(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  const remove = async (id: string) => {
    if (!confirm("למחוק את בית הספר מהמאגר?")) return;
    const { error } = await supabase.from("schools").delete().eq("id", id);
    if (error) toast.error(errMsg(error));
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Search size={15} className="absolute top-1/2 -translate-y-1/2 right-3 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש: שם, עיר או סמל" className="pr-9" />
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
        <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Upload size={15} />} ייבוא מקובץ (Excel / CSV)
        </Button>
        <span className="text-sm text-muted-foreground">{schools.length.toLocaleString("he-IL")} במאגר</span>
      </div>
      <p className="text-xs text-muted-foreground">הקובץ צריך עמודות "סמל מוסד", "שם מוסד" ו"ישוב" (כמו בקובץ של משרד החינוך). בית ספר עם אותו סמל מתעדכן ולא נכפל.</p>
      <div className="card-elev divide-y max-h-[420px] overflow-y-auto">
        {shown.map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-2.5 text-sm">
            <span className="font-medium flex-1">{s.name}</span>
            <span className="text-muted-foreground w-32">{s.city}</span>
            <span className="text-muted-foreground w-24" dir="ltr">
              {s.symbol}
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(s.id)} aria-label="מחיקה">
              <Trash2 size={13} />
            </Button>
          </div>
        ))}
        {shown.length === 0 && <p className="p-4 text-sm text-muted-foreground">אין תוצאות.</p>}
      </div>
    </div>
  );
};

/* ------------------------------ cities ------------------------------ */

const CitiesPanel = () => {
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    supabase
      .from("cities")
      .select("code", { count: "exact", head: true })
      .then(({ count: c }) => setCount(c ?? 0));
  }, []);
  const importFile = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = await readRows(file);
      const items = rows
        .map((r) => ({
          code: Number(pick(r, [/סמל/, /code/i]).replace(/\D/g, "")),
          name_he: pick(r, [/^שם.?יישוב$|^שם.?ישוב$|^שם_ישוב$|^שם$/, /שם.*(ישוב|יישוב)(?!.*לועזי)/]),
          name_en: pick(r, [/לועזי|אנגלית/, /english|name_en/i]) || null,
        }))
        .filter((r) => r.code > 0 && r.name_he);
      for (let i = 0; i < items.length; i += 500) {
        const { error } = await supabase.from("cities").upsert(items.slice(i, i + 500), { onConflict: "code" });
        if (error) throw error;
      }
      setCount(items.length);
      toast.success(`נטענו ${items.length.toLocaleString("he-IL")} יישובים`);
    } catch (e) {
      toast.error("הייבוא נכשל: " + errMsg(e));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };
  return (
    <div className="space-y-3">
      <p className="text-sm">
        במאגר: <b>{count === null ? "…" : count.toLocaleString("he-IL")}</b> יישובים. היישובים מופיעים כהשלמה אוטומטית בשדות "עיר" בכל המערכת.
      </p>
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => importFile(e.target.files?.[0])} />
      <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
        {busy ? <Loader2 className="animate-spin" /> : <Upload size={15} />} ייבוא קובץ היישובים של הלמ"ס
      </Button>
      <p className="text-xs text-muted-foreground">הקובץ צריך עמודות "סמל יישוב", "שם יישוב" ו"שם יישוב לועזי". טעינה חוזרת מעדכנת ולא מכפילה.</p>
    </div>
  );
};

/* ------------------------------ documents catalog ------------------------------ */

const MODE_LABELS: Record<DocMode, string> = { always: "חובה לכולם", optional: "מוסיפים לפי צורך", off: "מושבת" };

const DocsPanel = () => {
  const [list, setList] = useState<CatalogDoc[]>(() => getDocsCatalog().map((d) => ({ ...d })));
  const [busy, setBusy] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const save = async () => {
    if (list.some((d) => d.label.trim().length < 2)) return toast.error("לכל מסמך צריך שם");
    setBusy(true);
    const { error } = await supabase.from("app_settings").upsert({ key: "documents_catalog", value: list });
    setBusy(false);
    if (error) return toast.error(errMsg(error));
    setDocsCatalog(list);
    toast.success("רשימת המסמכים עודכנה");
  };
  const add = () => {
    if (newLabel.trim().length < 2) return;
    setList([...list, { key: `doc_${Date.now().toString(36)}`, label: newLabel.trim(), mode: "optional" }]);
    setNewLabel("");
  };
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        "חובה לכולם" נכנס לרשימת המסמכים של כל תלמיד. "מוסיפים לפי צורך" מופיע בכפתור "הוסף מסמך ייעודי". מסמכים לפי מצב משפחתי ותעסוקה (תלושים, שומת מס, הסכם גירושין וכו׳)
        מתווספים אוטומטית.
      </p>
      <div className="card-elev divide-y">
        {list.map((d, i) => (
          <div key={d.key} className="flex flex-wrap items-center gap-2 p-3">
            <Input value={d.label} onChange={(e) => setList(list.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-9 flex-1 min-w-[200px]" aria-label="שם המסמך" />
            <Select value={d.mode} onValueChange={(v) => setList(list.map((x, j) => (j === i ? { ...x, mode: v as DocMode } : x)))}>
              <SelectTrigger className="w-48 h-9" aria-label="מצב">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(MODE_LABELS) as DocMode[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {MODE_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="מסמך חדש" className="w-64" />
        <Button variant="outline" onClick={add}>
          <Plus size={15} /> הוספה
        </Button>
        <Button onClick={save} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" /> : <Save size={15} />} שמירת הרשימה
        </Button>
      </div>
    </div>
  );
};

export const ListsTab = () => (
  <Tabs defaultValue="institutions" dir="rtl">
    <TabsList className="flex-wrap h-auto">
      <TabsTrigger value="institutions">
        <Building2 size={14} className="me-1" /> מוסדות
      </TabsTrigger>
      <TabsTrigger value="recruiters">
        <UserCheck size={14} className="me-1" /> פעילים
      </TabsTrigger>
      <TabsTrigger value="schools">
        <SchoolIcon size={14} className="me-1" /> בתי ספר קודמים
      </TabsTrigger>
      <TabsTrigger value="cities">
        <MapPin size={14} className="me-1" /> יישובים
      </TabsTrigger>
      <TabsTrigger value="docs">
        <FileText size={14} className="me-1" /> מסמכים להבאה
      </TabsTrigger>
    </TabsList>
    <TabsContent value="institutions" className="mt-4">
      <InstitutionsPanel />
    </TabsContent>
    <TabsContent value="recruiters" className="mt-4">
      <RecruitersPanel />
    </TabsContent>
    <TabsContent value="schools" className="mt-4">
      <SchoolsPanel />
    </TabsContent>
    <TabsContent value="cities" className="mt-4">
      <CitiesPanel />
    </TabsContent>
    <TabsContent value="docs" className="mt-4">
      <DocsPanel />
    </TabsContent>
  </Tabs>
);
