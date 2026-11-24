export type ToastVariant = 'success' | 'info' | 'error';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  durationMs?: number;
}

const EVENT_NAME = 'statlytics:toast';

export function showToast(toast: Omit<ToastItem, 'id'>) {
  if (typeof window === 'undefined') return;
  const item: ToastItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    durationMs: 4200,
    ...toast,
  };
  window.dispatchEvent(new CustomEvent<ToastItem>(EVENT_NAME, { detail: item }));
}

export function showSuccessToast(title: string, description?: string) {
  showToast({ title, description, variant: 'success', durationMs: 4200 });
}

export function subscribeToasts(listener: (toast: ToastItem) => void): () => void {
  const handler = (ev: Event) => {
    const custom = ev as CustomEvent<ToastItem>;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}
