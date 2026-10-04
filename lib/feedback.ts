// lib/feedback.ts
'use client';

/**
 * App-wide, framework-light feedback channel.
 *
 * Replaces blocking browser `alert()` / `confirm()` dialogs (which Chrome
 * paints as native pop-ups) with the app's own Aurora Flow toasts and a
 * themed confirmation dialog. Callable from any component or plain helper —
 * no React context required.
 */

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  title?: string;
}

/* ------------------------------------------------------------------ *
 * Toasts
 * ------------------------------------------------------------------ */

let toastSeq = 0;
let toasts: ToastItem[] = [];
const toastListeners = new Set<(items: ToastItem[]) => void>();

function emitToasts() {
  const snapshot = [...toasts];
  toastListeners.forEach((fn) => fn(snapshot));
}

export function subscribeToasts(listener: (items: ToastItem[]) => void): () => void {
  toastListeners.add(listener);
  listener([...toasts]);
  return () => {
    toastListeners.delete(listener);
  };
}

export function dismissToast(id: number): void {
  toasts = toasts.filter((t) => t.id !== id);
  emitToasts();
}

export function showToast(
  message: string,
  kind: ToastKind = 'success',
  title?: string,
  durationMs = 4200
): number {
  if (typeof window === 'undefined') return 0;
  const id = ++toastSeq;
  toasts = [...toasts, { id, kind, message, title }].slice(-4);
  emitToasts();
  if (durationMs > 0) {
    window.setTimeout(() => dismissToast(id), durationMs);
  }
  return id;
}

export const toast = {
  success: (message: string, title?: string) => showToast(message, 'success', title),
  error: (message: string, title?: string) => showToast(message, 'error', title),
  info: (message: string, title?: string) => showToast(message, 'info', title),
};

/* ------------------------------------------------------------------ *
 * Confirm dialog (promise-based replacement for window.confirm)
 * ------------------------------------------------------------------ */

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

export interface ConfirmState extends ConfirmOptions {
  id: number;
}

let confirmSeq = 0;
let confirmState: ConfirmState | null = null;
let confirmResolver: ((value: boolean) => void) | null = null;
const confirmListeners = new Set<(state: ConfirmState | null) => void>();

function emitConfirm() {
  confirmListeners.forEach((fn) => fn(confirmState));
}

export function subscribeConfirm(listener: (state: ConfirmState | null) => void): () => void {
  confirmListeners.add(listener);
  listener(confirmState);
  return () => {
    confirmListeners.delete(listener);
  };
}

export function resolveConfirm(value: boolean): void {
  const resolver = confirmResolver;
  confirmResolver = null;
  confirmState = null;
  emitConfirm();
  if (resolver) resolver(value);
}

/** Opens a themed confirmation dialog and resolves to the user's choice. */
export function confirmDialog(options: ConfirmOptions | string): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  const opts: ConfirmOptions =
    typeof options === 'string' ? { message: options } : options;

  // A previous unresolved confirm resolves false so promises never hang.
  if (confirmResolver) {
    const prev = confirmResolver;
    confirmResolver = null;
    prev(false);
  }

  confirmState = { id: ++confirmSeq, ...opts };
  emitConfirm();
  return new Promise<boolean>((resolve) => {
    confirmResolver = resolve;
  });
}
