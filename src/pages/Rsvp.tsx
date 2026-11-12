import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2, XCircle, Loader2, CalendarClock, MapPin } from "lucide-react";
import { api } from "@/lib/api";
import { hebrewDate } from "@/lib/dates";
import { getInstitution } from "@/lib/whatsapp";

type Status = "loading" | "choose" | "confirmed" | "reschedule_requested" | "error";

/** Public page for parents. Works ONLY with the secret token from the WhatsApp link. */
const Rsvp = () => {
  const [params] = useSearchParams();
  const token = params.get("t");
  const legacyId = params.get("studentId");
  const [state, setState] = useState<Status>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [appointmentIso, setAppointmentIso] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setErrorMsg(
        legacyId
          ? "הקישור הזה ישן ואינו פעיל יותר. נשמח אם תאשרו את ההגעה בהודעה חוזרת למזכירות."
          : "קישור לא תקין",
      );
      return;
    }
    api
      .getRsvp(token)
      .then((info) => {
        if (!info) {
          setState("error");
          setErrorMsg("לא מצאנו את הפגישה. ייתכן שהקישור פג תוקף — אנא פנו למזכירות.");
          return;
        }
        setFirstName(info.firstName);
        setAppointmentIso(info.appointmentDate);
        setState(info.status === "pending" ? "choose" : info.status);
      })
      .catch(() => {
        setState("error");
        setErrorMsg("לא הצלחנו לטעון את הפרטים. נסו שוב בעוד רגע.");
      });
  }, [token, legacyId]);

  const submit = async (status: "confirmed" | "reschedule_requested") => {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      await api.submitRsvp(token, status);
      setState(status);
    } catch {
      setState("error");
      setErrorMsg("אירעה שגיאה. אנא נסו שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  const d = appointmentIso ? new Date(appointmentIso) : null;
  const meetingLabel = d
    ? `${d.toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })} בשעה ${d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}`
    : null;

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-soft p-4">
      <div className="w-full max-w-md bg-card rounded-2xl border border-border shadow-card p-8 text-center">
        <div className="text-xs font-bold text-primary tracking-wide mb-4">מוסדות מגדל אור · מגדל העמק</div>
        {state === "loading" && (
          <>
            <Loader2 className="mx-auto animate-spin text-primary" size={56} />
            <p className="mt-4 text-lg font-medium text-muted-foreground">טוען פרטים...</p>
          </>
        )}

        {state === "choose" && (
          <>
            <div className="mx-auto size-16 rounded-full bg-primary-soft flex items-center justify-center">
              <CalendarClock className="text-primary" size={36} />
            </div>
            <h1 className="mt-5 font-display text-2xl font-bold text-foreground">אישור הגעה לפגישת רישום</h1>
            {firstName && <p className="mt-2 text-base text-foreground font-medium">עבור: {firstName}</p>}
            {meetingLabel && (
              <p className="mt-3 text-lg font-bold text-primary">
                {meetingLabel}
                {d && <span className="block text-sm font-normal text-muted-foreground">{hebrewDate(d)}</span>}
              </p>
            )}
            <p className="mt-2 text-sm text-muted-foreground inline-flex items-center gap-1">
              <MapPin size={14} /> {getInstitution().address}
            </p>

            <div className="mt-6 flex flex-col gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit("confirmed")}
                className="w-full rounded-xl bg-success text-success-foreground font-bold py-4 px-4 text-lg hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {submitting ? <Loader2 className="mx-auto animate-spin" /> : "מאשר/ת הגעה ✓"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submit("reschedule_requested")}
                className="w-full rounded-xl border-2 border-destructive text-destructive font-bold py-3 px-4 hover:bg-destructive/10 transition-colors disabled:opacity-60"
              >
                לא אוכל להגיע, אשמח לתיאום מועד חדש
              </button>
            </div>
          </>
        )}

        {state === "confirmed" && (
          <>
            <div className="mx-auto size-20 rounded-full bg-success-soft flex items-center justify-center">
              <CheckCircle2 className="text-success" size={56} />
            </div>
            <h1 className="mt-6 font-display text-2xl font-bold text-foreground">תודה! הגעתכם לפגישה אושרה בהצלחה.</h1>
            {meetingLabel && <p className="mt-3 font-semibold">{meetingLabel}</p>}
            <p className="mt-3 text-muted-foreground">נשמח לראותכם. נא להביא תעודת זהות ותעודת בית ספר.</p>
            <button type="button" className="mt-6 text-sm text-muted-foreground underline" onClick={() => setState("choose")}>
              משהו השתנה? לשינוי התשובה
            </button>
          </>
        )}

        {state === "reschedule_requested" && (
          <>
            <div className="mx-auto size-20 rounded-full bg-warning-soft flex items-center justify-center">
              <CalendarClock className="text-warning-foreground" size={52} />
            </div>
            <h1 className="mt-6 font-display text-2xl font-bold text-foreground">בקשתכם התקבלה</h1>
            <p className="mt-3 text-muted-foreground">נציג המזכירות ייצור עמכם קשר בהקדם לתיאום מועד חדש.</p>
            <button type="button" className="mt-6 text-sm text-muted-foreground underline" onClick={() => setState("choose")}>
              בכל זאת נגיע — לשינוי התשובה
            </button>
          </>
        )}

        {state === "error" && (
          <>
            <div className="mx-auto size-20 rounded-full bg-destructive/10 flex items-center justify-center">
              <XCircle className="text-destructive" size={56} />
            </div>
            <h1 className="mt-6 font-display text-2xl font-bold text-foreground">אופס</h1>
            <p className="mt-3 text-muted-foreground">{errorMsg}</p>
          </>
        )}
      </div>
    </div>
  );
};

export default Rsvp;
