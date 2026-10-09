/**
 * CoWiTa API — Supabase access.
 *
 * The service-role client bypasses Row Level Security and must only ever run
 * server-side. Secrets come from environment variables and are never returned
 * to the browser.
 */

import { createClient } from '@supabase/supabase-js';
import { getEnv } from './config.mjs';

let cached = null;

/**
 * Test seam: lets the test suite inject an in-memory stand-in for Supabase so
 * the endpoint can be exercised without a network dependency. Never used in
 * production code paths.
 */
export function __setServiceClientForTests(client) {
  cached = client;
}

export function getServiceClient() {
  if (cached) return cached;

  const { supabaseUrl, supabaseServiceKey } = getEnv();

  if (!supabaseUrl || !supabaseServiceKey) {
    throw Object.assign(
      new Error(
        'Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.'
      ),
      { configuration: true }
    );
  }

  cached = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'X-Client-Info': 'cowita-site-api' } },
  });

  return cached;
}

/** Anon client used only to verify a user's JWT and MFA assurance level. */
export function getPublicClient() {
  const { supabaseUrl } = getEnv();
  const anonKey = process.env.SUPABASE_ANON_KEY || '';

  if (!supabaseUrl || !anonKey) {
    throw Object.assign(new Error('Supabase auth is not configured.'), {
      configuration: true,
    });
  }

  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
