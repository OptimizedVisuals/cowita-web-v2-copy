/**
 * CoWiTa site configuration.
 *
 * API_BASE is the root of the CoWiTa form API. The form handler posts to
 * <API_BASE>/<form-type>, e.g. POST /api/forms/talent. See /api/README.md
 * for the endpoint contract.
 *
 * TURNSTILE_SITE_KEY is the PUBLIC Cloudflare Turnstile key. It is safe to
 * ship to the browser; the matching secret key lives only in the server
 * environment (TURNSTILE_SECRET_KEY). Leave it empty to skip the challenge
 * (for example before the key is issued).
 *
 * Nothing else — no database, email or API secrets — belongs in this file.
 */
window.COWITA_CONFIG = {
  /** Root of the CoWiTa form API. */
  API_BASE: '/api/forms',

  /**
   * Public Cloudflare Turnstile site key.
   *
   * Required in production — set this before launch, or every submission will
   * be rejected because the server cannot verify the challenge.
   *
   * Cloudflare's always-pass test key (1x00000000000000000000AA) plus the
   * matching test secret work locally; never use them in production.
   */
  TURNSTILE_SITE_KEY: '',
};
