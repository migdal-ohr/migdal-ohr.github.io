import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  User,
  Users,
  GraduationCap,
  CalendarCheck,
  MessagesSquare,
  FolderOpen,
  FileText,
  Loader2,
  CheckCircle2,
  Circle,
  Printer,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/session";
import { useFamilyById } from "@/lib/api/studentFile";
import { useRecruiters, useStudentEvents, useStudentLog } from "@/lib/api/extras";
import { StudentAvatar } from "@/components/crm/StudentAvatar";
import { PrincipalCardSection } from "@/components/crm/principal/Principal";
import { DocViewer } from "./DocViewer";
import { hebrewDate } from "@/lib/dates";
import {
  CAMP_LABELS,
  EMPLOYMENT_LABELS,
  EVENT_KIND_LABELS,
  FAMILY_STATUS_LABELS,
  Family,
  GENDER_LABELS,
  GRADE_LABEL,
  HMO_LABELS,
  OUTCOME_BADGE,
  OUTCOME_LABELS,
  Outcome,
  REGISTRATION_TRACK_LABELS,
  RELIGIOUS_LABELS,
  STAGE_LABELS,
  STATION_LABELS,
  STATION_ORDER,
  getDocsCatalog,
  getRequiredDocuments,
} from "@/types/crm";

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL") : "");
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const INTERVIEW_TYPES: Record<string, string> = {
  social: 'ראיון עו"ס',
  principal: "ראיון מנהל",
  exam: "מבחן",
  other: "ראיון",
};

/* ------------------------------ building blocks ------------------------------ */

const Field = ({ label, value, wide }: { label: string; value?: React.ReactNode; wide?: boolean }) => (
  <div className={cn("py-2 border-b border-border/60", wide && "sm:col-span-2")}>
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className={cn("font-medium mt-0.5 whitespace-pre-wrap", (value === undefined || value === null || value === "") && "text-muted-foreground/50")}>
      {value === undefined || value === null || value === "" ? "—" : value}
    </div>
  </div>
);
const Grid = ({ children }: { children: React.ReactNode }) => <div className="grid gap-x-8 sm:grid-cols-2">{children}</div>;
const Sub = ({ children }: { children: React.ReactNode }) => <h3 className="font-display font-bold text-lg mt-6 mb-1 first:mt-0">{children}</h3>;
const yesNo = (v?: boolean) => (v === undefined ? undefined : v ? "כן" : "לא");

type Page = {
  id: string;
  title: string;
  group?: string;
  icon: typeof User;
  render: () => React.ReactNode;
};

/* ------------------------------ pages ------------------------------ */

const ParentBlock = ({ family, p }: { family: Family; p: "father" | "mother" }) => {
  const f = family as unknown as Record<string, string | number | boolean | undefined>;
  const emp = f[`${p}Employment`] as keyof typeof EMPLOYMENT_LABELS | undefined;
  return (
    <>
      <Sub>{p === "father" ? "אבא" : "אמא"}</Sub>
      <Grid>
        <Field label="שם" value={f[`${p}Name`] as string} />
        <Field label="טלפון" value={f[`${p}Phone`] as string} />
        <Field label="ת״ז" value={f[`${p}IdNumber`] as string} />
        <Field label="שנת לידה" value={f[`${p}BirthYear`] as number} />
        <Field label="תעסוקה" value={emp ? EMPLOYMENT_LABELS[emp] : undefined} />
        {p === "father" ? <Field label="אברך" value={yesNo(family.fatherAvrech)} /> : <Field label="שנות לימוד" value={f.motherSchoolYears as number} />}
        {p === "father" && <Field label="שנות לימוד" value={f.fatherSchoolYears as number} />}
        <Field label="כתובת" value={[f[`${p}Address`], f[`${p}City`]].filter(Boolean).join(", ")} />
        <Field label="מקבל/ת וואטסאפ" value={f[`${p}Whatsapp`] === false ? "לא" : f[`${p}Phone`] ? "כן" : undefined} />
      </Grid>
    </>
  );
};

const EventsPage = ({ family }: { family: Family }) => {
  const { events } = useStudentEvents(family.id);
  return (
    <>
      <Sub>תחנות יום הרישום</Sub>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 mt-2">
        {STATION_ORDER.map((k) => (
          <div
            key={k}
            className={cn("flex items-center gap-2 rounded-xl border p-3", family.stations?.[k] ? "bg-emerald-50 border-emerald-200" : "bg-muted/30")}
          >
            {family.stations?.[k] ? <CheckCircle2 className="text-emerald-600" size={18} /> : <Circle className="text-muted-foreground" size={18} />}
            <span className="font-medium">{STATION_LABELS[k]}</span>
          </div>
        ))}
      </div>
      <Sub>פגישות, סיורים וראיונות</Sub>
      {events.length === 0 && <p className="text-muted-foreground text-sm py-2">לא נקבעו פגישות</p>}
      <div className="space-y-2 mt-2">
        {events.map((e) => (
          <div key={e.id} className="rounded-xl border p-3 flex flex-wrap items-center gap-3">
            <span className="rounded-lg bg-primary/10 text-primary px-2 py-0.5 text-sm font-semibold">{EVENT_KIND_LABELS[e.kind] ?? e.type}</span>
            <span className="font-medium">{fmtDateTime(e.date)}</span>
            <span className="text-xs text-muted-foreground">{hebrewDate(new Date(e.date))}</span>
            <span
              className={cn(
                "ms-auto text-sm font-semibold",
                e.attended === true ? "text-emerald-700" : e.attended === false ? "text-rose-700" : "text-muted-foreground",
              )}
            >
              {e.attended === true ? "הגיע" : e.attended === false ? "לא הגיע" : ""}
            </span>
            {e.notes && <p className="w-full text-sm whitespace-pre-wrap">{e.notes}</p>}
          </div>
        ))}
      </div>
    </>
  );
};

const LogPage = ({ family }: { family: Family }) => {
  const { entries } = useStudentLog(family.id);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 1200);
    return () => clearTimeout(t);
  }, []);
  if (!entries.length)
    return (
      <p className="text-muted-foreground py-6 text-center">{loaded ? "עוד לא נרשמו שיחות, ראיונות או הערות" : <Loader2 className="animate-spin mx-auto" />}</p>
    );
  return (
    <div className="space-y-3">
      {entries.map((e) => (
        <article key={e.id} className="rounded-xl border p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span
              className={cn(
                "rounded-lg px-2 py-0.5 font-semibold",
                e.kind === "interview" ? "bg-violet-100 text-violet-800" : e.kind === "call" ? "bg-sky-100 text-sky-800" : "bg-amber-100 text-amber-900",
              )}
            >
              {e.kind === "interview"
                ? (INTERVIEW_TYPES[e.subtype ?? "other"] ?? "ראיון")
                : e.kind === "call"
                  ? `שיחה${e.participant ? ` עם ${e.participant}` : ""}`
                  : "הערה פנימית"}
            </span>
            <span className="text-muted-foreground">
              {fmtDateTime(e.at)} · {e.author_name}
            </span>
          </div>
          <p className="mt-2 whitespace-pre-wrap leading-relaxed">{e.summary}</p>
          {e.followup_on && <p className="mt-1 text-xs text-muted-foreground">מעקב: {fmtDate(e.followup_on)}</p>}
        </article>
      ))}
    </div>
  );
};

/* ------------------------------ the file ------------------------------ */

export const StudentFile = ({ familyId, onBack }: { familyId: string; onBack: () => void }) => {
  const { can } = useSession();
  const { family, loaded } = useFamilyById(familyId);
  const { recruiters } = useRecruiters();
  const [pageId, setPageId] = useState("cover");

  const pages = useMemo<Page[]>(() => {
    if (!family) return [];
    const f = family;
    const docs = getRequiredDocuments(f);
    const catalog = getDocsCatalog();
    const labelOf = (key: string) => docs.find((d) => d.key === key)?.label ?? catalog.find((d) => d.key === key)?.label ?? key;
    const fileEntries = Object.entries(f.files ?? {}).flatMap(([key, list]) => (list ?? []).map((file, i) => ({ key, file, i, label: labelOf(key) })));
    const received = docs.filter((d) => f.documents?.[d.key]).length;
    const outcome = (f.outcome ?? "in_process") as Outcome;
    const list: Page[] = [
      {
        id: "cover",
        title: "שער התיק",
        icon: BookOpen,
        render: () => (
          <>
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-5">
              <StudentAvatar photoUrl={f.photoUrl} photoPath={f.photoPath} name={f.studentName} className="size-32 rounded-3xl bg-muted border text-4xl" />
              <div className="text-center sm:text-right flex-1">
                <h2 className="font-display text-3xl font-bold">{f.studentName}</h2>
                <p className="text-muted-foreground mt-1">
                  {GRADE_LABEL[f.grade]}
                  {f.registrationTrack ? ` · ${REGISTRATION_TRACK_LABELS[f.registrationTrack] ?? f.registrationTrack}` : ""}
                  {f.city ? ` · ${f.city}` : ""}
                </p>
                <div className="flex flex-wrap justify-center sm:justify-start gap-2 mt-3">
                  <span className="rounded-lg bg-muted px-3 py-1 text-sm font-semibold">{STAGE_LABELS[f.stage]}</span>
                  {outcome !== "in_process" && (
                    <span className={cn("rounded-lg px-3 py-1 text-sm font-bold", OUTCOME_BADGE[outcome])}>{OUTCOME_LABELS[outcome]}</span>
                  )}
                  <span
                    className={cn(
                      "rounded-lg px-3 py-1 text-sm font-semibold",
                      received === docs.length ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900",
                    )}
                  >
                    מסמכים {received}/{docs.length}
                  </span>
                  <span className="rounded-lg bg-muted px-3 py-1 text-sm font-semibold">
                    תחנות {STATION_ORDER.filter((k) => f.stations?.[k]).length}/{STATION_ORDER.length}
                  </span>
                </div>
              </div>
            </div>
            <Grid>
              <Field label="ת״ז" value={f.studentId} />
              <Field label="תאריך לידה" value={f.birthDate ? `${fmtDate(f.birthDate)} · ${hebrewDate(new Date(f.birthDate))}` : undefined} />
              <Field label="אבא" value={[f.fatherName, f.fatherPhone].filter(Boolean).join(" · ")} />
              <Field label="אמא" value={[f.motherName, f.motherPhone].filter(Boolean).join(" · ")} />
              <Field label="בית ספר קודם" value={[f.prevSchool, f.prevCity].filter(Boolean).join(" · ")} />
              <Field label="מצב משפחתי" value={f.familyStatus && FAMILY_STATUS_LABELS[f.familyStatus]} />
            </Grid>
            {f.notes && (
              <>
                <Sub>הערות</Sub>
                <p className="rounded-xl bg-muted/50 p-4 whitespace-pre-wrap leading-relaxed">{f.notes}</p>
              </>
            )}
            {f.hesitationReason && <Field label="סיבת התלבטות" value={f.hesitationReason} wide />}
            <p className="text-xs text-muted-foreground mt-6">התיק כולל {list.length} עמודים. מדפדפים בחיצים למעלה, ברשימה שבצד, או במקשי החיצים במקלדת.</p>
          </>
        ),
      },
      {
        id: "personal",
        title: "פרטים אישיים",
        icon: User,
        render: () => (
          <Grid>
            <Field label="שם פרטי" value={f.firstName} />
            <Field label="שם משפחה" value={f.lastName} />
            <Field label="ת״ז" value={f.studentId} />
            <Field label="מין" value={f.gender && GENDER_LABELS[f.gender]} />
            <Field label="תאריך לידה" value={f.birthDate ? `${fmtDate(f.birthDate)} · ${hebrewDate(new Date(f.birthDate))}` : undefined} />
            <Field label="ארץ לידה" value={f.birthCountry} />
            <Field label="תאריך עלייה" value={fmtDate(f.aliyahDate)} />
            <Field label="קופת חולים" value={f.hmo && HMO_LABELS[f.hmo]} />
            <Field label="שיוך דתי" value={f.religious && RELIGIOUS_LABELS[f.religious]} />
            <Field label="כתובת" value={[f.address, f.city, f.zip].filter(Boolean).join(", ")} />
            <Field label="מען למכתבים" value={f.mailAddress} />
            <Field label="אימייל" value={f.email} />
            <Field label="טלפון בבית" value={f.homePhone} />
            <Field label="נייד התלמיד" value={f.studentMobile} />
          </Grid>
        ),
      },
      {
        id: "family",
        title: "הורים ומשפחה",
        icon: Users,
        render: () => (
          <>
            <Grid>
              <Field label="מצב משפחתי" value={f.familyStatus && FAMILY_STATUS_LABELS[f.familyStatus]} />
              <Field label="מספר אחים" value={f.siblingsCount} />
            </Grid>
            <ParentBlock family={f} p="father" />
            <ParentBlock family={f} p="mother" />
          </>
        ),
      },
      {
        id: "school",
        title: "לימודים ורישום",
        icon: GraduationCap,
        render: () => (
          <>
            <Sub>לימודים קודמים</Sub>
            <Grid>
              <Field label="בית ספר" value={f.prevSchool} />
              <Field label="עיר" value={f.prevCity} />
              <Field label="למד בכיתה" value={f.prevGrade} />
            </Grid>
            <Sub>הרישום</Sub>
            <Grid>
              <Field label="מוסד" value={f.registrationTrack && (REGISTRATION_TRACK_LABELS[f.registrationTrack] ?? f.registrationTrack)} />
              <Field label="כיתה" value={GRADE_LABEL[f.grade]} />
              <Field label="שלב" value={STAGE_LABELS[f.stage]} />
              <Field label="החלטה" value={OUTCOME_LABELS[outcome]} />
              <Field label="תאריך כניסה" value={fmtDate(f.startDate)} />
              <Field label="תאריך יציאה" value={fmtDate(f.endDate)} />
              <Field label="הרישום בוצע ע״י פעיל" value={recruiters.find((r) => r.id === f.recruiterId)?.name} />
              <Field label="קייטנה" value={f.campStatus && CAMP_LABELS[f.campStatus]} />
              <Field label="מקור" value={f.source === "web_form" ? "טופס הרשמה באתר" : f.source ? f.source : "הוזן במשרד"} />
              <Field label="נכנס למערכת" value={fmtDate(f.createdAt)} />
            </Grid>
          </>
        ),
      },
      {
        id: "events",
        title: "יום הרישום ופגישות",
        icon: CalendarCheck,
        render: () => <EventsPage family={f} />,
      },
      {
        id: "log",
        title: "ראיונות, שיחות והערות",
        icon: MessagesSquare,
        render: () => <LogPage family={f} />,
      },
      {
        id: "docs",
        title: "מסמכים",
        icon: FolderOpen,
        render: () => (
          <div className="space-y-2">
            {docs.map((d) => {
              const files = f.files?.[d.key] ?? [];
              return (
                <div key={d.key} className="flex flex-wrap items-center gap-2 rounded-xl border p-3">
                  {f.documents?.[d.key] ? <CheckCircle2 className="text-emerald-600" size={18} /> : <Circle className="text-muted-foreground" size={18} />}
                  <span className="font-medium">{d.label}</span>
                  <span className={cn("text-xs", f.documents?.[d.key] ? "text-emerald-700" : "text-amber-700")}>{f.documents?.[d.key] ? "התקבל" : "חסר"}</span>
                  <div className="ms-auto flex flex-wrap gap-1">
                    {files.map((file, i) => (
                      <Button key={file.path} size="sm" variant="outline" className="h-7" onClick={() => setPageId(`doc:${d.key}:${i}`)}>
                        <FileText size={13} /> {files.length > 1 ? `קובץ ${i + 1}` : "צפייה"}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!can.files && <p className="text-sm text-muted-foreground pt-2">אין לך הרשאה לצפות בקבצים שהועלו.</p>}
            {can.files && fileEntries.length === 0 && <p className="text-sm text-muted-foreground pt-2">עוד לא הועלו קבצים לתלמיד הזה.</p>}
          </div>
        ),
      },
    ];
    if (can.files)
      for (const e of fileEntries)
        list.push({
          id: `doc:${e.key}:${e.i}`,
          title: e.label + ((f.files?.[e.key]?.length ?? 0) > 1 ? ` (${e.i + 1})` : ""),
          group: "המסמכים שהועלו",
          icon: FileText,
          render: () => (
            <>
              <p className="text-xs text-muted-foreground mb-3 text-center">
                {e.file.name} · הועלה {fmtDate(e.file.uploadedAt)}
              </p>
              <DocViewer path={e.file.path} name={e.file.name} />
            </>
          ),
        });
    return list;
  }, [family, recruiters, can.files]);

  const idx = Math.max(
    0,
    pages.findIndex((p) => p.id === pageId),
  );
  const page = pages[idx];
  const go = useCallback(
    (d: number) =>
      setPageId((cur) => {
        const i = Math.max(
          0,
          pages.findIndex((p) => p.id === cur),
        );
        const n = pages[Math.min(pages.length - 1, Math.max(0, i + d))];
        return n?.id ?? cur;
      }),
    [pages],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.getAttribute("role") === "combobox")) return;
      if (document.querySelector("[role=dialog][data-state=open], [role=alertdialog][data-state=open]")) return;
      if (e.key === "ArrowLeft") go(1);
      else if (e.key === "ArrowRight") go(-1);
      else if (e.key === "Escape") onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onBack]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pageId]);

  if (!family)
    return (
      <div className="h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
        {loaded ? (
          <>
            <p>התיק לא נמצא, או שאין לך הרשאה לצפות בו.</p>
            <Button variant="outline" onClick={onBack}>
              <ArrowRight size={16} /> חזרה
            </Button>
          </>
        ) : (
          <Loader2 className="animate-spin text-primary" size={36} />
        )}
      </div>
    );

  const showPrincipal = can.principalDecide || can.principalRequest;
  const Icon = page.icon;

  return (
    <div className="max-w-[1500px] mx-auto animate-fade-in" data-testid="student-file">
      {/* top bar */}
      <div className="sticky top-[61px] lg:top-0 z-20 -mx-4 sm:-mx-6 lg:-mx-10 px-4 sm:px-6 lg:px-10 py-3 mb-4 bg-background/90 backdrop-blur border-b flex flex-wrap items-center gap-3 print:hidden">
        <Button variant="outline" onClick={onBack}>
          <ArrowRight size={16} /> חזרה
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <StudentAvatar photoUrl={family.photoUrl} photoPath={family.photoPath} name={family.studentName} className="size-9 rounded-xl bg-muted border" />
          <div className="min-w-0">
            <div className="text-xs text-muted-foreground">תיק תלמיד</div>
            <h1 className="font-display font-bold text-lg leading-tight truncate">{family.studentName}</h1>
          </div>
        </div>
        <div className="ms-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => window.print()} aria-label="הדפסת העמוד" title="הדפסת העמוד">
            <Printer size={17} />
          </Button>
          <Button variant="outline" size="icon" onClick={() => go(-1)} disabled={idx === 0} aria-label="העמוד הקודם">
            <ChevronRight />
          </Button>
          <span className="text-sm tabular-nums w-20 text-center">
            {idx + 1} מתוך {pages.length}
          </span>
          <Button variant="outline" size="icon" onClick={() => go(1)} disabled={idx === pages.length - 1} aria-label="העמוד הבא">
            <ChevronLeft />
          </Button>
        </div>
      </div>

      <div className={cn("grid gap-5", showPrincipal ? "lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_360px]" : "lg:grid-cols-[220px_1fr]")}>
        {/* table of contents */}
        <nav className="hidden lg:block print:hidden" aria-label="תוכן התיק">
          <div className="sticky top-24 space-y-0.5 max-h-[calc(100vh-7rem)] overflow-y-auto">
            {pages.map((p, i) => {
              const PIcon = p.icon;
              const groupStart = p.group && pages[i - 1]?.group !== p.group;
              return (
                <div key={p.id}>
                  {groupStart && <div className="text-[11px] font-bold text-muted-foreground px-3 pt-3 pb-1">{p.group}</div>}
                  <button
                    onClick={() => setPageId(p.id)}
                    className={cn(
                      "w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-right transition",
                      p.id === page.id ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted",
                    )}
                  >
                    <PIcon size={15} className="shrink-0" /> <span className="truncate">{p.title}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </nav>
        <div className="lg:hidden print:hidden">
          <Select value={page.id} onValueChange={setPageId}>
            <SelectTrigger aria-label="בחירת עמוד בתיק">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pages.map((p, i) => (
                <SelectItem key={p.id} value={p.id}>
                  {i + 1}. {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* the page */}
        <article className="card-elev p-5 sm:p-8 min-h-[60vh] min-w-0">
          <header className="flex items-center gap-2 mb-5 pb-3 border-b">
            <Icon className="text-primary" size={20} />
            <h2 className="font-display text-xl font-bold">{page.title}</h2>
            <span className="ms-auto text-xs text-muted-foreground">
              עמוד {idx + 1} מתוך {pages.length}
            </span>
          </header>
          {page.render()}
          <footer className="flex justify-between mt-8 pt-4 border-t print:hidden">
            <Button variant="ghost" onClick={() => go(-1)} disabled={idx === 0}>
              <ChevronRight size={16} /> {pages[idx - 1]?.title ?? ""}
            </Button>
            <Button variant="ghost" onClick={() => go(1)} disabled={idx === pages.length - 1}>
              {pages[idx + 1]?.title ?? ""} <ChevronLeft size={16} />
            </Button>
          </footer>
        </article>

        {/* principal decision, always at hand while flipping pages */}
        {showPrincipal && (
          <aside className="lg:col-start-2 xl:col-start-auto print:hidden">
            <div className="xl:sticky xl:top-24 card-elev p-4">
              <PrincipalCardSection family={family} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
};
