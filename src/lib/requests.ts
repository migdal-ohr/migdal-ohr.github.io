import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isDemoMode } from "@/lib/api";
import type { Role } from "@/lib/session";

export type RequestKind = "bug" | "feature" | "question";
export type RequestStatus = "new" | "in_progress" | "done" | "rejected";
export type RequestLevel = "manager" | "admin";

export interface StaffRequest {
  id: string;
  kind: RequestKind;
  title: string;
  body: string;
  status: RequestStatus;
  level: RequestLevel;
  response: string | null;
  version: string | null;
  author_id: string | null;
  author_name: string | null;
  author_role: string | null;
  handled_by: string | null;
  created_at: string;
  updated_at: string;
}

export const KIND_LABELS: Record<RequestKind, string> = {
  bug: "תקלה",
  feature: "רעיון / תוספת",
  question: "שאלה",
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  new: "חדש",
  in_progress: "בטיפול",
  done: "בוצע",
  rejected: "לא יבוצע",
};

/** Which level this role handles (null = only submits). */
export const handledLevel = (role: Role | null): RequestLevel | null =>
  role === "admin" ? "admin" : role === "manager" ? "manager" : null;

/** Where a request written by this role goes. */
export const routeFor = (role: Role | null): RequestLevel => (role === "admin" || role === "manager" ? "admin" : "manager");

/** Live count of open requests waiting for me (for the sidebar badge). */
export const useOpenRequestsCount = (role: Role | null, userId?: string): number => {
  const [count, setCount] = useState(0);
  const level = handledLevel(role);
  useEffect(() => {
    if (!level || isDemoMode()) return;
    let alive = true;
    const load = async () => {
      let q = supabase.from("requests").select("id", { count: "exact", head: true }).in("status", ["new", "in_progress"]);
      if (level === "manager") q = q.eq("level", "manager");
      const { count: c } = await q;
      if (alive) setCount(c ?? 0);
    };
    load();
    const ch = supabase
      .channel(`requests-badge-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, (p) => {
        load();
        const n = p.new as Partial<StaffRequest> | undefined;
        const mineToHandle = n && n.author_id !== userId && (level === "admin" ? n.level === "admin" : n.level === "manager");
        if (p.eventType === "INSERT" && mineToHandle) toast.info(`פנייה חדשה: ${n?.title ?? ""}`, { description: n?.author_name ?? undefined });
        if (p.eventType === "UPDATE" && level === "admin" && n?.level === "admin" && (p.old as Partial<StaffRequest>)?.level === "manager")
          toast.info(`פנייה הועברה אליך: ${n?.title ?? ""}`);
      })
      .subscribe();
    return () => {
      alive = false;
      supabase.removeChannel(ch);
    };
  }, [level, userId]);
  return count;
};
