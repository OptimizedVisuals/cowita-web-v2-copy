/**
 * CoWiTa API — rate limiting.
 *
 * Fixed-window counters stored in Postgres (public.rate_limits). Each bucket
 * key is a short hash so no raw IP or email is ever written to the table.
 *
 * Windows are intentionally coarse: they stop scripted abuse without getting
 * in the way of a real person fixing a typo in a long form.
 */

import { LIMITS } from './config.mjs';
import { getServiceClient } from './supabase.mjs';

function windowStart(date = new Date()) {
  const seconds = LIMITS.windowSeconds;
  const ms = Math.floor(date.getTime() / (seconds * 1000)) * seconds * 1000;
  return new Date(ms).toISOString();
}

/**
 * Consume one unit from each bucket.
 *
 * @param {{ bucket: string, limit: number }[]} buckets
 * @returns {Promise<{limited: boolean, retryAfterSeconds: number}>}
 */
export async function consume(buckets) {
  const supabase = getServiceClient();
  const start = windowStart();
  let limited = false;

  for (const { bucket, limit } of buckets) {
    if (!bucket) continue;

    const { data, error } = await supabase.rpc('bump_rate_limit', {
      p_bucket: bucket,
      p_window_start: start,
    });

    if (error) {
      // Fail open on infrastructure error, but log loudly: rate limiting is
      // defence in depth, not the only control.
      console.error('rate limit check failed:', error.message);
      continue;
    }

    if (typeof data === 'number' && data > limit) {
      limited = true;
    }
  }

  return {
    limited,
    retryAfterSeconds: LIMITS.windowSeconds,
  };
}
