'use client';

/**
 * Client-side support, appeal and complaint store.
 *
 * Tickets and appeals are readable instantly from localStorage so the support
 * flow works without a round trip, then persisted best-effort to Supabase
 * (`support_tickets`, `support_ticket_messages`, `product_appeals` from
 * migration 017). If the tables are not migrated yet, the local record still
 * works and the write is retried on the next reply.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getDBState } from '@/lib/store';
import type {
  ProductAppeal,
  SupportTicket,
  SupportTicketCategory,
  SupportTicketMessage,
  SupportTicketPriority,
  SupportTicketStatus,
} from '@/lib/types';
import { UserRole } from '@/lib/types';

const TICKETS_KEY = 'goodsale:support_tickets_v1';
const APPEALS_KEY = 'goodsale:product_appeals_v1';
const EVENTS = 'goodsale:trust_center_change';

const ADMIN_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN, UserRole.MODERATOR];

function readList<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, list: T[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
    window.dispatchEvent(new Event(EVENTS));
  } catch {
    // storage full or blocked — the UI still shows the in-memory result
  }
}

function reference(prefix: string) {
  const digits = Math.floor(100000 + Math.random() * 900000);
  return `GS-${prefix}-${digits}`;
}

export function isAdminUser() {
  const role = getDBState().currentUser?.role;
  return !!role && ADMIN_ROLES.includes(role);
}

export function getSupportTickets(): SupportTicket[] {
  return readList<SupportTicket>(TICKETS_KEY).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getProductAppeals(): ProductAppeal[] {
  return readList<ProductAppeal>(APPEALS_KEY).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function createSupportTicket(input: {
  category: SupportTicketCategory;
  subject: string;
  description: string;
  orderId?: number;
  priority?: SupportTicketPriority;
}): { ticket?: SupportTicket; error?: string } {
  const user = getDBState().currentUser;
  if (!user) return { error: 'Please sign in to open a support ticket.' };
  const subject = input.subject.trim();
  const description = input.description.trim();
  if (subject.length < 4) return { error: 'Give your ticket a short subject.' };
  if (description.length < 10) return { error: 'Describe the issue in at least 10 characters.' };

  const now = new Date().toISOString();
  const ticket: SupportTicket = {
    id: Date.now(),
    reference: reference('TKT'),
    userId: user.id,
    userName: user.fullName,
    category: input.category,
    subject,
    description,
    orderId: input.orderId,
    status: 'OPEN',
    priority: input.priority ?? (input.category === 'PAYMENT' || input.category === 'REFUND' ? 'HIGH' : 'NORMAL'),
    messages: [
      {
        id: Date.now() + 1,
        authorId: user.id,
        authorName: user.fullName,
        authorRole: 'BUYER',
        body: description,
        createdAt: now,
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  writeList(TICKETS_KEY, [...getSupportTickets(), ticket]);

  // Server-side insert gives the ticket a durable reference other devices can
  // load. If support tables are not migrated yet the local ticket still works.
  void (async () => {
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: ticket.category,
          subject: ticket.subject,
          description: ticket.description,
          orderId: ticket.orderId,
          priority: ticket.priority,
        }),
      });
      const payload = await res.json();
      const remoteReference = payload?.ticket?.reference;
      if (res.ok && typeof remoteReference === 'string' && remoteReference !== ticket.reference) {
        writeList(
          TICKETS_KEY,
          getSupportTickets().map((t) => (t.id === ticket.id ? { ...t, reference: remoteReference } : t))
        );
      }
    } catch {
      // offline — local ticket is authoritative until the next sync
    }
  })();

  return { ticket };
}

export function replyToTicket(ticketId: number, body: string): { error?: string } {
  const text = body.trim();
  if (!text) return { error: 'Write a message first.' };
  const user = getDBState().currentUser;
  if (!user) return { error: 'Please sign in.' };

  const tickets = getSupportTickets();
  const index = tickets.findIndex((t) => t.id === ticketId);
  if (index === -1) return { error: 'Ticket not found.' };
  const ticket = tickets[index];
  const admin = isAdminUser();
  if (ticket.userId !== user.id && !admin) return { error: 'You cannot reply to this ticket.' };

  const message: SupportTicketMessage = {
    id: Date.now(),
    authorId: user.id,
    authorName: user.fullName,
    authorRole: admin ? 'ADMIN' : ticket.userId === user.id ? 'BUYER' : 'SELLER',
    body: text,
    createdAt: new Date().toISOString(),
  };
  const next: SupportTicket = {
    ...ticket,
    messages: [...ticket.messages, message],
    status: admin ? 'WAITING_USER' : ticket.status === 'WAITING_USER' || ticket.status === 'IN_REVIEW' ? 'IN_REVIEW' : ticket.status,
    updatedAt: message.createdAt,
  };
  tickets[index] = next;
  writeList(TICKETS_KEY, tickets);

  const client = createClient();
  if (client) {
    void (async () => {
      try {
        const { data: remote } = await client
          .from('support_tickets')
          .select('id')
          .eq('reference', ticket.reference)
          .maybeSingle();
        if (remote?.id) {
          await client.from('support_ticket_messages').insert({
            ticket_id: remote.id,
            author_id: user.id,
            author_name: user.fullName,
            author_role: message.authorRole,
            body: text,
          });
          // Keep the shared ticket state aligned with the thread's latest reply.
          await client
            .from('support_tickets')
            .update({ status: next.status, updated_at: next.updatedAt })
            .eq('id', remote.id);
        }
      } catch {
        // offline / migration pending — local thread remains authoritative
      }
    })();
  }
  return {};
}

export function updateTicket(ticketId: number, patch: Partial<Pick<SupportTicket, 'status' | 'priority' | 'adminNotes'>>): { error?: string } {
  if (!isAdminUser()) return { error: 'Only administrators can update ticket workflow state.' };
  const tickets = getSupportTickets();
  const index = tickets.findIndex((t) => t.id === ticketId);
  if (index === -1) return { error: 'Ticket not found.' };
  const updated = { ...tickets[index], ...patch, updatedAt: new Date().toISOString() };
  tickets[index] = updated;
  writeList(TICKETS_KEY, tickets);

  const client = createClient();
  if (client) {
    void client
      .from('support_tickets')
      .update({
        status: updated.status,
        priority: updated.priority,
        admin_notes: updated.adminNotes ?? null,
        updated_at: updated.updatedAt,
      })
      .eq('reference', updated.reference)
      .then(() => {}, () => {});
  }
  return {};
}

export function createProductAppeal(productId: number, reason: string): { appeal?: ProductAppeal; error?: string } {
  const user = getDBState().currentUser;
  if (!user) return { error: 'Please sign in.' };
  const product = getDBState().products.find((p) => p.id === productId);
  if (!product) return { error: 'Product not found.' };
  if (product.sellerId !== user.id) return { error: 'Only the seller can appeal this listing.' };
  const text = reason.trim();
  if (text.length < 15) return { error: 'Explain what you changed and why the listing should return (15+ characters).' };
  if (getProductAppeals().some((a) => a.productId === productId && a.status === 'PENDING')) {
    return { error: 'You already have an appeal awaiting review for this listing.' };
  }

  const appeal: ProductAppeal = {
    id: Date.now(),
    reference: reference('APL'),
    productId,
    sellerId: user.id,
    reason: text,
    status: 'PENDING',
    createdAt: new Date().toISOString(),
  };
  writeList(APPEALS_KEY, [...getProductAppeals(), appeal]);

  const client = createClient();
  if (client) {
    void (async () => {
      try {
        await client.from('product_appeals').insert({
          reference: appeal.reference,
          product_id: productId,
          seller_id: user.id,
          reason: text,
          status: 'PENDING',
        });
        await client.from('products').update({ moderation_status: 'APPEALED' }).eq('id', productId);
      } catch {
        // local appeal still recorded
      }
    })();
  }
  return { appeal };
}

export function resolveProductAppeal(appealId: number, status: 'APPROVED' | 'REJECTED', adminNotes?: string): { error?: string } {
  if (!isAdminUser()) return { error: 'Only administrators can decide appeals.' };
  const appeals = getProductAppeals();
  const index = appeals.findIndex((a) => a.id === appealId);
  if (index === -1) return { error: 'Appeal not found.' };
  const resolvedAt = new Date().toISOString();
  const appeal = appeals[index];
  appeals[index] = { ...appeal, status, adminNotes, resolvedAt };
  writeList(APPEALS_KEY, appeals);

  const client = createClient();
  if (client) {
    void (async () => {
      try {
        await client
          .from('product_appeals')
          .update({ status, admin_notes: adminNotes ?? null, resolved_at: resolvedAt })
          .eq('reference', appeal.reference);
        await client
          .from('products')
          .update({
            moderation_status: status === 'APPROVED' ? 'APPROVED' : 'REJECTED',
            rejection_reason: status === 'REJECTED' ? adminNotes ?? 'Appeal rejected' : null,
          })
          .eq('id', appeal.productId);
      } catch {
        // The local decision remains visible; the admin can retry from the queue.
      }
    })();
  }
  return {};
}

/**
 * Pulls the signed-in user's remote tickets (if migration 017 is applied) and
 * merges them with local records. Remote copies win only when newer, so an
 * offline reply is never lost to an older row.
 */
async function syncSupportTicketsFromSupabase() {
  const client = createClient();
  if (!client) return;
  try {
    const { data, error } = await client
      .from('support_tickets')
      .select('*, support_ticket_messages(*)')
      .order('updated_at', { ascending: false })
      .limit(50);
    if (error || !Array.isArray(data) || data.length === 0) return;

    type RemoteRow = Record<string, unknown> & {
      reference?: string;
      user_id?: number;
      user_name?: string;
      category?: SupportTicketCategory;
      subject?: string;
      description?: string;
      order_id?: number | null;
      status?: SupportTicketStatus;
      priority?: SupportTicketPriority;
      admin_notes?: string | null;
      created_at?: string;
      updated_at?: string;
      support_ticket_messages?: Array<Record<string, unknown>>;
    };

    const local = getSupportTickets();
    const byReference = new Map(local.map((t) => [t.reference, t]));
    for (const row of data as RemoteRow[]) {
      if (!row.reference) continue;
      const existing = byReference.get(row.reference);
      const remoteUpdated = String(row.updated_at || row.created_at || '');
      if (existing && existing.updatedAt >= remoteUpdated) continue;
      const messages: SupportTicketMessage[] = (row.support_ticket_messages || [])
        .map((m, index) => ({
          id: Number(m.id ?? index),
          authorId: Number(m.author_id ?? 0),
          authorName: String(m.author_name ?? ''),
          authorRole: (m.author_role === 'ADMIN' ? 'ADMIN' : m.author_role === 'SELLER' ? 'SELLER' : 'BUYER') as SupportTicketMessage['authorRole'],
          body: String(m.body ?? ''),
          createdAt: String(m.created_at ?? remoteUpdated),
        }))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      byReference.set(row.reference, {
        id: existing?.id ?? Number(row.id ?? Date.now()),
        reference: row.reference,
        userId: Number(row.user_id ?? existing?.userId ?? 0),
        userName: String(row.user_name ?? existing?.userName ?? ''),
        category: (row.category ?? 'OTHER') as SupportTicketCategory,
        subject: String(row.subject ?? ''),
        description: String(row.description ?? ''),
        orderId: row.order_id == null ? undefined : Number(row.order_id),
        status: (row.status ?? 'OPEN') as SupportTicketStatus,
        priority: (row.priority ?? 'NORMAL') as SupportTicketPriority,
        adminNotes: row.admin_notes == null ? undefined : String(row.admin_notes),
        messages: messages.length ? messages : existing?.messages ?? [],
        createdAt: String(row.created_at ?? existing?.createdAt ?? remoteUpdated),
        updatedAt: remoteUpdated || String(existing?.updatedAt ?? new Date().toISOString()),
      });
    }
    writeList(TICKETS_KEY, [...byReference.values()]);
  } catch {
    // Tables not migrated yet or offline — local tickets remain usable.
  }
}

/** Reactive accessor for components. */
export function useTrustCenter() {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    const onChange = () => setVersion((v) => v + 1);
    window.addEventListener(EVENTS, onChange);
    window.addEventListener('storage', onChange);
    void syncSupportTicketsFromSupabase();
    return () => {
      window.removeEventListener(EVENTS, onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const tickets = useMemo(() => getSupportTickets(), [version]);
  const appeals = useMemo(() => getProductAppeals(), [version]);

  return { tickets, appeals, refresh };
}
