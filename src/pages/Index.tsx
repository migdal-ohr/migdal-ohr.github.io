import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Menu, Search, Loader2, RefreshCw, FlaskConical } from "lucide-react";
import { CrmProvider, useCrm } from "@/store/crmStore";
import { useSession } from "@/lib/session";
import { Sidebar, SidebarContent, View } from "@/components/crm/Sidebar";
import { Dashboard } from "@/components/crm/Dashboard";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
const CalendarView = lazy(() => import("@/components/crm/CalendarView").then((m) => ({ default: m.CalendarView })));
const PotentialsView = lazy(() => import("@/components/crm/PotentialsView").then((m) => ({ default: m.PotentialsView })));
const PersuasionView = lazy(() => import("@/components/crm/PersuasionView").then((m) => ({ default: m.PersuasionView })));
const ArchiveView = lazy(() => import("@/components/crm/ArchiveView").then((m) => ({ default: m.ArchiveView })));
const StudentsTable = lazy(() => import("@/components/crm/StudentsTable").then((m) => ({ default: m.StudentsTable })));
const AdminView = lazy(() => import("@/components/crm/AdminView").then((m) => ({ default: m.AdminView })));
const RequestsView = lazy(() => import("@/components/crm/RequestsView").then((m) => ({ default: m.RequestsView })));
const StatsView = lazy(() => import("@/components/crm/StatsView").then((m) => ({ default: m.StatsView })));
import { FamilyProfile } from "@/components/crm/FamilyProfile";
import { StudentForm } from "@/components/crm/StudentForm";
import { CommandPalette } from "@/components/crm/CommandPalette";
import { RsvpToastListener } from "@/components/crm/RsvpToastListener";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const VIEWS: View[] = ["dashboard", "students", "kanban", "calendar", "persuasion", "potentials", "stats", "archive", "requests", "admin"];

/** Keep the current screen in the URL hash so refresh / back button work. */
const viewFromHash = (): View => {
  const h = window.location.hash.replace("#", "") as View;
  return VIEWS.includes(h) ? h : "dashboard";
};

const Shell = () => {
  const [view, setViewState] = useState<View>(viewFromHash);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { getFamily, loading, error, reload, backendKind } = useCrm();

  const setView = useCallback((v: View) => {
    setViewState(v);
    if (window.location.hash !== `#${v}`) window.history.pushState(null, "", `#${v}`);
    window.scrollTo({ top: 0 });
  }, []);

  useEffect(() => {
    const onPop = () => setViewState(viewFromHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Keyboard: Ctrl/Cmd+K or "/" → quick search, "n" → new student
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (!typing && e.key === "/") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const can = useSession().can;
  const openCreate = useCallback(() => {
    if (!can.edit) return;
    setEditId(null);
    setFormOpen(true);
  }, [can.edit]);
  const openEdit = (id: string) => {
    if (!can.edit) return;
    setFamilyId(null);
    setEditId(id);
    setFormOpen(true);
  };
  const openFamily = useCallback((id: string) => setFamilyId(id), []);

  return (
    <div className="min-h-screen bg-gradient-soft flex w-full" dir="rtl">
      <RsvpToastListener onOpenFamily={openFamily} />
      <Sidebar view={view} onChange={setView} onOpenSearch={() => setPaletteOpen(true)} />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between gap-3 p-3 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Logo className="size-9" />
            <span className="font-display font-bold">רישום מגדל אור</span>
            {backendKind === "demo" && <FlaskConical size={16} className="text-amber-600" aria-label="מצב הדגמה" />}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" aria-label="חיפוש מהיר" onClick={() => setPaletteOpen(true)}>
              <Search />
            </Button>
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="תפריט">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 w-72" dir="rtl">
                <SheetTitle className="sr-only">תפריט ניווט</SheetTitle>
                <SidebarContent view={view} onChange={setView} onNavigate={() => setMobileNavOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-10 overflow-x-hidden">
          {loading ? (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-3 text-muted-foreground">
              <Loader2 className="animate-spin text-primary" size={40} />
              טוען את נתוני הרישום…
            </div>
          ) : error ? (
            <div className="h-[60vh] flex flex-col items-center justify-center gap-3 text-center">
              <p className="font-semibold text-destructive">לא הצלחנו לטעון את הנתונים</p>
              <p className="text-sm text-muted-foreground max-w-md">{error}</p>
              <Button onClick={() => reload()}>
                <RefreshCw size={16} /> נסו שוב
              </Button>
            </div>
          ) : (
            <Suspense
              fallback={
                <div className="h-[50vh] flex items-center justify-center">
                  <Loader2 className="animate-spin text-primary" size={32} />
                </div>
              }
            >
              {view === "dashboard" && <Dashboard onOpenFamily={openFamily} onAddStudent={openCreate} onNavigate={setView} />}
              {view === "students" && <StudentsTable onOpenFamily={openFamily} onAddStudent={openCreate} />}
              {view === "kanban" && <KanbanBoard onOpenFamily={openFamily} onAddStudent={openCreate} />}
              {view === "calendar" && <CalendarView onOpenFamily={openFamily} />}
              {view === "persuasion" && <PersuasionView onOpenFamily={openFamily} />}
              {view === "potentials" && <PotentialsView onOpenFamily={openFamily} />}
              {view === "stats" && <StatsView onOpenFamily={openFamily} />}
              {view === "archive" && <ArchiveView onOpenFamily={openFamily} />}
              {view === "requests" && <RequestsView />}
              {view === "admin" && <AdminView />}
            </Suspense>
          )}
        </main>
      </div>
      <FamilyProfile familyId={familyId} onClose={() => setFamilyId(null)} onEdit={openEdit} />
      <StudentForm open={formOpen} onClose={() => setFormOpen(false)} family={editId ? getFamily(editId) : null} onOpenFamily={openFamily} />
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onOpenFamily={openFamily}
        onNavigate={setView}
        onAddStudent={openCreate}
      />
    </div>
  );
};

const Index = () => {
  const { scopeKey } = useSession();
  // remount the whole data layer when the school year changes
  return (
    <CrmProvider key={scopeKey}>
      <Shell />
    </CrmProvider>
  );
};

export default Index;
