import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCrm } from "@/store/crmStore";
import {
  Family,
  GRADE_LABEL,
  Grade,
  REGISTRATION_TRACK_LABELS,
  REGISTRATION_TRACK_ORDER,
  STAGE_HEX,
  STAGE_LABELS,
  STAGE_ORDER,
  Stage,
  TRACK_HEX,
  getRequiredDocuments,
} from "@/types/crm";
import { BarChart3, Users, CheckCircle2, CalendarClock, FileWarning, ShieldAlert, Copy as CopyIcon, PhoneOff, IdCard } from "lucide-react";
import { isValidIsraeliId, normalizeId, normalizeText, onlyDigits } from "@/lib/validation";
import { addDays, startOfDay } from "@/lib/dates";
import { Button } from "@/components/ui/button";

const STAGES: Stage[] = [...STAGE_ORDER, "persuasion"];
const tooltipStyle = { direction: "rtl" as const, borderRadius: 12, fontSize: 12 };

export const StatsView = ({ onOpenFamily }: { onOpenFamily: (id: string) => void }) => {
  const { families, appointments, getFamily } = useCrm();

  const s = useMemo(() => {
    const byStage = STAGES.map((st) => ({ key: st, name: STAGE_LABELS[st], value: families.filter((f) => f.stage === st).length }));
    const byTrack = REGISTRATION_TRACK_ORDER.map((t) => ({
      key: t,
      name: REGISTRATION_TRACK_LABELS[t],
      value: families.filter((f) => f.registrationTrack === t).length,
      complete: families.filter((f) => f.registrationTrack === t && f.stage === "complete").length,
    }));
    const noTrack = families.filter((f) => !f.registrationTrack);
    const grades = (Object.keys(GRADE_LABEL).map(Number) as Grade[]).sort((a, b) => a - b);
    const byGrade = grades.map((g) => ({
      name: GRADE_LABEL[g],
      רשומים: families.filter((f) => f.grade === g && f.stage === "complete").length,
      בתהליך: families.filter((f) => f.grade === g && f.stage !== "complete" && f.stage !== "persuasion").length,
    }));

    const cityCounts = new Map<string, number>();
    for (const f of families) {
      const c = (f.city ?? "").trim() || "לא צוין";
      cityCounts.set(c, (cityCounts.get(c) ?? 0) + 1);
    }
    const topCities = [...cityCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, value]) => ({ name, value }));

    // new registrations per week, last 12 weeks
    const weeks: { name: string; value: number }[] = [];
    const today = startOfDay(new Date());
    const weekStart = addDays(today, -today.getDay());
    for (let i = 11; i >= 0; i--) {
      const from = addDays(weekStart, -7 * i);
      const to = addDays(from, 7);
      weeks.push({
        name: from.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" }),
        value: families.filter((f) => {
          const d = new Date(f.createdAt);
          return d >= from && d < to;
        }).length,
      });
    }

    // meetings next 14 days
    const next14 = Array.from({ length: 14 }, (_, i) => {
      const d = addDays(today, i);
      const n = appointments.filter((a) => {
        const x = new Date(a.date);
        return x >= d && x < addDays(d, 1) && getFamily(a.familyId) && !getFamily(a.familyId)!.isArchived;
      }).length;
      return { name: d.toLocaleDateString("he-IL", { weekday: "short", day: "numeric" }), value: n };
    });

    let docsDone = 0;
    let docsTotal = 0;
    const docMissingCount = new Map<string, number>();
    for (const f of families) {
      if (f.stage === "persuasion") continue;
      for (const d of getRequiredDocuments(f)) {
        docsTotal++;
        if (f.documents[d.key]) docsDone++;
        else docMissingCount.set(d.label, (docMissingCount.get(d.label) ?? 0) + 1);
      }
    }
    const topMissingDocs = [...docMissingCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

    // ---------- data quality ----------
    const byId = new Map<string, Family[]>();
    const byNamePhone = new Map<string, Family[]>();
    for (const f of families) {
      const id = normalizeId(f.studentId);
      if (id) byId.set(id, [...(byId.get(id) ?? []), f]);
      const phone = onlyDigits(f.fatherPhone || f.motherPhone);
      if (phone) {
        const k = `${normalizeText(f.studentName)}|${phone}`;
        byNamePhone.set(k, [...(byNamePhone.get(k) ?? []), f]);
      }
    }
    const dupGroups: Family[][] = [];
    const seen = new Set<string>();
    for (const g of [...byId.values(), ...byNamePhone.values()]) {
      if (g.length < 2) continue;
      const key = g.map((f) => f.id).sort().join(",");
      if (seen.has(key)) continue;
      seen.add(key);
      dupGroups.push(g);
    }
    const badIds = families.filter((f) => f.studentId && !isValidIsraeliId(f.studentId));
    const noPhone = families.filter((f) => !f.fatherPhone && !f.motherPhone);

    const confirmed = families.filter((f) => f.rsvpStatus === "confirmed").length;
    const withMeeting = families.filter((f) => appointments.some((a) => a.familyId === f.id)).length;

    return {
      byStage,
      byTrack,
      noTrack,
      byGrade,
      topCities,
      weeks,
      next14,
      docsPct: docsTotal ? Math.round((docsDone / docsTotal) * 100) : 0,
      topMissingDocs,
      dupGroups,
      badIds,
      noPhone,
      confirmed,
      withMeeting,
      completeCount: byStage.find((x) => x.key === "complete")!.value,
    };
  }, [families, appointments, getFamily]);

  const total = families.length;
  const completePct = total ? Math.round((s.completeCount / total) * 100) : 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <header>
        <h2 className="font-display text-3xl font-bold flex items-center gap-2">
          <BarChart3 className="text-primary" /> סטטיסטיקות ובקרת נתונים
        </h2>
        <p className="text-muted-foreground mt-1">תמונת מצב של עונת הרישום — מתעדכן בזמן אמת</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi icon={Users} label="תלמידים פעילים" value={total.toLocaleString("he-IL")} tone="bg-primary-soft text-primary" />
        <Kpi icon={CheckCircle2} label="השלימו רישום" value={`${s.completeCount} · ${completePct}%`} tone="bg-success-soft text-success" />
        <Kpi icon={CalendarClock} label="עם פגישה / אישרו הגעה" value={`${s.withMeeting} / ${s.confirmed}`} tone="bg-info-soft text-info" />
        <Kpi icon={FileWarning} label="שלמות מסמכים" value={`${s.docsPct}%`} tone="bg-warning-soft text-warning" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card title="משפך הרישום" className="xl:col-span-2">
          <ul className="space-y-3 py-2">
            {s.byStage.map((x) => {
              const max = Math.max(1, ...s.byStage.map((y) => y.value));
              return (
                <li key={x.key} className="flex items-center gap-3">
                  <span className="w-28 text-sm font-medium shrink-0">{x.name}</span>
                  <div className="flex-1 h-8 bg-muted/60 rounded-lg overflow-hidden">
                    <div
                      className="h-full rounded-lg flex items-center px-2 text-xs font-bold text-white transition-all"
                      style={{ width: `${Math.max(4, (x.value / max) * 100)}%`, background: STAGE_HEX[x.key] }}
                    >
                      {x.value > 0 && x.value.toLocaleString("he-IL")}
                    </div>
                  </div>
                  <span className="w-12 text-left text-xs text-muted-foreground shrink-0">
                    {total ? Math.round((x.value / total) * 100) : 0}%
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card title="לפי מסלול">
          <div dir="ltr"><ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie isAnimationActive={false} data={s.byTrack} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={3}>
                {s.byTrack.map((x) => (
                  <Cell key={x.key} fill={TRACK_HEX[x.key]} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle} />
            </PieChart>
          </ResponsiveContainer></div>
          <ul className="space-y-1 text-sm">
            {s.byTrack.map((t) => (
              <li key={t.key} className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ background: TRACK_HEX[t.key] }} />
                  {t.name}
                </span>
                <span className="font-semibold">
                  {t.value} <span className="text-muted-foreground font-normal text-xs">({t.complete} הושלמו)</span>
                </span>
              </li>
            ))}
            {s.noTrack.length > 0 && (
              <li className="flex items-center justify-between text-muted-foreground">
                <span>ללא מסלול</span>
                <span>{s.noTrack.length}</span>
              </li>
            )}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="לפי כיתה">
          <div dir="ltr"><ResponsiveContainer width="100%" height={240}>
            <BarChart data={s.byGrade}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis allowDecimals={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar isAnimationActive={false} dataKey="בתהליך" stackId="a" fill="#93c5fd" />
              <Bar isAnimationActive={false} dataKey="רשומים" stackId="a" fill="#22a06b" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="פגישות ב-14 הימים הקרובים">
          <div dir="ltr"><ResponsiveContainer width="100%" height={240}>
            <BarChart data={s.next14}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-35} height={55} textAnchor="end" />
              <YAxis allowDecimals={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "פגישות"]} />
              <Bar isAnimationActive={false} dataKey="value" fill="#8b5cf6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="תלמידים חדשים לפי שבוע">
          <div dir="ltr"><ResponsiveContainer width="100%" height={220}>
            <BarChart data={s.weeks}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} width={32} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "נוספו"]} />
              <Bar isAnimationActive={false} dataKey="value" fill="#3b8beb" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card title="ערים מובילות">
          <ul className="space-y-2">
            {s.topCities.map((c) => (
              <li key={c.name} className="flex items-center gap-3 text-sm">
                <span className="w-28 truncate">{c.name}</span>
                <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${(c.value / (s.topCities[0]?.value || 1)) * 100}%` }} />
                </div>
                <span className="w-10 text-left font-semibold">{c.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="המסמכים שהכי חסרים">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {s.topMissingDocs.map(([label, n]) => (
            <div key={label} className="flex items-center justify-between p-2.5 rounded-lg bg-warning-soft/50 border border-warning/20 text-sm">
              <span>{label}</span>
              <span className="font-bold">{n}</span>
            </div>
          ))}
        </div>
      </Card>

      <section className="card-elev p-6 space-y-5">
        <h3 className="font-display text-xl font-bold flex items-center gap-2">
          <ShieldAlert className="text-destructive" size={20} /> בקרת איכות נתונים
        </h3>
        <QualityList
          icon={CopyIcon}
          title="כפילויות אפשריות"
          hint="אותה ת.ז., או אותו שם + אותו טלפון"
          empty="לא נמצאו כפילויות 🎉"
          items={s.dupGroups.map((g) => ({
            key: g.map((f) => f.id).join(","),
            content: (
              <div className="flex flex-wrap items-center gap-2">
                {g.map((f) => (
                  <Button key={f.id} size="sm" variant="outline" onClick={() => onOpenFamily(f.id)}>
                    {f.studentName} · {STAGE_LABELS[f.stage]}
                  </Button>
                ))}
                {g[0].studentId && <span className="text-xs text-muted-foreground" dir="ltr">ת.ז. {g[0].studentId}</span>}
              </div>
            ),
          }))}
        />
        <QualityList
          icon={IdCard}
          title="מספרי ת.ז. עם ספרת ביקורת שגויה"
          hint="כנראה טעות הקלדה"
          empty="כל מספרי הזהות תקינים"
          items={s.badIds.map((f) => ({
            key: f.id,
            content: (
              <button type="button" className="text-sm hover:underline" onClick={() => onOpenFamily(f.id)}>
                {f.studentName} — <span dir="ltr">{f.studentId}</span>
              </button>
            ),
          }))}
        />
        <QualityList
          icon={PhoneOff}
          title="ללא מספר טלפון"
          hint="אי אפשר לשלוח להם תזכורות"
          empty="לכולם יש טלפון"
          items={s.noPhone.map((f) => ({
            key: f.id,
            content: (
              <button type="button" className="text-sm hover:underline" onClick={() => onOpenFamily(f.id)}>
                {f.studentName}
              </button>
            ),
          }))}
        />
      </section>
    </div>
  );
};

const Kpi = ({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: string; tone: string }) => (
  <div className="card-elev p-4 flex items-center gap-3">
    <div className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${tone}`}>
      <Icon size={22} />
    </div>
    <div className="min-w-0">
      <div className="text-2xl font-display font-bold leading-none">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  </div>
);

const Card = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`card-elev p-5 ${className}`}>
    <h3 className="font-display text-lg font-bold mb-3">{title}</h3>
    {children}
  </section>
);

const QualityList = ({
  icon: Icon,
  title,
  hint,
  empty,
  items,
}: {
  icon: typeof Users;
  title: string;
  hint: string;
  empty: string;
  items: { key: string; content: React.ReactNode }[];
}) => (
  <div>
    <div className="flex items-center gap-2 mb-2">
      <Icon size={16} className="text-muted-foreground" />
      <h4 className="font-semibold">{title}</h4>
      <span className="text-xs bg-muted rounded-full px-2 py-0.5">{items.length}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </div>
    {items.length === 0 ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      <ul className="space-y-1.5 max-h-60 overflow-y-auto scrollbar-thin">
        {items.slice(0, 50).map((i) => (
          <li key={i.key} className="p-2 rounded-lg bg-muted/40 border border-border">
            {i.content}
          </li>
        ))}
        {items.length > 50 && <li className="text-xs text-muted-foreground">ועוד {items.length - 50}…</li>}
      </ul>
    )}
  </div>
);
