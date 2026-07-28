import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { isDemoMode, getEnvStatus } from '@/lib/env';
import { logger, publicErrorMessage } from '@/lib/logger';
import { rateLimit, clientIpFromRequest } from '@/lib/rate-limit';

const DB_FILE_PATH = path.join(process.cwd(), 'goodsale_persistent_db.json');
const MAX_STATE_BYTES = 2 * 1024 * 1024; // 2 MB hard cap

let inMemoryDB: unknown = null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase =
  supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null;

function denyProductionSync() {
  return NextResponse.json(
    {
      success: false,
      error:
        'Full-state database sync is disabled outside demo mode. Use authenticated domain APIs with row-level security.',
    },
    { status: 403 }
  );
}

export async function GET(req: NextRequest) {
  const ip = clientIpFromRequest(req);
  const limited = rateLimit(`db:get:${ip}`, 60, 60_000);
  if (!limited.allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) } }
    );
  }

  // In production, do not expose the shared marketplace blob
  if (!isDemoMode()) {
    return denyProductionSync();
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('market_state')
        .select('state')
        .eq('id', 1)
        .single();

      if (!error && data?.state) {
        return NextResponse.json({ success: true, state: data.state, source: 'supabase-db' });
      }

      const { data: fileData, error: fileError } = await supabase.storage
        .from('goodsale-data')
        .download('database.json');

      if (!fileError && fileData) {
        const text = await fileData.text();
        const state = JSON.parse(text);
        return NextResponse.json({ success: true, state, source: 'supabase-storage' });
      }
    } catch (supabaseError) {
      logger.warn('Supabase query failed, falling back to local storage', {
        error: String(supabaseError),
      });
    }
  }

  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const data = await fs.promises.readFile(DB_FILE_PATH, 'utf-8');
      const state = JSON.parse(data);
      return NextResponse.json({ success: true, state, source: 'local-file' });
    }
  } catch (error) {
    logger.error('Error reading persistent database file', { error: String(error) });
  }

  if (inMemoryDB) {
    return NextResponse.json({ success: true, state: inMemoryDB, source: 'memory' });
  }

  return NextResponse.json({ success: false, message: 'No persistent data found' });
}

export async function POST(req: NextRequest) {
  try {
    if (!isDemoMode()) {
      return denyProductionSync();
    }

    const ip = clientIpFromRequest(req);
    const limited = rateLimit(`db:post:${ip}`, 30, 60_000);
    if (!limited.allowed) {
      return NextResponse.json(
        { success: false, error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(Math.ceil(limited.retryAfterMs / 1000)) } }
      );
    }

    const contentLength = Number(req.headers.get('content-length') || 0);
    if (contentLength > MAX_STATE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'Payload too large' },
        { status: 413 }
      );
    }

    const body = await req.json();
    const { state } = body;
    if (!state || typeof state !== 'object') {
      return NextResponse.json({ success: false, error: 'State is required' }, { status: 400 });
    }

    const serialized = JSON.stringify(state);
    if (serialized.length > MAX_STATE_BYTES) {
      return NextResponse.json(
        { success: false, error: 'State payload exceeds size limit' },
        { status: 413 }
      );
    }

    inMemoryDB = state;

    let supabasePersistedDb = false;
    let supabasePersistedStorage = false;

    if (supabase) {
      try {
        const { error: dbError } = await supabase
          .from('market_state')
          .upsert({ id: 1, state, updated_at: new Date().toISOString() });

        if (!dbError) {
          supabasePersistedDb = true;
        } else {
          logger.debug('Supabase db upsert skipped', { message: dbError.message });
        }

        const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
        const { error: storageError } = await supabase.storage
          .from('goodsale-data')
          .upload('database.json', blob, { upsert: true });

        if (!storageError) {
          supabasePersistedStorage = true;
        } else {
          logger.debug('Supabase storage upload skipped', { message: storageError.message });
        }
      } catch (err) {
        logger.warn('Failed to synchronize with Supabase services', { error: String(err) });
      }
    }

    try {
      await fs.promises.writeFile(DB_FILE_PATH, JSON.stringify(state), 'utf-8');
      return NextResponse.json({
        success: true,
        persisted: supabase ? 'supabase-and-file' : 'file',
        supabaseDb: supabasePersistedDb,
        supabaseStorage: supabasePersistedStorage,
        env: getEnvStatus().demoMode ? 'demo' : 'production',
      });
    } catch (fsError) {
      logger.warn('Could not write to local filesystem, falling back to memory', {
        error: String(fsError),
      });
      return NextResponse.json({
        success: true,
        persisted: 'memory',
        supabaseDb: supabasePersistedDb,
        supabaseStorage: supabasePersistedStorage,
      });
    }
  } catch (error) {
    logger.error('Error writing to database', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error) },
      { status: 500 }
    );
  }
}
