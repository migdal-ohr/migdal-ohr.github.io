import { useEffect, useRef, useState } from "react";
import { Sparkles, Send, Loader2, MessageSquarePlus, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = ["איך קובעים פגישה ושולחים תזכורת בוואטסאפ?", "איך מסמנים שהמסמכים התקבלו?", "איך מייבאים תלמידים מאקסל?", "מה ההבדל בין מזכירה למנהלת רישום?"];
const KEY = "assistant-chat";

/** Help chat that knows the system. Answers come from the `assistant` edge function. */
export const AssistantChat = () => {
  const [msgs, setMsgs] = useState<Msg[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-30)));
    } catch {
      /* private mode */
    }
    end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next);
    setText("");
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("assistant", { body: { messages: next } });
    setBusy(false);
    let answer = (data as { answer?: string } | null)?.answer;
    if (error || !answer) {
      let msg = "העוזר לא זמין כרגע, נסו שוב.";
      try {
        const body = await (error as { context?: Response })?.context?.json?.();
        if (body?.error) msg = body.error;
      } catch {
        /* keep default */
      }
      answer = msg;
    }
    setMsgs((m) => [...m, { role: "assistant", content: answer! }]);
  };

  const sendAsRequest = async (i: number) => {
    const q = msgs.slice(0, i).reverse().find((m) => m.role === "user")?.content ?? "";
    const { error } = await supabase.from("requests").insert({
      kind: "question",
      title: q.slice(0, 110) || "שאלה מהעוזר",
      body: `שאלה: ${q}\n\nתשובת העוזר: ${msgs[i].content}`.slice(0, 4000),
    });
    if (error) toast.error("השליחה נכשלה");
    else toast.success("נשלח כפנייה. אפשר לעקוב בלשונית \"הפניות שלי\"");
  };

  return (
    <div className="rounded-2xl border bg-card shadow-soft flex flex-col h-[70vh] min-h-[420px]">
      <div className="flex items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-primary flex items-center justify-center">
            <Sparkles size={18} className="text-primary-foreground" />
          </div>
          <div>
            <p className="font-bold leading-tight">העוזר של המערכת</p>
            <p className="text-xs text-muted-foreground">שאלו כל דבר על איך עובדים עם המערכת</p>
          </div>
        </div>
        {msgs.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setMsgs([])}>
            <RotateCcw size={14} /> שיחה חדשה
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3" aria-live="polite">
        {msgs.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
            <p className="text-sm text-muted-foreground">לדוגמה:</p>
            <div className="flex flex-wrap justify-center gap-2 max-w-xl">
              {STARTERS.map((s) => (
                <button key={s} onClick={() => ask(s)} className="rounded-full border px-3 py-1.5 text-sm hover:bg-muted transition">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-start" : "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                m.role === "user" ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-muted rounded-bl-sm",
              )}
            >
              {m.content.replace(/\*\*(.+?)\*\*/g, "$1")}
              {m.role === "assistant" && (
                <button onClick={() => sendAsRequest(i)} className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline">
                  <MessageSquarePlus size={13} /> שלח כפנייה
                </button>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-end">
            <div className="rounded-2xl bg-muted px-4 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> חושב…
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(text);
        }}
        className="border-t p-3 flex items-end gap-2"
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(text);
            }
          }}
          rows={1}
          maxLength={2000}
          placeholder="כתבו שאלה…"
          aria-label="שאלה לעוזר"
          className="min-h-[44px] max-h-32 resize-none"
        />
        <Button disabled={busy || !text.trim()} aria-label="שליחה">
          {busy ? <Loader2 className="animate-spin" /> : <Send size={16} />}
        </Button>
      </form>
    </div>
  );
};
