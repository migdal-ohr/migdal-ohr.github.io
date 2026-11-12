import { api } from "@/lib/api";

export type ActivityActionType =
  | "student_added"
  | "student_edited"
  | "student_deleted"
  | "stage_changed"
  | "meeting_set"
  | "meeting_cleared"
  | "documents_updated"
  | "rsvp_confirmed"
  | "rsvp_reschedule"
  | "student_archived"
  | "student_restored"
  | "import"
  | "web_registration"
  | "document_uploaded"
  | "whatsapp_round";

export interface ActivityLog {
  id: string;
  action_type: ActivityActionType | string;
  description: string;
  created_at: string;
  family_id?: string | null;
  actor_email?: string | null;
}

/** Fire-and-forget: logging must never break the app. */
export const logActivity = async (action_type: ActivityActionType, description: string, familyId?: string) => {
  try {
    await api.logActivity(action_type, description, familyId);
  } catch (e) {
    console.error("logActivity failed", e);
  }
};
