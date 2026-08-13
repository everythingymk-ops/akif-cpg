import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The browser Supabase client, created once per tab.
 *
 * The publishable key is public by design — it ships inside the bundle and
 * only names the project. Row-level security is the boundary that actually
 * protects the data (see supabase/migrations/0001_init.sql). The *secret* key
 * bypasses those policies and must never reach this file.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** True when the app has been told where its backend is. */
export const isSupabaseConfigured = Boolean(url && publishableKey);

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!url || !publishableKey) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and fill in " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (see supabase/README.md).",
    );
  }
  client ??= createClient(url, publishableKey, {
    auth: {
      // The app is a static export with no server, so the session lives in the
      // browser and has to survive a reload on its own.
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/**
 * Internal login addresses, so nobody has to type an email (PRD §82).
 *
 * Somebody handed their credentials will often paste the whole address anyway;
 * appending the domain to that produced `name@akif-cpg.app@akif-cpg.app` and a
 * login that could never succeed. An input that already looks like an address
 * is taken as one.
 */
export function emailForUsername(username: string): string {
  const trimmed = username.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : `${trimmed}@akif-cpg.app`;
}

/** The username behind one of those addresses, for display. */
export function usernameForEmail(email: string | undefined): string {
  if (!email) return "";
  const [name] = email.split("@");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
