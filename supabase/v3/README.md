# v3 database (Supabase project uibnnfcneqlpghinljpz)

Applied in order: 001_schema → 002_functions → 003_harden_grants → 004_server_role_bypass.
The authoritative applied text is in `supabase_migrations.schema_migrations` on the project
(001 there splits each write policy into separate insert/update/delete policies and adds FK indexes).

005_legacy_import (applied 2026-11-12): one-time `import_legacy(jsonb)` used to copy the Lovable
system's 145 students, 135 appointments and 156 activity entries (legacy_id = old id, rsvp_token kept
so links already sent to parents keep working). 006 dropped the function and removed test accounts/data.

Assistant (edge function `assistant`): answers staff "how do I…" questions. Provider: GEMINI_API_KEY secret
(optional GEMINI_MODEL), else ANTHROPIC_API_KEY. The system guide it answers from is stored in
app_settings key `assistant_knowledge` (source: supabase/assistant/knowledge.md) — update that row when screens change.
