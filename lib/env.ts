/**
 * Central environment helpers for GoodSale.
 * Demo mode stays available for local prototyping; production disables unsafe paths.
 */

export function isDemoMode(): boolean {
  const flag = process.env.NEXT_PUBLIC_DEMO_MODE;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

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
  demoMode: boolean;
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
  const demoMode = isDemoMode();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const supabaseConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const paystackPublicConfigured = Boolean(process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY);
  const paystackSecretConfigured = Boolean(process.env.PAYSTACK_SECRET_KEY);
  const mapsConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY);

  const missingForProduction: string[] = [];
  if (!demoMode) {
    if (!supabaseConfigured) missingForProduction.push('NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');
    if (!paystackPublicConfigured) missingForProduction.push('NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY');
    if (!paystackSecretConfigured) missingForProduction.push('PAYSTACK_SECRET_KEY');
  }

  return {
    demoMode,
    geminiConfigured,
    supabaseConfigured,
    paystackPublicConfigured,
    paystackSecretConfigured,
    mapsConfigured,
    productionReady: !demoMode && missingForProduction.length === 0,
    missingForProduction: [...new Set(missingForProduction)],
  };
}

/**
 * Fail fast when starting in production without required secrets.
 * Call from server entry points (health, payments).
 */
export function assertProductionConfig(): void {
  if (isDemoMode()) return;
  const status = getEnvStatus();
  if (status.missingForProduction.length > 0) {
    throw new Error(
      `Production config incomplete. Missing: ${status.missingForProduction.join(', ')}`
    );
  }
}
