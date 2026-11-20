import { screen, within } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';

/** The summary before Mercado Pago (promociones S0d): tick the terms and go. */
export async function confirmCheckout(user: UserEvent) {
  const summary = await screen.findByRole('dialog', { name: 'Antes de ir a Mercado Pago' });
  await user.click(within(summary).getByRole('checkbox', { name: /Leí y acepto/ }));
  await user.click(within(summary).getByRole('button', { name: 'Ir a Mercado Pago' }));
  return summary;
}
