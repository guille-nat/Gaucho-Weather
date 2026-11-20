import { useEffect, useId, useRef, type ReactNode } from 'react';

/**
 * A native modal dialog, like BackofficeDialog and the plan cancel confirm on Suscripción: the
 * browser keeps focus inside, makes the page behind it inert and gives focus back on close. Its
 * content mounts only while open, so every opening starts from a clean form, and a control marked
 * `data-autofocus` gets the focus once it is open (modern-web-guidance `dialog`).
 *
 * `blocking` is for a choice the page cannot go on without (the updated terms, promociones S0c):
 * Esc does nothing, and if the browser closes it anyway it opens again.
 */
export function Modal({
  open,
  title,
  onClose,
  blocking = false,
  children,
}: {
  open: boolean;
  title: string;
  onClose?: () => void;
  blocking?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function closed() {
    const dialog = ref.current;
    if (blocking && open && dialog && !dialog.open) {
      dialog.showModal();
      return;
    }
    onClose?.();
  }

  return (
    <dialog
      ref={ref}
      className="app-dialog"
      aria-labelledby={titleId}
      onCancel={blocking ? (event) => event.preventDefault() : undefined}
      onClose={closed}
    >
      {/* The look lives on this box: a display rule on <dialog> itself would show it closed. */}
      <div className="app-dialog-box">
        <h2 id={titleId} className="app-dialog-title">
          {title}
        </h2>
        {open ? children : null}
      </div>
    </dialog>
  );
}
