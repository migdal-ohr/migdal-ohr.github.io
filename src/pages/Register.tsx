import { useState } from "react";
import { Logo } from "@/components/Logo";
import { CheckCircle2, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GRADE_LABEL, Grade, REGISTRATION_TRACK_LABELS, REGISTRATION_TRACK_ORDER } from "@/types/crm";
import { isValidIsraeliPhone } from "@/lib/whatsapp";
import { isValidIsraeliId } from "@/lib/validation";

const GRADES = (Object.keys(GRADE_LABEL).map(Number) as Grade[]).sort((a, b) => a - b);

/** Public page: parents register interest → a new lead appears in the CRM instantly. */
const Register = () => {
  const [f, setF] = useState({
    firstName: "",
    lastName: "",
    studentId: "",
    grade: "",
    registrationTrack: "",
    city: "",
    fatherName: "",
    fatherPhone: "",
    motherName: "",
    motherPhone: "",
    notes: "",
    website: "", // honeypot — real people never fill it
  });
  const [state, setState] = useState<"form" | "sending" | "done" | "exists">("form");
  const [error, setError] = useState("");
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (f.website) return setState("done");
    if (!f.firstName.trim() || !f.lastName.trim()) return setError("נא למלא שם פרטי ושם משפחה של התלמיד");
    if (!f.grade) return setError("נא לבחור כיתה");
    if (!f.fatherPhone && !f.motherPhone) return setError("נא למלא לפחות מספר טלפון אחד");
    for (const p of [f.fatherPhone, f.motherPhone]) if (p && !isValidIsraeliPhone(p)) return setError(`מספר הטלפון ${p} אינו תקין`);
    if (f.studentId && !isValidIsraeliId(f.studentId)) return setError("מספר תעודת הזהות אינו תקין — נא לבדוק שוב");
    setState("sending");
    try {
      const { website: _w, ...payload } = f;
      const r = await api.publicRegister(payload);
      setState(r === "exists" ? "exists" : "done");
    } catch (err) {
      setState("form");
      const m = err instanceof Error ? err.message : "";
      setError(m.includes("rate") ? "יש עומס כרגע, נסו שוב בעוד כמה דקות" : "השליחה נכשלה. נסו שוב או התקשרו למזכירות.");
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-soft p-4 py-10">
      <div className="max-w-xl mx-auto bg-card rounded-2xl border shadow-card p-6 sm:p-8">
        <div className="text-center mb-6">
          <Logo className="mx-auto size-20 mb-3" />
          <h1 className="font-display text-2xl font-bold">הרשמה למוסדות מגדל אור</h1>
          <p className="text-sm text-muted-foreground mt-1">מתיבתא · ישיבה קטנה · מאור ישראל — מגדל העמק</p>
        </div>

        {state === "done" || state === "exists" ? (
          <div className="text-center py-8 space-y-3">
            <CheckCircle2 className="mx-auto text-success" size={64} />
            <h2 className="font-display text-xl font-bold">תודה! הפרטים התקבלו</h2>
            <p className="text-muted-foreground">
              {state === "exists" ? "התלמיד כבר רשום אצלנו — " : ""}צוות הרישום ייצור אתכם קשר בהקדם לתיאום פגישת רישום.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-5 relative">
            <fieldset className="space-y-3">
              <legend className="font-semibold mb-2">פרטי התלמיד</legend>
              <div className="grid grid-cols-2 gap-3">
                <F label="שם פרטי *">
                  <Input value={f.firstName} onChange={(e) => set("firstName", e.target.value)} maxLength={40} autoComplete="off" />
                </F>
                <F label="שם משפחה *">
                  <Input value={f.lastName} onChange={(e) => set("lastName", e.target.value)} maxLength={40} />
                </F>
                <F label="תעודת זהות">
                  <Input value={f.studentId} onChange={(e) => set("studentId", e.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={9} dir="ltr" />
                </F>
                <F label="עיר מגורים">
                  <Input value={f.city} onChange={(e) => set("city", e.target.value)} maxLength={40} />
                </F>
                <F label="כיתה בשנה הבאה *">
                  <Select value={f.grade} onValueChange={(v) => set("grade", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="בחירה" />
                    </SelectTrigger>
                    <SelectContent>
                      {GRADES.map((g) => (
                        <SelectItem key={g} value={String(g)}>
                          {GRADE_LABEL[g]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </F>
                <F label="מסלול מבוקש">
                  <Select value={f.registrationTrack} onValueChange={(v) => set("registrationTrack", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="לא בטוחים עדיין" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGISTRATION_TRACK_ORDER.map((t) => (
                        <SelectItem key={t} value={t}>
                          {REGISTRATION_TRACK_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </F>
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className="font-semibold mb-2">פרטי ההורים</legend>
              <div className="grid grid-cols-2 gap-3">
                <F label="שם האב">
                  <Input value={f.fatherName} onChange={(e) => set("fatherName", e.target.value)} maxLength={40} />
                </F>
                <F label="טלפון האב">
                  <Input value={f.fatherPhone} onChange={(e) => set("fatherPhone", e.target.value)} inputMode="tel" dir="ltr" placeholder="05X-XXXXXXX" />
                </F>
                <F label="שם האם">
                  <Input value={f.motherName} onChange={(e) => set("motherName", e.target.value)} maxLength={40} />
                </F>
                <F label="טלפון האם">
                  <Input value={f.motherPhone} onChange={(e) => set("motherPhone", e.target.value)} inputMode="tel" dir="ltr" placeholder="05X-XXXXXXX" />
                </F>
              </div>
            </fieldset>

            <F label="משהו שחשוב לנו לדעת? (לא חובה)">
              <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} rows={3} maxLength={500} />
            </F>
            <input
              tabIndex={-1}
              autoComplete="off"
              value={f.website}
              onChange={(e) => set("website", e.target.value)}
              name="website"
              aria-hidden
              style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none", overflow: "hidden" }}
            />

            {error && <p className="text-sm text-destructive font-medium" role="alert">{error}</p>}
            <Button type="submit" className="w-full h-12 text-base" disabled={state === "sending"}>
              {state === "sending" && <Loader2 className="animate-spin" />}
              שליחת פרטים
            </Button>
            <p className="text-[11px] text-muted-foreground text-center">הפרטים משמשים לתהליך הרישום בלבד ונשמרים במערכת המוסד.</p>
          </form>
        )}
      </div>
    </div>
  );
};

const F = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="space-y-1.5">
    <Label>{label}</Label>
    {children}
  </div>
);

export default Register;
