type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function currentLevel(): LogLevel {
  const configured = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  if (configured && configured in LEVEL_ORDER) return configured;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[currentLevel()];
}

function emitSentry(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  const dsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn || typeof fetch === 'undefined') return;
  // Lightweight envelope-less capture via Sentry Store API is complex;
  // log a structured hook that Sentry SDK can wrap when installed.
  if (typeof globalThis !== 'undefined') {
    const g = globalThis as { __goodsaleSentry?: { captureMessage?: (m: string, ctx?: unknown) => void } };
    g.__goodsaleSentry?.captureMessage?.(message, { level, extra: meta });
  }
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...(meta || {}),
  };

  const line = JSON.stringify(entry);
  if (level === 'error') {
    console.error(line);
    emitSentry(level, message, meta);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit('debug', message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit('info', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit('warn', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit('error', message, meta),
};

/** Safe client-facing error message (never leak internals in production). */
export function publicErrorMessage(err: unknown, fallback = 'Internal Server Error'): string {
  if (process.env.NODE_ENV !== 'production' && err instanceof Error) {
    return err.message || fallback;
  }
  return fallback;
}
