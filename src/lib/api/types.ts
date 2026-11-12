/** Raw row shapes shared by every backend (Supabase / demo). */
export interface FamilyRow {
  id: string;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  rsvp_token?: string | null;
}

export interface AppointmentRow {
  id: string;
  family_id: string;
  date: string;
  type: string;
}

export interface ActivityRow {
  id: string;
  action_type: string;
  description: string;
  created_at: string;
  family_id?: string | null;
  actor_email?: string | null;
}

export interface PotentialRow {
  id: string;
  full_name: string;
  id_number: string | null;
  date_of_birth: string;
  grade: number;
  source: string | null;
  converted: boolean;
  converted_family_id: string | null;
  created_at: string;
}

export interface RsvpInfo {
  firstName: string;
  appointmentDate: string | null;
  status: "pending" | "confirmed" | "reschedule_requested";
}

export type ChangeEvent = "INSERT" | "UPDATE" | "DELETE";

export interface RealtimeHandlers {
  family?: (evt: ChangeEvent, row: FamilyRow | null, oldId?: string) => void;
  appointment?: (evt: ChangeEvent, row: AppointmentRow | null, oldFamilyId?: string, oldId?: string) => void;
  activity?: (row: ActivityRow) => void;
  /** Called when the realtime channel (re)connects — clients should resync. */
  reconnect?: () => void;
}

export interface ScannedChild {
  fullName: string;
  idNumber: string;
  dateOfBirth: string;
  idValid?: boolean;
}

export interface Backend {
  kind: "supabase" | "demo";
  listFamilies(): Promise<FamilyRow[]>;
  listAppointments(): Promise<AppointmentRow[]>;
  insertFamily(id: string, data: Record<string, unknown>): Promise<FamilyRow>;
  insertFamilies(rows: { id: string; data: Record<string, unknown> }[]): Promise<number>;
  /** Atomic server-side merge. Nested `documents`/`stations` are merged key-by-key. */
  patchFamily(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown>>;
  deleteFamily(id: string): Promise<void>;
  /** Replace the single appointment of a family. `null` clears it. */
  setAppointment(familyId: string, dateIso: string | null, type?: string): Promise<void>;
  listActivity(limit: number, familyId?: string): Promise<ActivityRow[]>;
  logActivity(action_type: string, description: string, familyId?: string): Promise<void>;
  listPotentials(): Promise<PotentialRow[]>;
  insertPotentials(rows: Omit<PotentialRow, "id" | "created_at" | "converted" | "converted_family_id">[]): Promise<number>;
  updatePotential(id: string, patch: Partial<PotentialRow>): Promise<void>;
  deletePotential(id: string): Promise<void>;
  scanIdSlip(images: string[], mimeType: string): Promise<{ children: ScannedChild[]; totalDetected?: number }>;
  uploadPhoto(familyId: string, blob: Blob): Promise<string>;
  photoUrl(path: string): Promise<string | null>;
  /** Upload a scanned document file; returns storage path. */
  uploadDoc(familyId: string, file: File): Promise<string>;
  docUrl(path: string): Promise<string | null>;
  deleteDoc(path: string): Promise<void>;
  /** Public self-registration (parents). Returns "ok" | "exists". */
  publicRegister(payload: Record<string, unknown>): Promise<string>;
  getRsvp(token: string): Promise<RsvpInfo | null>;
  submitRsvp(token: string, status: "confirmed" | "reschedule_requested"): Promise<void>;
  subscribe(h: RealtimeHandlers): () => void;
  currentUserEmail(): Promise<string | null>;
  signOut(): Promise<void>;
}
