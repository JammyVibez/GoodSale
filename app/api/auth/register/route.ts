import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger, publicErrorMessage } from '@/lib/logger';

/**
 * Auto-confirming registration.
 *
 * Email confirmation is disabled for now, so instead of `auth.signUp` (which
 * would require the user to click a confirmation link before a session exists)
 * we create the account with the service role and `email_confirm: true`. The
 * client then signs in with the password and lands straight in onboarding.
 *
 * The DB trigger `handle_new_user` still provisions the profile row from
 * `user_metadata`, so profiles behave exactly as before.
 */
export async function POST(req: NextRequest) {
  try {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { success: false, error: 'Supabase is not configured on the server.' },
        { status: 503 }
      );
    }

    const body = (await req.json()) as {
      email?: string;
      password?: string;
      fullName?: string;
      username?: string;
      phoneNumber?: string;
      role?: string;
      referralCodeUsed?: string;
    };

    const email = (body.email || '').trim();
    const password = body.password || '';
    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: body.fullName || '',
        username: body.username || '',
        phone_number: body.phoneNumber || '',
        role: body.role || 'BUYER',
        referral_code_used: body.referralCodeUsed || null,
      },
    });

    if (error) {
      const message = /already registered|already been registered|already exists/i.test(error.message)
        ? 'An account with that email already exists. Try signing in instead.'
        : error.message;
      return NextResponse.json({ success: false, error: message }, { status: 400 });
    }

    return NextResponse.json({ success: true, userId: data.user?.id ?? null });
  } catch (error) {
    logger.error('Registration route failed', { error: String(error) });
    return NextResponse.json(
      { success: false, error: publicErrorMessage(error, 'Registration failed') },
      { status: 500 }
    );
  }
}
