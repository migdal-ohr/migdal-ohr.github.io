import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { publicBaseUrl } from "@/lib/whatsapp";

const HEB_ERRORS: Record<string, string> = {
  "Invalid login credentials": "אימייל או סיסמה שגויים",
  "Email not confirmed": "האימייל עדיין לא אומת",
  "For security purposes, you can only request this after": "נשלחה כבר בקשה — נסו שוב בעוד דקה",
};
const he = (msg: string) => Object.entries(HEB_ERRORS).find(([k]) => msg.startsWith(k))?.[1] ?? msg;

const Auth = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const rawNext = params.get("next");
  // Only accept same-origin relative paths to prevent open-redirect.
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");

  useEffect(() => {
    const go = () => {
      if (nextPath) window.location.replace(nextPath);
      else navigate("/", { replace: true });
    };
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) go();
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) go();
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate, nextPath]);

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);
    if (error) toast.error(he(error.message));
  };

  // Public self-registration is intentionally disabled. Staff accounts are
  // provisioned by an admin via the backend dashboard.

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${publicBaseUrl() || window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) toast.error(he(error.message));
    else {
      toast.success("אם האימייל רשום במערכת — נשלח אליו קישור לאיפוס סיסמה");
      setForgotOpen(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-soft p-4">
      <Card className="w-full max-w-md shadow-card rounded-2xl">
        <CardHeader className="items-center text-center">
          <Logo className="size-20 mb-2" />
          <CardTitle className="font-display">צוות רישום מגדל אור</CardTitle>
        </CardHeader>
        <CardContent>
          {forgotOpen ? (
            <form onSubmit={sendReset} className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="forgot-email">אימייל</Label>
                <Input id="forgot-email" type="email" dir="ltr" required value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} />
              </div>
              <Button className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                שלח קישור איפוס
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={() => setForgotOpen(false)}>
                חזרה לכניסה
              </Button>
            </form>
          ) : (
            <form onSubmit={signIn} className="space-y-3 pt-3">
              <div className="space-y-1.5">
                <Label htmlFor="email">אימייל</Label>
                <Input id="email" type="email" dir="ltr" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">סיסמה</Label>
                <Input
                  id="password"
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <Button className="w-full" disabled={loading}>
                {loading && <Loader2 className="animate-spin" />}
                כניסה
              </Button>
              <button
                type="button"
                onClick={() => {
                  setForgotEmail(email);
                  setForgotOpen(true);
                }}
                className="text-sm text-primary hover:underline w-full text-center"
              >
                שכחתי סיסמה
              </button>
            </form>
          )}
          <div className="mt-6 pt-4 border-t text-center">
            <a href="/?demo=1" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
              <FlaskConical size={12} /> כניסה למצב הדגמה (1,400 תלמידים פיקטיביים)
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
