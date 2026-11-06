/**
 * Central environment helpers for GoodSale.
 * The app always runs against the real Supabase / Paystack / Maps backends —
 * there is no demo mode.
 */

export function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getOptionalEnv(name: string, fallback = ''): string {
  return process.env[name] || fallback;
}

export type EnvStatus = {
  geminiConfigured: boolean;
  supabaseConfigured: boolean;
  paystackPublicConfigured: boolean;
  paystackSecretConfigured: boolean;
  mapsConfigured: boolean;
  productionReady: boolean;
  missingForProduction: string[];
};

/**
 * Reports which integrations are configured. Used by /api/health and startup checks.
 */
export function getEnvStatus(): EnvStatus {
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const paystackPublicConfigured = Boolean(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY);
  const paystackSecretConfigured = Boolean(process.env.PAYSTACK_SECRET_KEY);
  const mapsConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  const missingForProduction: string[] = [];
  if (!supabaseConfigured) missingForProduction.push('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!paystackPublicConfigured) missingForProduction.push('NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY');
  if (!paystackSecretConfigured) missingForProduction.push('PAYSTACK_SECRET_KEY');

  return {
    geminiConfigured,
    supabaseConfigured,
    paystackPublicConfigured,
    paystackSecretConfigured,
    mapsConfigured,
    productionReady: missingForProduction.length === 0,
    missingForProduction: [...new Set(missingForProduction)],
  };
}

/**
 * Fail fast when starting without required secrets.
 * Call from server entry points (health, payments).
 */
export function assertProductionConfig(): void {
  const status = getEnvStatus();
  if (status.missingForProduction.length > 0) {
    throw new Error(
      `Config incomplete. Missing: ${status.missingForProduction.join(', ')}`
    );
  }
}
