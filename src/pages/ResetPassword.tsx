import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const [waitedLong, setWaitedLong] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    const searchParams = url.searchParams;
    const type = hashParams.get("type") || searchParams.get("type");
    const accessToken = hashParams.get("access_token");
    const refreshToken = hashParams.get("refresh_token");
    const errDesc = hashParams.get("error_description") || searchParams.get("error_description");

    if (errDesc) setSessionError("קישור האיפוס אינו תקין או שפג תוקפו. בקשו קישור חדש.");

    if (type === "recovery") {
      setReady(true);
      if (accessToken && refreshToken) {
        supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(({ error }) => {
          if (error) setSessionError("קישור האיפוס אינו תקין או שפג תוקפו. בקשו קישור חדש.");
        });
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const t = setTimeout(() => setWaitedLong(true), 6000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("הסיסמה צריכה להכיל לפחות 8 תווים");
    if (password !== confirm) return toast.error("הסיסמאות אינן תואמות");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) toast.error(error.message);
    else {
      toast.success("הסיסמה עודכנה בהצלחה");
      navigate("/", { replace: true });
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center bg-gradient-soft p-4">
      <Card className="w-full max-w-md rounded-2xl shadow-card">
        <CardHeader>
          <CardTitle className="text-center font-display">איפוס סיסמה</CardTitle>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <div className="text-center text-muted-foreground text-sm space-y-3">
              {sessionError ? (
                <p className="text-destructive">{sessionError}</p>
              ) : (
                <p className="flex items-center justify-center gap-2">
                  <Loader2 className="animate-spin" size={16} /> מאמת את הקישור…
                </p>
              )}
              {(waitedLong || sessionError) && (
                <Button variant="outline" onClick={() => navigate("/auth")}>
                  חזרה למסך הכניסה לבקשת קישור חדש
                </Button>
              )}
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-3">
              {sessionError && <p className="text-center text-destructive text-sm">{sessionError}</p>}
              <div className="space-y-1.5">
                <Label htmlFor="np">סיסמה חדשה</Label>
                <Input id="np" type="password" dir="ltr" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cp">אימות סיסמה חדשה</Label>
                <Input id="cp" type="password" dir="ltr" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
              <Button className="w-full" disabled={loading || !!sessionError}>
                {loading ? "מעדכן..." : "עדכון סיסמה"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
