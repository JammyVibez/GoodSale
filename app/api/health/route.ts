import { NextResponse } from 'next/server';
import { getEnvStatus } from '@/lib/env';

export const dynamic = 'force-dynamic';

/**
 * Liveness / readiness probe for load balancers and orchestrators.
 */
export async function GET() {
  const env = getEnvStatus();
  const healthy = env.demoMode || env.missingForProduction.length === 0;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      service: 'goodsale',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      demoMode: env.demoMode,
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
