export interface Env {
  DB: D1Database;
  /** Comma-separated list of origins allowed to call this API. */
  ALLOWED_ORIGINS: string;
  /** One-time code a browser presents to obtain a device token. Secret. */
  BOOTSTRAP_CODE: string;
}
