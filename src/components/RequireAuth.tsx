import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { isDemoMode } from "@/lib/api";
import { useSession } from "@/lib/session";
import { Button } from "@/components/ui/button";

const Center = ({ children }: { children: React.ReactNode }) => (
  <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-muted-foreground p-6 text-center" dir="rtl">
    {children}
  </div>
);

export const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const demo = isDemoMode();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(!demo);
  const { loading: profileLoading, role, profile } = useSession();

  useEffect(() => {
    if (demo) return;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, [demo]);

  if (demo) return <>{children}</>;
  if (loading || (session && profileLoading))
    return (
      <Center>
        <Loader2 className="animate-spin" /> טוען...
      </Center>
    );
  if (!session) return <Navigate to="/auth" replace />;
  if (!role)
    return (
      <Center>
        <ShieldAlert size={48} className="text-warning" />
        <h1 className="text-xl font-bold text-foreground">אין לחשבון הזה הרשאת גישה</h1>
        <p>
          {profile && !profile.is_active
            ? "החשבון הושבת. פנו למנהל המערכת."
            : "החשבון עדיין לא קיבל תפקיד במערכת. מנהל המערכת צריך לאשר אותו."}
        </p>
        <Button variant="outline" onClick={() => supabase.auth.signOut()}>
          התנתקות
        </Button>
      </Center>
    );
  return <>{children}</>;
};
