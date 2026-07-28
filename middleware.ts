import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Edge middleware: request ID + basic API method guards.
 * Auth session enforcement belongs here once Supabase Auth is wired.
 */
export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  response.headers.set('x-request-id', requestId);

  // Block unexpected methods on API routes early
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const method = request.method.toUpperCase();
    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'].includes(method)) {
      return NextResponse.json({ success: false, error: 'Method not allowed' }, { status: 405 });
    }
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|uploads/).*)'],
};
