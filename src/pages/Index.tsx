import { Suspense, lazy, useCallback, useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Menu, Search, Loader2, RefreshCw, FlaskConical } from "lucide-react";
import { CrmProvider, useCrm } from "@/store/crmStore";
import { useSession } from "@/lib/session";
import { Sidebar, SidebarContent, View } from "@/components/crm/Sidebar";
import { Dashboard } from "@/components/crm/Dashboard";
import { KanbanBoard } from "@/components/crm/KanbanBoard";
const CalendarView = lazy(() =>
  import("@/components/crm/CalendarView").then((m) => ({
    default: m.CalendarView,
  })),
);
const PotentialsView = lazy(() =>
  import("@/components/crm/PotentialsView").then((m) => ({
    default: m.PotentialsView,
  })),
);
const PersuasionView = lazy(() =>
  import("@/components/crm/PersuasionView").then((m) => ({
    default: m.PersuasionView,
  })),
);
const ArchiveView = lazy(() =>
  import("@/components/crm/ArchiveView").then((m) => ({
    default: m.ArchiveView,
  })),
);
const StudentsTable = lazy(() =>
  import("@/components/crm/StudentsTable").then((m) => ({
    default: m.StudentsTable,
  })),
);
const AdminView = lazy(() => import("@/components/crm/AdminView").then((m) => ({ default: m.AdminView })));
const PrincipalView = lazy(() =>
  import("@/components/crm/principal/Principal").then((m) => ({
    default: m.PrincipalView,
  })),
);
const StudentFile = lazy(() =>
  import("@/components/crm/file/StudentFile").then((m) => ({
    default: m.StudentFile,
  })),
);
const RequestsView = lazy(() =>
  import("@/components/crm/RequestsView").then((m) => ({
    default: m.RequestsView,
  })),
);
const StatsView = lazy(() => import("@/components/crm/StatsView").then((m) => ({ default: m.StatsView })));
import { FamilyProfile } from "@/components/crm/FamilyProfile";
import { StudentForm } from "@/components/crm/StudentForm";
import { MentionAlerts } from "@/components/crm/card/CardExtras";
import { PrincipalAlerts } from "@/components/crm/principal/Principal";
import type { Family } from "@/types/crm";
import { CommandPalette } from "@/components/crm/CommandPalette";
import { RsvpToastListener } from "@/components/crm/RsvpToastListener";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

const VIEWS: View[] = ["dashboard", "students", "kanban", "calendar", "persuasion", "potentials", "stats", "archive", "principal", "requests", "admin"];

/** Keep the current screen in the URL hash so refresh / back button work. */
const viewFromHash = (): View => {
  const h = window.location.hash.replace("#", "") as View;
  return VIEWS.includes(h) ? h : "dashboard";
};
/** "#file/<student id>" = the student file screen */
const fileFromHash = (): string | null => {
  const m = window.location.hash.match(/^#file\/([0-9a-fA-F-]{36})$/);
  return m ? m[1] : null;
};

const Shell = () => {
  const [view, setViewState] = useState<View>(viewFromHash);
  const [fileId, setFileId] = useState<string | null>(fileFromHash);
  const [familyId, setFamilyId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Partial<Family> | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { getFamily, loading, error, reload, backendKind } = useCrm();
  const can = useSession().can;
  // a principal without general access lives only in his inbox + the files sent to him
  const principalOnly = can.principalOnly;
  const shownView: View = principalOnly ? "principal" : view;

  const setView = useCallback((v: View) => {
    setViewState(v);
    setFileId(null);
    if (window.location.hash !== `#${v}`) window.history.pushState(null, "", `#${v}`);
    window.scrollTo({ top: 0 });
  }, []);

  const openFile = useCallback((id: string) => {
    setFamilyId(null);
    setFileId(id);
    if (window.location.hash !== `#file/${id}`) window.history.pushState({ file: true }, "", `#file/${id}`);
    window.scrollTo({ top: 0 });
  }, []);
  const closeFile = useCallback(() => {
    if (window.history.state?.file) window.history.back();
    else {
      setFileId(null);
      window.history.replaceState(null, "", `#${view}`);
    }
  }, [view]);

  useEffect(() => {
    const onPop = () => {
      setFileId(fileFromHash());
      if (!fileFromHash()) setViewState(viewFromHash());
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Keyboard: Ctrl/Cmd+K or "/" → quick search, "n" → new student
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (principalOnly) return;
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
  }, [principalOnly]);

  const openCreate = useCallback(() => {
    if (!can.add) return;
    setEditId(null);
    setPrefill(null);
    setFormOpen(true);
  }, [can.add]);
  const openEdit = (id: string) => {
    if (!can.edit) return;
    setPrefill(null);
    setFamilyId(null);
    setEditId(id);
    setFormOpen(true);
  };
  const openFamily = useCallback((id: string) => (principalOnly ? openFile(id) : setFamilyId(id)), [principalOnly, openFile]);

  return (
    <div className="min-h-screen bg-gradient-soft flex w-full" dir="rtl">
      <RsvpToastListener onOpenFamily={openFamily} />
      <Sidebar view={shownView} onChange={setView} onOpenSearch={principalOnly ? undefined : () => setPaletteOpen(true)} />
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Mobile top bar */}
        <header className="lg:hidden print:hidden sticky top-0 z-30 flex items-center justify-between gap-3 p-3 border-b border-border bg-card/95 backdrop-blur">
          <div className="flex items-center gap-2">
            <Logo className="size-9" />
            <span className="font-display font-bold">רישום מגדל אור</span>
            {backendKind === "demo" && <FlaskConical size={16} className="text-amber-600" aria-label="מצב הדגמה" />}
          </div>
          <div className="flex items-center gap-1">
            {!principalOnly && (
              <Button variant="ghost" size="icon" aria-label="חיפוש מהיר" onClick={() => setPaletteOpen(true)}>
                <Search />
              </Button>
            )}
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="תפריט">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="p-0 w-72" dir="rtl">
                <SheetTitle className="sr-only">תפריט ניווט</SheetTitle>
                <SidebarContent view={shownView} onChange={setView} onNavigate={() => setMobileNavOpen(false)} />
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
              {fileId ? (
                <StudentFile key={fileId} familyId={fileId} onBack={closeFile} />
              ) : (
                <>
                  {shownView === "dashboard" && <Dashboard onOpenFamily={openFamily} onAddStudent={openCreate} onNavigate={setView} />}
                  {shownView === "students" && <StudentsTable onOpenFamily={openFamily} onAddStudent={openCreate} />}
                  {shownView === "kanban" && <KanbanBoard onOpenFamily={openFamily} onAddStudent={openCreate} />}
                  {shownView === "calendar" && <CalendarView onOpenFamily={openFamily} />}
                  {shownView === "persuasion" && <PersuasionView onOpenFamily={openFamily} />}
                  {shownView === "potentials" && <PotentialsView onOpenFamily={openFamily} />}
                  {shownView === "stats" && <StatsView onOpenFamily={openFamily} />}
                  {shownView === "archive" && <ArchiveView onOpenFamily={openFamily} />}
                  {shownView === "principal" && <PrincipalView onOpenFamily={openFamily} onOpenFile={openFile} />}
                  {shownView === "requests" && <RequestsView />}
                  {shownView === "admin" && <AdminView />}
                </>
              )}
            </Suspense>
          )}
        </main>
      </div>
      <FamilyProfile
        familyId={familyId}
        onClose={() => setFamilyId(null)}
        onEdit={openEdit}
        onOpenFamily={openFamily}
        onOpenFile={openFile}
        onAddSibling={(p) => {
          setFamilyId(null);
          setEditId(null);
          setPrefill(p);
          setFormOpen(true);
        }}
      />
      <StudentForm open={formOpen} onClose={() => setFormOpen(false)} family={editId ? getFamily(editId) : null} onOpenFamily={openFamily} prefill={prefill} />
      <MentionAlerts onOpenFamily={openFamily} />
      <PrincipalAlerts onOpenFile={openFile} />
      {!principalOnly && (
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onOpenFamily={openFamily} onNavigate={setView} onAddStudent={openCreate} />
      )}
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
