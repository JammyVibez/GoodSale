import { NextResponse } from 'next/server';
import { getEnvStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Liveness / readiness probe for load balancers and orchestrators.
 */
export async function GET() {
  const env = getEnvStatus();
  // The service is live as soon as the database is reachable; payment/map keys
  // are reported separately so a missing Paystack key does not fail liveness.
  const healthy = env.supabaseConfigured;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'goodsale',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      integrations: {
        gemini: env.geminiConfigured,
        supabase: env.supabaseConfigured,
        paystackPublic: env.paystackPublicConfigured,
        paystackSecret: env.paystackSecretConfigured,
        maps: env.mapsConfigured,
      },
      productionReady: env.productionReady,
      missingForProduction: env.missingForProduction,
    },
    { status: healthy ? 200 : 503 }
  );
}
