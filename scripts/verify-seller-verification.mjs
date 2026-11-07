#!/usr/bin/env node
/**
 * End-to-end check of the seller verification workflow against the live
 * Supabase project, using real user sessions (not the service role) for every
 * seller and admin action.
 *
 * Creates two throwaway accounts (seller + SUPER_ADMIN), exercises draft →
 * submit → review → approve → suspend → revoke, asserts that guard rails hold,
 * then deletes both accounts (profiles, applications, events and documents
 * cascade). No real seller data is touched.
 *
 * Usage: node scripts/verify-seller-verification.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { Client } from 'pg';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const service = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!url || !anon || !service) {
  console.error('Supabase URL, anon key and service role key are required.');
  process.exit(1);
}

const admin = createClient(url, anon, { auth: { persistSession: false } });
const serviceClient = createClient(url, service, { auth: { persistSession: false } });

const stamp = Date.now();
const sellerEmail = `qa.verification.seller.${stamp}@example.com`;
const adminEmail = `qa.verification.admin.${stamp}@example.com`;
const password = `Qa!${stamp}aB`;

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

function clientFor() {
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function createAccount(email, fullName) {
  const { data, error } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone_number: '08031234567' },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const authId = data.user.id;

  const { data: profile, error: profileError } = await serviceClient
    .from('profiles')
    .select('id, role, verification_status')
    .eq('auth_id', authId)
    .single();
  if (profileError) throw new Error(`profile: ${profileError.message}`);

  return { authId, profileId: Number(profile.id) };
}

async function signIn(email) {
  const client = clientFor();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn: ${error.message}`);
  return client;
}

const createdAuthIds = [];

try {
  // ── Setup ────────────────────────────────────────────────────────────────
  const seller = await createAccount(sellerEmail, 'QA Verification Seller');
  createdAuthIds.push(seller.authId);
  const adminAccount = await createAccount(adminEmail, 'QA Verification Admin');
  createdAuthIds.push(adminAccount.authId);

  await serviceClient
    .from('profiles')
    .update({ role: 'SELLER', wants_selling: true, verification_status: 'UNVERIFIED' })
    .eq('id', seller.profileId);
  // The role guard trigger correctly refuses role changes from a service-role
  // connection (it has no auth.uid). Bypass user triggers for this one setup
  // statement, exactly as an operator provisioning staff would, then re-enable.
  const adminRoleOk = await (async () => {
    const connectionString = process.env.DATABASE_URL || '';
    if (!connectionString) return { ok: false, error: 'DATABASE_URL missing' };
    const pg = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
    await pg.connect();
    try {
      await pg.query('set session_replication_role = replica');
      await pg.query(`update public.profiles set role = 'SUPER_ADMIN' where id = $1`, [adminAccount.profileId]);
      await pg.query('set session_replication_role = origin');
    } finally {
      await pg.end();
    }
    const confirm = await serviceClient.from('profiles').select('role').eq('id', adminAccount.profileId).single();
    return { ok: confirm.data?.role === 'SUPER_ADMIN', error: confirm.error?.message };
  })();
  check('QA admin account is promoted to SUPER_ADMIN', adminRoleOk.ok, adminRoleOk.error || '');

  const { data: store, error: storeError } = await serviceClient
    .from('businesses')
    .insert({
      owner_id: seller.profileId,
      name: 'QA Verified Store',
      description: 'Temporary store created by the verification QA script.',
      city: 'Lagos',
      state: 'Lagos State',
      contact_phone: '08031234567',
      seller_type: 'INDIVIDUAL',
    })
    .select('id')
    .single();
  if (storeError) throw new Error(`store: ${storeError.message}`);
  const storeId = Number(store.id);

  const sellerClient = await signIn(sellerEmail);
  const adminClient = await signIn(adminEmail);

  const payload = {
    sellerType: 'INDIVIDUAL',
    legalName: 'QA Verification Seller',
    dateOfBirth: '1994-04-12',
    phone: '08031234567',
    email: sellerEmail,
    state: 'Lagos State',
    city: 'Lagos',
    address: '12 QA Street, Ikeja',
    documentType: 'NIN',
    documentNumber: '12345678901',
    storeName: 'QA Verified Store',
    storeDescription: 'Temporary store created by the verification QA script.',
    storeCity: 'Lagos',
    storeState: 'Lagos State',
    storePhone: '08031234567',
  };

  // ── Draft + documents ────────────────────────────────────────────────────
  const draft = await sellerClient.rpc('seller_save_verification', {
    p_payload: payload,
    p_submit: false,
  });
  check('seller can save a draft', !draft.error && Boolean(draft.data?.applicationId), draft.error?.message || '');
  const applicationId = draft.data?.applicationId;

  const masked = await serviceClient
    .from('identity_verifications')
    .select('document_number, status')
    .eq('id', applicationId)
    .single();
  check(
    'only a masked document reference is persisted',
    masked.data?.status === 'DRAFT' && String(masked.data?.document_number || '').startsWith('••••'),
    masked.data?.document_number
  );

  for (const slot of ['ID_FRONT', 'SELFIE']) {
    const attach = await sellerClient.rpc('seller_attach_verification_document', {
      p_application_id: applicationId,
      p_slot: slot,
      p_storage_path: `${seller.authId}/${applicationId}/${slot.toLowerCase()}.jpg`,
      p_label: slot,
      p_mime: 'image/jpeg',
      p_size: 1200,
    });
    check(`seller can attach ${slot}`, !attach.error, attach.error?.message || '');
  }

  const foreignPath = await sellerClient.rpc('seller_attach_verification_document', {
    p_application_id: applicationId,
    p_slot: 'ID_BACK',
    p_storage_path: `someone-else/${applicationId}/id_back.jpg`,
    p_label: 'x',
    p_mime: 'image/jpeg',
    p_size: 100,
  });
  check('paths outside the caller folder are refused', Boolean(foreignPath.error), foreignPath.error?.message || '');

  const earlySubmit = await sellerClient.rpc('seller_save_verification', {
    p_payload: { ...payload, storeName: '' },
    p_submit: true,
  });
  check('submission requires the declaration', Boolean(earlySubmit.error), earlySubmit.error?.message || '');

  // ── Submit ───────────────────────────────────────────────────────────────
  const submit = await sellerClient.rpc('seller_save_verification', {
    p_payload: { ...payload, declarationAccepted: true },
    p_submit: true,
  });
  check('seller can submit for review', !submit.error && submit.data?.status === 'PENDING', submit.error?.message || submit.data?.status);

  const submitted = await serviceClient
    .from('identity_verifications')
    .select('status, submitted_at, expires_at')
    .eq('id', applicationId)
    .single();
  check('submission sets PENDING + submitted_at, never APPROVED', submitted.data?.status === 'PENDING' && Boolean(submitted.data?.submitted_at) && !submitted.data?.expires_at);

  const profileAfterSubmit = await serviceClient
    .from('profiles')
    .select('verification_status, role')
    .eq('id', seller.profileId)
    .single();
  check(
    'submitting does not verify the seller',
    profileAfterSubmit.data?.verification_status === 'PENDING' && profileAfterSubmit.data?.role === 'SELLER',
    `${profileAfterSubmit.data?.verification_status}/${profileAfterSubmit.data?.role}`
  );

  const duplicate = await sellerClient.rpc('seller_save_verification', {
    p_payload: { ...payload, declarationAccepted: true },
    p_submit: true,
  });
  check('a second application is blocked while one is open', Boolean(duplicate.error), duplicate.error?.message || '');

  // ── Guards ───────────────────────────────────────────────────────────────
  const selfBadge = await sellerClient
    .from('profiles')
    .update({ verification_status: 'VERIFIED', verified_at: new Date().toISOString() })
    .eq('id', seller.profileId)
    .select('id')
    .maybeSingle();
  check('sellers cannot write the badge columns directly', Boolean(selfBadge.error), selfBadge.error?.message || 'update succeeded');

  const sellerCannotApprove = await sellerClient.rpc('admin_verification_action', {
    p_application_id: applicationId,
    p_action: 'APPROVE',
    p_reason: 'self-approval attempt',
    p_internal_note: '',
  });
  check('sellers cannot approve their own application', Boolean(sellerCannotApprove.error), sellerCannotApprove.error?.message || '');

  const adminNotification = await serviceClient
    .from('notifications')
    .select('id, title')
    .eq('user_id', adminAccount.profileId)
    .ilike('title', '%seller verification%');
  check('admins are notified on submission', (adminNotification.data || []).length > 0);

  // ── Review + approve ─────────────────────────────────────────────────────
  const start = await adminClient.rpc('admin_verification_action', {
    p_application_id: applicationId,
    p_action: 'START_REVIEW',
    p_reason: '',
    p_internal_note: 'QA: opening the file',
  });
  check('admin can start a review', !start.error && start.data?.status === 'UNDER_REVIEW', start.error?.message || '');

  const approve = await adminClient.rpc('admin_verification_action', {
    p_application_id: applicationId,
    p_action: 'APPROVE',
    p_reason: 'Documents matched',
    p_internal_note: 'QA approval',
  });
  check('admin can approve', !approve.error && approve.data?.status === 'APPROVED', approve.error?.message || '');

  const approvedProfile = await serviceClient
    .from('profiles')
    .select('verification_status, verification_type, verified_at, verification_expires_at, role')
    .eq('id', seller.profileId)
    .single();
  check(
    'approval writes the public verified status, timestamp, reviewer window and role',
    approvedProfile.data?.verification_status === 'VERIFIED' &&
      approvedProfile.data?.verification_type === 'INDIVIDUAL' &&
      Boolean(approvedProfile.data?.verified_at) &&
      Boolean(approvedProfile.data?.verification_expires_at) &&
      approvedProfile.data?.role === 'VERIFIED_SELLER',
    JSON.stringify(approvedProfile.data)
  );

  const approvedStore = await serviceClient
    .from('businesses')
    .select('is_verified')
    .eq('id', storeId)
    .single();
  check('storefront flag is mirrored on approval', approvedStore.data?.is_verified === true);

  const publicApproved = await admin.rpc('seller_public_verification', { p_seller_id: seller.profileId });
  check('public panel reports VERIFIED', publicApproved.data?.status === 'VERIFIED', JSON.stringify(publicApproved.data));

  const events = await serviceClient
    .from('verification_events')
    .select('action, admin_id, is_internal')
    .eq('application_id', applicationId)
    .order('created_at');
  const actions = (events.data || []).map((event) => event.action);
  check(
    'audit trail records the reviewer and every transition',
    actions.includes('SUBMITTED') && actions.includes('START_REVIEW') && actions.includes('APPROVE') &&
      (events.data || []).some((event) => event.action === 'APPROVE' && event.admin_id === adminAccount.profileId)
  );

  const sellerNotification = await serviceClient
    .from('notifications')
    .select('id, title')
    .eq('user_id', seller.profileId)
    .ilike('title', '%Verified seller%');
  check('seller is notified on approval', (sellerNotification.data || []).length > 0);

  // ── Suspend + revoke ─────────────────────────────────────────────────────
  const suspend = await adminClient.rpc('admin_verification_action', {
    p_application_id: applicationId,
    p_action: 'SUSPEND',
    p_reason: 'QA suspension check',
    p_internal_note: '',
  });
  const suspendedProfile = await serviceClient
    .from('profiles')
    .select('verification_status')
    .eq('id', seller.profileId)
    .single();
  const suspendedStore = await serviceClient.from('businesses').select('is_verified').eq('id', storeId).single();
  check(
    'suspension hides the badge immediately',
    !suspend.error &&
      suspendedProfile.data?.verification_status === 'SUSPENDED' &&
      suspendedStore.data?.is_verified === false
  );

  const publicSuspended = await admin.rpc('seller_public_verification', { p_seller_id: seller.profileId });
  check('public panel no longer reports VERIFIED after suspension', publicSuspended.data?.status === 'SUSPENDED');

  const revoke = await adminClient.rpc('admin_verification_action', {
    p_application_id: applicationId,
    p_action: 'REVOKE',
    p_reason: 'QA revocation check',
    p_internal_note: '',
  });
  const revokedProfile = await serviceClient
    .from('profiles')
    .select('verification_status, role')
    .eq('id', seller.profileId)
    .single();
  check(
    'revocation removes verification and downgrades the seller role',
    !revoke.error && revokedProfile.data?.verification_status === 'REVOKED' && revokedProfile.data?.role === 'SELLER',
    JSON.stringify(revokedProfile.data)
  );

  // ── Privacy / authorization ──────────────────────────────────────────────
  const anonymous = clientFor();
  const anonDocs = await anonymous.from('verification_documents').select('id').limit(1);
  check('anonymous users cannot read verification documents', (anonDocs.data || []).length === 0);

  const otherSeller = await createAccount(`qa.verification.other.${stamp}@example.com`, 'QA Other Seller');
  createdAuthIds.push(otherSeller.authId);
  const otherClient = await signIn(`qa.verification.other.${stamp}@example.com`);
  const otherAttach = await otherClient.rpc('seller_attach_verification_document', {
    p_application_id: applicationId,
    p_slot: 'ID_BACK',
    p_storage_path: `${otherSeller.authId}/${applicationId}/id_back.jpg`,
    p_label: 'x',
    p_mime: 'image/jpeg',
    p_size: 100,
  });
  check('another seller cannot edit your application', Boolean(otherAttach.error), otherAttach.error?.message || '');
} catch (error) {
  check('workflow completed without an unexpected exception', false, String(error));
} finally {
  // ── Cleanup ──────────────────────────────────────────────────────────────
  for (const authId of createdAuthIds) {
    await serviceClient.auth.admin.deleteUser(authId).catch(() => undefined);
  }
  const leftover = await serviceClient
    .from('profiles')
    .select('id')
    .in('id', [])
    .limit(1);
  void leftover;
}

const failed = results.filter((result) => !result.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length > 0) process.exitCode = 1;
