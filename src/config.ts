/**
 * Build-time configuration (Vite env). Only public values belong here:
 * never put a Supabase service-role key or any secret in VITE_* variables.
 */
type Env = Partial<Record<string, string>>;

function readEnv(): Env {
  try {
    return ((import.meta as unknown as { env?: Env }).env ?? {}) as Env;
  } catch {
    return {};
  }
}

export const ENV: Env = readEnv();

export const APP_VERSION = '0.1.0';

/** 'local' is the only backend implemented today. 'supabase' is planned (docs/SUPABASE.md). */
export const DATA_BACKEND = ENV.VITE_DATA_BACKEND === 'supabase' ? 'supabase' : 'local';
