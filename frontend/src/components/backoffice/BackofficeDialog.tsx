import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A native modal for one write on one row (change a plan, reject a request), like the plan
 * cancel confirm on Suscripción: the browser keeps focus inside, closes it on Esc and gives focus
 * back to the button that opened it. Its content mounts only while open, so every opening
 * starts from a clean form.
 */
export function BackofficeDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog ref={ref} className="bo-dialog" aria-labelledby={titleId} onClose={onClose}>
      {/* The look lives on this box: a display rule on <dialog> itself would show it closed. */}
      <div className="bo-dialog-box">
        <h2 id={titleId} className="bo-dialog-title">
          {title}
        </h2>
        {open ? children : null}
      </div>
    </dialog>
  );
}
