import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Loader2, Save, Trash2, ShieldCheck, Lock, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PERMISSION_GROUPS, RoleRow } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface InstitutionRow {
  key: string;
  name: string;
  phone: string | null;
  principal: string | null;
  principal_mobile: string | null;
  city: string | null;
  sort: number;
  is_active: boolean;
}

/** Live list of roles (for pickers). */
export const useRoles = () => {
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const load = useCallback(async () => {
    const { data } = await supabase.from("roles").select("*").order("sort").order("name");
    setRoles((data as RoleRow[]) ?? []);
  }, []);
  useEffect(() => {
    load();
    const ch = supabase
      .channel(`roles-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "roles" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  return { roles, reload: load };
};

/** Live list of institutions. */
export const useInstitutions = () => {
  const [list, setList] = useState<InstitutionRow[]>([]);
  const load = useCallback(async () => {
    const { data } = await supabase.from("institutions").select("*").order("sort").order("name");
    setList((data as InstitutionRow[]) ?? []);
  }, []);
  useEffect(() => {
    load();
    const ch = supabase
      .channel(`inst-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "institutions" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [load]);
  return { institutions: list, reload: load };
};

const RoleEditor = ({ role, institutions, usersCount, onSaved }: { role: RoleRow; institutions: InstitutionRow[]; usersCount: number; onSaved: () => void }) => {
  const { can } = useSession();
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description ?? "");
  const [perms, setPerms] = useState<Record<string, boolean>>(role.perms ?? {});
  const [insts, setInsts] = useState<string[]>(role.institutions ?? []);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(role.name);
    setDescription(role.description ?? "");
    setPerms(role.perms ?? {});
    setInsts(role.institutions ?? []);
    // reset only when another role is opened or this role really changed (not on every background refresh)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role.id, role.updated_at]);

  const locked = role.is_admin;
  const editable = !locked || can.isAdmin;
  const dirty =
    name !== role.name ||
    description !== (role.description ?? "") ||
    JSON.stringify(perms) !== JSON.stringify(role.perms ?? {}) ||
    JSON.stringify(insts) !== JSON.stringify(role.institutions ?? []);

  const save = async () => {
    if (name.trim().length < 2) return toast.error("שם תפקיד קצר מדי");
    setBusy(true);
    const clean = Object.fromEntries(Object.entries(perms).filter(([, v]) => v));
    const { error } = await supabase.from("roles").update({ name: name.trim(), description: description.trim() || null, perms: clean, institutions: insts }).eq("id", role.id);
    setBusy(false);
    if (error) return toast.error(error.message.includes("duplicate") ? "כבר יש תפקיד בשם הזה" : "השמירה נכשלה");
    toast.success("התפקיד עודכן. השינוי חל מיד על כל המשתמשים בתפקיד");
    onSaved();
  };
  const remove = async () => {
    if (usersCount > 0) return toast.error("יש משתמשים בתפקיד הזה. העבירו אותם לתפקיד אחר קודם");
    if (!confirm(`למחוק את התפקיד "${role.name}"?`)) return;
    const { error } = await supabase.from("roles").delete().eq("id", role.id);
    if (error) return toast.error("לא ניתן למחוק את התפקיד הזה");
    toast.success("התפקיד נמחק");
    onSaved();
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="role-name">שם התפקיד</Label>
          <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!editable} maxLength={60} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="role-desc">תיאור קצר</Label>
          <Textarea id="role-desc" rows={1} value={description} onChange={(e) => setDescription(e.target.value)} disabled={!editable} maxLength={300} />
        </div>
      </div>

      {locked ? (
        <div className="rounded-xl bg-violet-50 border border-violet-200 p-4 text-sm flex items-start gap-2">
          <Lock size={16} className="mt-0.5 text-violet-700 shrink-0" />
          <div>
            <b>מנהל מערכת</b> רואה ועושה הכל, בכל המוסדות. אי אפשר להגביל את התפקיד הזה, כדי שאף פעם לא תינעלו מחוץ למערכת.
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <Building2 size={15} /> מוסדות שהתפקיד רואה
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setInsts([])}
                className={cn("rounded-full border px-3 py-1 text-sm", insts.length === 0 ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}
              >
                כל המוסדות
              </button>
              {institutions.map((i) => {
                const on = insts.includes(i.key);
                return (
                  <button
                    key={i.key}
                    type="button"
                    onClick={() => setInsts(on ? insts.filter((k) => k !== i.key) : [...insts, i.key])}
                    className={cn("rounded-full border px-3 py-1 text-sm", on ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted")}
                  >
                    {i.name}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">תלמידים שעוד לא שויכו למוסד גלויים לכולם.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {PERMISSION_GROUPS.map((g) => {
              const allOn = g.items.every((i) => perms[i.key]);
              return (
                <div key={g.title} className="rounded-xl border p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{g.title}</span>
                    <button
                      type="button"
                      className="text-xs text-primary hover:underline"
                      onClick={() => setPerms({ ...perms, ...Object.fromEntries(g.items.map((i) => [i.key, !allOn])) })}
                    >
                      {allOn ? "נקה הכל" : "סמן הכל"}
                    </button>
                  </div>
                  {g.items.map((it) => (
                    <label key={it.key} className="flex items-start gap-2.5 cursor-pointer">
                      <Checkbox checked={!!perms[it.key]} onCheckedChange={(c) => setPerms({ ...perms, [it.key]: !!c })} className="mt-0.5" />
                      <span className="text-sm leading-tight">
                        {it.label}
                        {it.hint && <span className="block text-xs text-muted-foreground">{it.hint}</span>}
                      </span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {editable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={save} disabled={busy || !dirty}>
            {busy ? <Loader2 className="animate-spin" /> : <Save size={16} />} שמירת התפקיד
          </Button>
          {!role.key && (
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 size={15} /> מחיקת תפקיד
            </Button>
          )}
          <span className="text-xs text-muted-foreground">{usersCount} משתמשים בתפקיד הזה</span>
        </div>
      )}
    </div>
  );
};

export const RolesTab = () => {
  const { roles, reload } = useRoles();
  const { institutions } = useInstitutions();
  const [selected, setSelected] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    supabase
      .from("profiles")
      .select("role_id")
      .then(({ data }) => {
        const c: Record<string, number> = {};
        for (const p of (data as { role_id: string }[]) ?? []) c[p.role_id] = (c[p.role_id] ?? 0) + 1;
        setCounts(c);
      });
  }, [roles]);

  useEffect(() => {
    if (!selected && roles?.length) setSelected(roles[0].id);
  }, [roles, selected]);

  const current = useMemo(() => roles?.find((r) => r.id === selected) ?? null, [roles, selected]);

  const create = async () => {
    const base = roles?.find((r) => r.key === "secretary");
    let name = "תפקיד חדש";
    for (let i = 2; roles?.some((r) => r.name === name); i++) name = `תפקיד חדש ${i}`;
    const { data, error } = await supabase
      .from("roles")
      .insert({ name, perms: base?.perms ?? { "students.view": true }, sort: 50 })
      .select()
      .single();
    if (error) return toast.error("יצירת התפקיד נכשלה");
    toast.success("נוצר תפקיד חדש. תנו לו שם וסמנו הרשאות");
    await reload();
    setSelected((data as RoleRow).id);
  };

  if (!roles)
    return (
      <div className="py-10 flex justify-center">
        <Loader2 className="animate-spin text-primary" />
      </div>
    );

  return (
    <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <div className="space-y-2">
        {roles.map((r) => (
          <button
            key={r.id}
            onClick={() => setSelected(r.id)}
            className={cn(
              "w-full text-right rounded-xl border px-3 py-2.5 transition",
              selected === r.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted",
            )}
          >
            <div className="flex items-center gap-1.5 font-semibold text-sm">
              {r.is_admin && <ShieldCheck size={14} className="text-violet-600" />}
              {r.name}
            </div>
            <div className="text-xs text-muted-foreground">
              {counts[r.id] ?? 0} משתמשים{r.institutions?.length ? ` · ${r.institutions.length} מוסדות` : ""}
            </div>
          </button>
        ))}
        <Button variant="outline" className="w-full" onClick={create}>
          <Plus size={15} /> תפקיד חדש
        </Button>
      </div>
      <div className="card-elev p-5">{current && <RoleEditor role={current} institutions={institutions} usersCount={counts[current.id] ?? 0} onSaved={reload} />}</div>
    </div>
  );
};
