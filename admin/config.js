/**
 * CoWiTa admin dashboard — public configuration.
 *
 * Both values are PUBLIC and safe to ship to the browser: the Supabase URL and
 * the anon key. Row Level Security and the API's role checks are what protect
 * the data, not this key. NEVER put the service role key here.
 *
 * Fill these in per environment (they differ between staging and production),
 * or replace this file at build time from environment variables.
 */
window.COWITA_ADMIN_CONFIG = {
  SUPABASE_URL: 'https://your-project.supabase.co',
  SUPABASE_ANON_KEY: 'your-anon-public-key',

  /** Where the dashboard talks to the admin API. */
  API_BASE: '/api/admin',
};
