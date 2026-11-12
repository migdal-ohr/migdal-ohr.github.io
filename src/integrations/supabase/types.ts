export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_type: string
          actor_email: string | null
          created_at: string
          description: string
          family_id: string | null
          id: string
        }
        Insert: {
          action_type: string
          actor_email?: string | null
          created_at?: string
          description: string
          family_id?: string | null
          id?: string
        }
        Update: {
          action_type?: string
          actor_email?: string | null
          created_at?: string
          description?: string
          family_id?: string | null
          id?: string
        }
        Relationships: []
      }
      appointments: {
        Row: {
          created_at: string
          date: string
          family_id: string
          id: string
          type: string
        }
        Insert: {
          created_at?: string
          date: string
          family_id: string
          id: string
          type?: string
        }
        Update: {
          created_at?: string
          date?: string
          family_id?: string
          id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_family_id_fkey"
            columns: ["family_id"]
            isOneToOne: true
            referencedRelation: "families"
            referencedColumns: ["id"]
          },
        ]
      }
      families: {
        Row: {
          created_at: string
          data: Json
          id: string
          rsvp_token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data: Json
          id: string
          rsvp_token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          rsvp_token?: string
          updated_at?: string
        }
        Relationships: []
      }
      potentials: {
        Row: {
          converted: boolean
          converted_family_id: string | null
          created_at: string
          date_of_birth: string
          full_name: string
          grade: number
          id: string
          id_number: string | null
          source: string | null
          updated_at: string
        }
        Insert: {
          converted?: boolean
          converted_family_id?: string | null
          created_at?: string
          date_of_birth: string
          full_name: string
          grade: number
          id?: string
          id_number?: string | null
          source?: string | null
          updated_at?: string
        }
        Update: {
          converted?: boolean
          converted_family_id?: string | null
          created_at?: string
          date_of_birth?: string
          full_name?: string
          grade?: number
          id?: string
          id_number?: string | null
          source?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_rsvp: {
        Args: { p_token: string }
        Returns: {
          appointment_date: string | null
          first_name: string | null
          rsvp_status: string
        }[]
      }
      patch_family: {
        Args: { p_id: string; p_patch: Json }
        Returns: Json
      }
      public_register: {
        Args: { p: Json }
        Returns: string
      }
      set_family_appointment: {
        Args: { p_date: string | null; p_family_id: string; p_type?: string }
        Returns: string | null
      }
      submit_rsvp: {
        Args: { p_status: string; p_token: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  T extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]),
> = (DefaultSchema["Tables"] & DefaultSchema["Views"])[T] extends { Row: infer R } ? R : never

export type TablesInsert<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Insert: infer I } ? I : never

export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> =
  DefaultSchema["Tables"][T] extends { Update: infer U } ? U : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
