import { createClient } from "@supabase/supabase-js";

// Browser client — ANON key only, never service_role. The anon key is safe to
// expose client-side; it's subject to RLS (currently dormant per CLAUDE.md, but
// this client must never hold a key that bypasses it).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);
