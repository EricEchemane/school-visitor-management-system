'use client';
import { useEffect, useId, useRef } from 'react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Modal confirmation built on the native <dialog>: focus is trapped and Esc cancels. */
export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      data-testid="confirm-dialog"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p>{message}</p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} data-testid="confirm-cancel">
          Cancel
        </button>
        <button type="button" className="primary" autoFocus onClick={onConfirm} data-testid="confirm-yes">
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
