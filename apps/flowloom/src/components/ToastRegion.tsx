import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import type { ToastMessage } from '../types';

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: TriangleAlert,
  error: AlertCircle,
};

export function ToastRegion({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: string) => void }) {
  return (
    <div className="toast-region" role="region" aria-label="通知" aria-live="polite">
      {toasts.map((toast) => {
        const ToneIcon = icons[toast.tone];
        return (
          <div key={toast.id} className={`toast toast--${toast.tone}`}>
            <ToneIcon size={18} aria-hidden="true" />
            <div><strong>{toast.title}</strong>{toast.detail && <p>{toast.detail}</p>}</div>
            <button onClick={() => onDismiss(toast.id)} aria-label="关闭通知"><X size={15} /></button>
          </div>
        );
      })}
    </div>
  );
}
