/** Where an account's record lives: the Cuentas tab with `?cuenta=<id>` (S1). */
export const recordLink = (id: number) => `?seccion=cuentas&cuenta=${id}`;

/** Back to the list, on the same tab. */
export const LIST_LINK = '?seccion=cuentas';
