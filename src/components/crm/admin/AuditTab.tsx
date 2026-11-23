import { useEffect, useState } from "react";
import { Loader2, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface Row {
  at: string;
  table_name: string;
  op: string;
  row_id: string | null;
  student: string | null;
  changed: Record<string, unknown> | null;
}
const TABLES: Record<string, string> = { students: "תלמיד", appointments: "פגישה / אירוע", student_log: "תיעוד", roles: "תפקיד" };
const OPS: Record<string, string> = { INSERT: "הוספה", UPDATE: "עדכון", DELETE: "מחיקה" };
const FIELD: Record<string, string> = {
  first_name: "שם פרטי", last_name: "שם משפחה", id_number: "ת״ז", city: "עיר", grade: "כיתה", track: "מוסד", stage: "שלב", family_status: "מצב משפחתי",
  father_name: "שם אבא", father_phone: "טלפון אבא", mother_name: "שם אמא", mother_phone: "טלפון אמא", documents: "מסמכים", stations: "תחנות", notes: "הערות",
  is_archived: "ארכיון", rsvp_status: "אישור הגעה", details: "פרטים נוספים", starts_at: "מועד", attended: "הגיע", photo_path: "תמונה", files: "קבצים",
};

/** What one staff member did, newest first (from the audit trail). */
export const AuditTab = () => {
  const [users, setUsers] = useState<{ user_id: string; name: string }[]>([]);
  const [uid, setUid] = useState<string>("");
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    supabase
      .from("profiles")
      .select("user_id, full_name, email")
      .order("full_name")
      .then(({ data }) => setUsers(((data as { user_id: string; full_name: string; email: string }[]) ?? []).map((p) => ({ user_id: p.user_id, name: p.full_name || p.email }))));
  }, []);
  useEffect(() => {
    if (!uid) return;
    setRows(null);
    supabase.rpc("user_activity", { p_user: uid, p_limit: 300 }).then(({ data }) => setRows((data as Row[]) ?? []));
  }, [uid]);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <History size={16} className="text-primary" />
        <span className="text-sm">כל הפעולות של משתמש:</span>
        <Select value={uid} onValueChange={setUid}>
          <SelectTrigger className="w-64" aria-label="משתמש">
            <SelectValue placeholder="בחרו משתמש" />
          </SelectTrigger>
          <SelectContent>
            {users.map((u) => (
              <SelectItem key={u.user_id} value={u.user_id}>
                {u.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {uid && !rows && <Loader2 className="animate-spin text-primary" />}
      {rows && rows.length === 0 && <p className="text-sm text-muted-foreground">לא נמצאו פעולות.</p>}
      {rows && rows.length > 0 && (
        <div className="card-elev divide-y text-sm">
          {rows.map((r, i) => {
            const fields = r.op === "UPDATE" && r.changed ? Object.keys(r.changed).map((k) => FIELD[k] ?? k) : [];
            return (
              <div key={i} className="flex flex-wrap items-center gap-2 p-2.5">
                <span className="text-muted-foreground w-36 shrink-0">{new Date(r.at).toLocaleString("he-IL", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="font-medium">
                  {OPS[r.op] ?? r.op} {TABLES[r.table_name] ?? r.table_name}
                </span>
                {r.student && <span>· {r.student}</span>}
                {fields.length > 0 && <span className="text-muted-foreground">({fields.join(", ")})</span>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
