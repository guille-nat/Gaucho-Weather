import { useState } from 'react';
import { listActions, type ActionRow } from '../../api/backoffice';
import { formatMoney } from '../../api/payments';
import { LoadFailed, Loading } from '../../components/backoffice/Loading';
import { Pager } from '../../components/backoffice/Pager';
import { DASH, formatDate } from '../../lib/format';
import { founderLabel } from '../../lib/membership';
import { queryKeys } from '../../query/keys';
import { formatMoment, planName, plural, subscriptionWord } from './format';
import { useBackofficeQuery } from './queries';

type Prices = { price_ars_month?: number | null; price_usd_month?: number | null } | undefined;

const price = (value: number | null | undefined, currency: 'ARS' | 'USD') =>
  value === null || value === undefined ? 'a confirmar' : formatMoney(value, currency);

const withNote = (text: string, note: unknown) =>
  typeof note === 'string' && note.trim() ? `${text}. Nota: «${note.trim()}»` : text;

const asked = (payload: ActionRow['payload']) =>
  payload.kind === 'cancel'
    ? `baja a ${planName(payload.plan)}`
    : `pasar a ${planName(payload.plan)}`;

type Fields = { name?: string; email?: string } | undefined;

/** `nombre «Ana» → «Ana María»; email a@x.com → b@x.com`: only the fields that changed. */
function edited(payload: ActionRow['payload']) {
  const before = payload.before as Fields;
  const after = payload.after as Fields;
  const parts = [];
  if (after?.name !== undefined) parts.push(`nombre «${before?.name ?? ''}» → «${after.name}»`);
  if (after?.email !== undefined) parts.push(`email ${before?.email ?? ''} → ${after.email}`);
  return parts.join('; ');
}

const calendarDay = (value: unknown) => (typeof value === 'string' ? formatDate(value) : DASH);

const founderNumber = (value: unknown) =>
  typeof value === 'number' ? founderLabel(value) : 'Founder';

/** What was done, in words, from the payload each action stores (backoffice.md, "Registro"). */
function describeAction({ action, payload }: ActionRow): string {
  switch (action) {
    case 'plan_change':
      return withNote(
        `Cambio de plan: ${planName(payload.from)} → ${planName(payload.to)}`,
        payload.note,
      );
    case 'request_apply':
      return `Pedido aplicado: ${asked(payload)}`;
    case 'request_reject':
      return withNote(`Pedido rechazado: ${asked(payload)}`, payload.note);
    case 'price_update': {
      const before = payload.before as Prices;
      const after = payload.after as Prices;
      return (
        `Precios de ${planName(payload.plan)}: ` +
        `${price(before?.price_ars_month, 'ARS')} → ${price(after?.price_ars_month, 'ARS')}; ` +
        `${price(before?.price_usd_month, 'USD')} → ${price(after?.price_usd_month, 'USD')}`
      );
    }
    case 'price_schedule':
    case 'price_unschedule':
      return (
        `Cambio de precio ${action === 'price_schedule' ? 'programado' : 'cancelado'}: ` +
        `${planName(payload.plan)} a ${price(payload.price_ars_month as number, 'ARS')} ` +
        `desde el ${calendarDay(payload.effective_on)}`
      );
    case 'account_update':
      return `Datos editados: ${edited(payload)}`;
    case 'account_block':
      return 'Cuenta bloqueada';
    case 'account_unblock':
      return 'Cuenta desbloqueada';
    case 'superadmin_grant':
      return 'Super admin dado';
    case 'superadmin_revoke':
      return 'Super admin quitado';
    case 'password_reset':
      return 'Mail para restablecer la contraseña';
    case 'trial_grant':
      return (
        `Prueba de Productor hasta el ${calendarDay(payload.until)} ` +
        `(venía de ${planName(payload.from_plan)})`
      );
    case 'founder_grant':
      return `${founderNumber(payload.number)} (venía de ${planName(payload.from_plan)})`;
    case 'founder_revoke':
      return `${founderNumber(payload.number)} quitado`;
    case 'subscription_sync':
      return (
        'Suscripción sincronizada con Mercado Pago: ' +
        `${subscriptionWord(payload.before)} → ${subscriptionWord(payload.after)}; ` +
        plural(Number(payload.payments) || 0, 'pago', 'pagos')
      );
    case 'subscription_cancel':
      return (
        'Suscripción cancelada desde el backoffice: ' +
        `${subscriptionWord(payload.before)} → ${subscriptionWord(payload.after)}`
      );
    case 'export':
      return (
        `Exportación CSV: ${String(payload.file)} ` +
        `(${plural(Number(payload.rows) || 0, 'fila', 'filas')})`
      );
    default:
      return String(action);
  }
}

/** Every backoffice write, newest first: who did what to which account (S4). */
export function Registro() {
  const [page, setPage] = useState(1);
  const log = useBackofficeQuery(queryKeys.backofficeList('registro', { page }), () =>
    listActions(page),
  );
  if (!log.data) {
    return log.isError ? (
      <LoadFailed error={log.error} onRetry={() => void log.refetch()} />
    ) : (
      <Loading what="el registro" />
    );
  }
  if (!log.data.results.length) {
    return <p className="notice">Todavía no hay acciones en el backoffice.</p>;
  }
  return (
    <div className="bo-tab">
      <p className="fine">Las acciones hechas desde el admin de Django no aparecen acá.</p>
      <div className="bo-table-wrap" role="region" aria-label="Registro" tabIndex={0}>
        <table className="bo-table">
          <caption className="sr-only">Registro</caption>
          <thead>
            <tr>
              <th scope="col">Cuándo</th>
              <th scope="col">Quién</th>
              <th scope="col">Qué</th>
              <th scope="col">Cuenta</th>
            </tr>
          </thead>
          <tbody>
            {log.data.results.map((row) => (
              <tr key={row.id}>
                <th scope="row" data-label="Cuándo" className="bo-when">
                  <time dateTime={row.at}>{formatMoment(row.at)}</time>
                </th>
                <td data-label="Quién">{row.actor?.name ?? DASH}</td>
                <td data-label="Qué" className="bo-what">
                  {describeAction(row)}
                </td>
                <td data-label="Cuenta">{row.target_user?.name ?? DASH}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} count={log.data.count} onPage={setPage} />
    </div>
  );
}
