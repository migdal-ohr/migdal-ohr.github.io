import { useEffect } from "react";
import { toast } from "sonner";
import { CheckCircle2, CalendarX, UserPlus } from "lucide-react";
import { api } from "@/lib/api";

/**
 * Shows a LARGE toast whenever a parent answers the RSVP page.
 * Mounted once at the app shell level.
 */
export const RsvpToastListener = ({ onOpenFamily }: { onOpenFamily?: (id: string) => void }) => {
  useEffect(() => {
    const mountedAt = Date.now();
    return api.subscribe({
      activity: (log) => {
        if (new Date(log.created_at).getTime() < mountedAt - 5000) return;
        const action =
          log.family_id && onOpenFamily
            ? { label: "פתח כרטיס", onClick: () => onOpenFamily(log.family_id!) }
            : undefined;
        if (log.action_type === "rsvp_confirmed") {
          toast.success(log.description, {
            duration: Infinity,
            closeButton: true,
            icon: <CheckCircle2 className="text-success" size={28} />,
            className: "rsvp-mega-toast",
            action,
          });
        } else if (log.action_type === "web_registration") {
          toast.info(log.description, {
            duration: 20000,
            closeButton: true,
            icon: <UserPlus className="text-primary" size={28} />,
            className: "rsvp-mega-toast",
            action,
          });
        } else if (log.action_type === "rsvp_reschedule") {
          toast.error(log.description, {
            duration: Infinity,
            closeButton: true,
            icon: <CalendarX className="text-destructive" size={28} />,
            className: "rsvp-mega-toast",
            action,
          });
        }
      },
    });
  }, [onOpenFamily]);
  return null;
};
