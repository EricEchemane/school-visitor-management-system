'use client';
import { ExternalToast, toast } from 'sonner';

/**
 * One place for toast conventions. Toasts report the result of one-click actions; errors the user
 * fixes in a form stay inline next to that form. Every toast stays 6 s (the Toaster default; see
 * decisions.md D32).
 */
export const notify = {
  /** Spinner toast for an action in flight; pass its id to success/error to update it in place. */
  loading: (title: string) => toast.loading(title),
  success: (title: string, opts: ExternalToast = {}) => toast.success(title, { testId: 'notice', ...opts }),
  error: (title: string, opts: ExternalToast = {}) => toast.error(title, { testId: 'toast-error', ...opts }),
  warning: (title: string, opts: ExternalToast = {}) => toast.warning(title, { testId: 'toast-warning', ...opts }),
  info: (title: string, opts: ExternalToast = {}) => toast.info(title, { testId: 'toast-info', ...opts }),
  dismiss: (id?: string | number) => toast.dismiss(id),
};

export const message = (e: unknown) => (e as Error).message || 'Something went wrong';
