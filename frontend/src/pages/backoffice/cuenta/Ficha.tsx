import { useId, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';
import {
  accountAction,
  getAccount,
  revokeCourtesy,
  type AccountActionPath,
  type AccountRecord,
  type RecordSubscription,
} from '../../../api/backoffice';
import { formatMoney, SUBSCRIPTION_WORDS } from '../../../api/payments';
import { BackofficeDialog } from '../../../components/backoffice/BackofficeDialog';
import { LoadFailed, Loading } from '../../../components/backoffice/Loading';
import { Icon } from '../../../components/Icon';
import { DASH } from '../../../lib/format';
import { founderLabel } from '../../../lib/membership';
import { queryKeys } from '../../../query/keys';
import { useMe } from '../../../query/hooks';
import { Saved } from '../../Perfil';
import { PaymentStatusChip, SubscriptionStatusChip } from '../../Suscripcion';
import { formatDay, REASON_WORDS } from '../format';
import { useBackofficeQuery } from '../queries';
import { ChangePlanForm, PAYING_PLAN } from './ChangePlanForm';
import { ConfirmAction, CourtesyForm, EditForm, FounderQuota, TrialForm } from './dialogs';
import { LIST_LINK } from './link';

/**
 * The record's writes. Each one opens a dialog first (backoffice-superadmin, Frontend). The
 * cortesía's revocation is a confirmation too, but a DELETE, so it is not an AccountActionPath.
 */
type FormKind = 'edit' | 'plan' | 'trial' | 'courtesy' | 'courtesy/revoke';
type DialogKind = FormKind | AccountActionPath;
const FORMS: readonly string[] = [
  'edit',
  'plan',
  'trial',
  'courtesy',
  'courtesy/revoke',
] satisfies FormKind[];
const isConfirmation = (kind: DialogKind | null): kind is AccountActionPath =>
  kind !== null && !FORMS.includes(kind);

interface Confirmation {
  title: string;
  description: ReactNode;
  confirm: string;
  pending: string;
  dismiss?: string;
  danger?: boolean;
  done: (record: AccountRecord) => string;
}

const isRunning = (sub: RecordSubscription) =>
  (sub.status === 'authorized' || sub.status === 'paused') && !sub.ended_at;

function statusText(account: AccountRecord) {
  const { courtesy } = account;
  if (courtesy) return `Cortesía de ${courtesy.plan.name} hasta el ${formatDay(courtesy.ends_at)}`;
  if (account.founder_number !== null) return founderLabel(account.founder_number);
  if (account.plan_expires_at) return `En prueba hasta el ${formatDay(account.plan_expires_at)}`;
  return 'Activa';
}

function confirmation(kind: AccountActionPath, account: AccountRecord): Confirmation {
  const { name } = account;
  const running = account.subscriptions.find(isRunning);
  switch (kind) {
    case 'bloquear':
      return {
        title: `¿Bloquear la cuenta de ${name}?`,
        description: (
          <p className="fine">
            No va a poder entrar, y si tiene una sesión abierta deja de funcionar. La suscripción de
            Mercado Pago sigue activa: cancelala aparte si hace falta.
          </p>
        ),
        confirm: 'Bloquear',
        pending: 'Bloqueando…',
        danger: true,
        done: (r) => `Bloqueamos la cuenta de ${r.name}.`,
      };
    case 'desbloquear':
      return {
        title: `¿Desbloquear la cuenta de ${name}?`,
        description: <p className="fine">Va a poder entrar de nuevo con su contraseña.</p>,
        confirm: 'Desbloquear',
        pending: 'Desbloqueando…',
        done: (r) => `Desbloqueamos la cuenta de ${r.name}.`,
      };
    case 'superadmin/dar':
      return {
        title: `¿Dar super admin a ${name}?`,
        description: (
          <p className="fine">
            Va a poder usar este backoffice y el admin de Django, y cambiar planes y precios de
            todas las cuentas.
          </p>
        ),
        confirm: 'Dar super admin',
        pending: 'Dando super admin…',
        done: (r) => `${r.name} ahora es super admin.`,
      };
    case 'superadmin/quitar':
      return {
        title: `¿Quitar super admin a ${name}?`,
        description: (
          <p className="fine">Deja de poder usar este backoffice y el admin de Django.</p>
        ),
        confirm: 'Quitar super admin',
        pending: 'Quitando super admin…',
        danger: true,
        done: (r) => `${r.name} ya no es super admin.`,
      };
    case 'restablecer-contrasena':
      return {
        title: '¿Mandar el mail para restablecer la contraseña?',
        description: (
          <p className="fine">
            Le mandamos a {account.email} un enlace para elegir una contraseña nueva. Vence en 1
            hora y sirve una sola vez.
          </p>
        ),
        confirm: 'Mandar mail',
        pending: 'Mandando…',
        done: (r) => `Le mandamos el mail a ${r.email}.`,
      };
    case 'founder/dar':
      return {
        title: `¿Marcar a ${name} como founder?`,
        description: (
          <>
            <p className="fine">
              Toma el próximo número de founder y pasa a Productor sin vencimiento.
            </p>
            <FounderQuota />
          </>
        ),
        confirm: 'Marcar founder',
        pending: 'Marcando…',
        done: (r) => `${r.name} es founder n.º ${r.founder_number}.`,
      };
    case 'founder/quitar':
      return {
        title: `¿Quitar founder a ${name}?`,
        description: (
          <p className="fine">
            Pierde el n.º {account.founder_number}, que no se vuelve a dar. El plan queda como está
            ({account.plan.name}, sin vencimiento): cambialo aparte si hace falta.
          </p>
        ),
        confirm: 'Quitar founder',
        pending: 'Quitando…',
        danger: true,
        done: (r) => `${r.name} ya no es founder.`,
      };
    case 'suscripcion/sincronizar':
      return {
        title: `¿Sincronizar la suscripción de ${name}?`,
        description: (
          <p className="fine">
            Le pedimos a Mercado Pago el estado de la última suscripción y sus cobros, por si se
            perdió un aviso. El plan cambia si Mercado Pago dice algo distinto.
          </p>
        ),
        confirm: 'Sincronizar',
        pending: 'Sincronizando…',
        done: (r) => {
          const [latest] = r.subscriptions;
          return latest
            ? `Sincronizamos la suscripción: quedó ${SUBSCRIPTION_WORDS[latest.status]}.`
            : 'Sincronizamos la suscripción.';
        },
      };
    case 'suscripcion/cancelar':
      return {
        title: `¿Cancelar la suscripción de ${name}?`,
        description: (
          <p className="fine">
            Mercado Pago deja de cobrarle. Sigue con {running?.plan.name ?? 'el plan'} hasta el fin
            del mes pago y después pasa a {account.founder_number === null ? 'Básico' : 'Productor'}
            .
          </p>
        ),
        confirm: 'Cancelar suscripción',
        pending: 'Cancelando…',
        dismiss: 'Volver',
        danger: true,
        done: (r) => `Cancelamos la suscripción de ${r.name}.`,
      };
  }
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section className="panel bo-record-section" aria-labelledby={id}>
      <h3 id={id} className="panel-title">
        {title}
      </h3>
      {children}
    </section>
  );
}

function Facts({ facts }: { facts: [label: string, value: string][] }) {
  return (
    <dl className="bo-facts">
      {facts.map(([label, value]) => (
        <div key={label} className="bo-fact bo-fact--text">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

const courtesyDone = (record: AccountRecord) =>
  record.courtesy
    ? `${record.name} tiene ${record.courtesy.plan.name} de cortesía hasta el ${formatDay(
        record.courtesy.ends_at,
      )}.`
    : `Guardamos la cortesía de ${record.name}.`;

function Actions({ children }: { children: ReactNode }) {
  return <div className="bo-record-actions">{children}</div>;
}

function ActionButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="btn btn--secondary" onClick={onClick}>
      {label}
    </button>
  );
}

function PlanHistory({ account }: { account: AccountRecord }) {
  if (!account.plan_changes.length) return <p className="fine">Sin cambios de plan.</p>;
  return (
    <div className="bo-table-wrap" role="region" aria-label="Historial de planes" tabIndex={0}>
      <table className="bo-table">
        <caption className="sr-only">Historial de planes</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col">Cambio</th>
            <th scope="col">Motivo</th>
            <th scope="col">Hecho por</th>
            <th scope="col">Nota</th>
          </tr>
        </thead>
        <tbody>
          {account.plan_changes.map((change) => (
            <tr key={change.id}>
              <th scope="row" data-label="Fecha" className="bo-when">
                <time dateTime={change.at}>{formatDay(change.at)}</time>
              </th>
              <td data-label="Cambio">
                {change.from_plan
                  ? `${change.from_plan.name} → ${change.to_plan.name}`
                  : change.to_plan.name}
              </td>
              <td data-label="Motivo">{REASON_WORDS[change.reason]}</td>
              <td data-label="Hecho por">{change.by?.name ?? DASH}</td>
              <td data-label="Nota">{change.note || DASH}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Subscriptions({ account }: { account: AccountRecord }) {
  if (!account.subscriptions.length) {
    return <p className="fine">Sin suscripciones con Mercado Pago.</p>;
  }
  return (
    <div className="bo-table-wrap" role="region" aria-label="Suscripciones" tabIndex={0}>
      <table className="bo-table">
        <caption className="sr-only">Suscripciones</caption>
        <thead>
          <tr>
            <th scope="col">Plan</th>
            <th scope="col" className="bo-num">
              Por mes
            </th>
            <th scope="col">Estado</th>
            <th scope="col">Próximo cobro o fin</th>
            <th scope="col">Alta</th>
            <th scope="col">ID en Mercado Pago</th>
          </tr>
        </thead>
        <tbody>
          {account.subscriptions.map((sub) => (
            <tr key={sub.id}>
              <th scope="row" data-label="Plan">
                {sub.plan.name}
              </th>
              <td data-label="Por mes" className="bo-num">
                {formatMoney(sub.amount, sub.currency)}
              </td>
              <td data-label="Estado">
                <SubscriptionStatusChip status={sub.status} />
              </td>
              <td data-label="Próximo cobro o fin">
                {sub.ends_at
                  ? `Termina el ${formatDay(sub.ends_at)}`
                  : sub.ended_at
                    ? `Terminó el ${formatDay(sub.ended_at)}`
                    : sub.next_payment_at
                      ? formatDay(sub.next_payment_at)
                      : DASH}
              </td>
              <td data-label="Alta">{formatDay(sub.created_at)}</td>
              <td data-label="ID en Mercado Pago" className="bo-mono">
                {sub.external_id}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Payments({ account }: { account: AccountRecord }) {
  if (!account.payments.length) return <p className="fine">Sin pagos.</p>;
  return (
    <div className="bo-table-wrap" role="region" aria-label="Pagos" tabIndex={0}>
      <table className="bo-table">
        <caption className="sr-only">Pagos</caption>
        <thead>
          <tr>
            <th scope="col">Fecha</th>
            <th scope="col" className="bo-num">
              Monto
            </th>
            <th scope="col">Estado</th>
            <th scope="col">ID en Mercado Pago</th>
          </tr>
        </thead>
        <tbody>
          {account.payments.map((payment) => (
            <tr key={payment.id}>
              <th scope="row" data-label="Fecha" className="bo-when">
                {formatDay(payment.paid_at ?? payment.created_at)}
              </th>
              <td data-label="Monto" className="bo-num">
                {formatMoney(payment.amount, payment.currency)}
              </td>
              <td data-label="Estado">
                <PaymentStatusChip status={payment.status} />
              </td>
              <td data-label="ID en Mercado Pago" className="bo-mono">
                {payment.external_id}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LotesAndAlerts({ account }: { account: AccountRecord }) {
  return (
    <div className="bo-record-lists">
      <div>
        <h4 className="bo-record-subtitle">Lotes</h4>
        {account.lotes.length ? (
          <ul className="bo-record-list" aria-label="Lotes">
            {account.lotes.map((lote) => (
              <li key={lote.id}>
                <span className="bo-strong">{lote.name}</span> · creado el{' '}
                {formatDay(lote.created_at)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="fine">Sin lotes.</p>
        )}
      </div>
      <div>
        <h4 className="bo-record-subtitle">Reglas de alerta</h4>
        {account.alert_rules.length ? (
          <ul className="bo-record-list" aria-label="Reglas de alerta">
            {account.alert_rules.map((rule) => (
              <li key={rule.id}>
                {rule.name} · {rule.lote} · {rule.enabled ? 'Activa' : 'Inactiva'}
              </li>
            ))}
          </ul>
        ) : (
          <p className="fine">Sin reglas de alerta.</p>
        )}
      </div>
    </div>
  );
}

/**
 * One account on one screen (backoffice-superadmin S1-S4): its data, access, plan and founder,
 * Mercado Pago, lotes and alerts. Every write opens a dialog first and answers the record again,
 * which replaces the one on screen; the lists and the summary are read again too.
 */
export function Ficha({ id }: { id: number }) {
  const key = queryKeys.backofficeList('cuenta', { id });
  const record = useBackofficeQuery(key, () => getAccount(id));
  const me = useMe();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const back = (
    <Link className="back-link bo-record-back" to={LIST_LINK}>
      <Icon name="chevronLeft" strokeWidth={2.6} />
      Todas las cuentas
    </Link>
  );
  const account = record.data;
  if (!account) {
    return (
      <div className="bo-tab">
        {back}
        {record.isError ? (
          <LoadFailed error={record.error} onRetry={() => void record.refetch()} />
        ) : (
          <Loading what="la cuenta" />
        )}
      </div>
    );
  }

  const own = account.id === me.data?.id;
  const open = (kind: DialogKind) => {
    setSaved(null);
    setDialog(kind);
  };
  const close = () => setDialog(null);
  const finish = (message: string, next?: AccountRecord) => {
    if (next) queryClient.setQueryData(key, next);
    setDialog(null);
    setSaved(message);
  };

  const pending = isConfirmation(dialog) ? dialog : null;
  const ask = pending ? confirmation(pending, account) : null;
  const title =
    dialog === 'edit'
      ? `Editar los datos de ${account.name}`
      : dialog === 'plan'
        ? `Cambiar el plan de ${account.name}`
        : dialog === 'trial'
          ? `Prueba de Productor para ${account.name}`
          : dialog === 'courtesy'
            ? `Cortesía para ${account.name}`
            : dialog === 'courtesy/revoke'
              ? `¿Revocar la cortesía de ${account.name}?`
              : (ask?.title ?? 'Cuenta');

  return (
    <article className="bo-tab bo-record" aria-label={`Ficha de ${account.name}`}>
      {back}
      <header className="bo-record-head">
        <h2 className="bo-record-title">{account.name}</h2>
        <p className="bo-person-email">{account.email}</p>
        <div className="bo-record-chips">
          {account.is_superuser ? <span className="chip">Super admin</span> : null}
          {account.is_active ? null : <span className="chip chip--pending">Bloqueada</span>}
        </div>
      </header>
      <Saved message={saved} />

      <Section title="Datos">
        <Facts
          facts={[
            ['Plan', account.plan.name],
            ['Estado', statusText(account)],
            ['Acceso', account.is_active ? 'Puede entrar' : 'Bloqueada'],
            ['Alta', formatDay(account.date_joined)],
            ['Último ingreso', account.last_login ? formatDay(account.last_login) : DASH],
          ]}
        />
        <Actions>
          <ActionButton label="Editar nombre y email" onClick={() => open('edit')} />
        </Actions>
      </Section>

      <Section title="Acceso">
        <Actions>
          {own ? null : account.is_active ? (
            <ActionButton label="Bloquear cuenta" onClick={() => open('bloquear')} />
          ) : (
            <ActionButton label="Desbloquear cuenta" onClick={() => open('desbloquear')} />
          )}
          {!account.is_superuser ? (
            <ActionButton label="Dar super admin" onClick={() => open('superadmin/dar')} />
          ) : own ? null : (
            <ActionButton label="Quitar super admin" onClick={() => open('superadmin/quitar')} />
          )}
          {account.is_active ? (
            <ActionButton
              label="Mandar mail para restablecer la contraseña"
              onClick={() => open('restablecer-contrasena')}
            />
          ) : null}
        </Actions>
        {own ? (
          <p className="fine">Es tu cuenta: no podés bloquearla ni quitarte el super admin.</p>
        ) : null}
      </Section>

      <Section title="Plan y founder">
        {account.courtesy ? (
          <>
            <h4 className="bo-record-subtitle">Cortesía activa</h4>
            <Facts
              facts={[
                ['Cortesía', account.courtesy.plan.name],
                ['Hasta', formatDay(account.courtesy.ends_at)],
                ['Motivo', account.courtesy.reason],
                ['Dada por', account.courtesy.granted_by?.name ?? DASH],
              ]}
            />
          </>
        ) : null}
        {account.paying ? <p className="fine">{PAYING_PLAN}</p> : null}
        <Actions>
          {account.paying ? null : (
            <ActionButton label="Cambiar plan" onClick={() => open('plan')} />
          )}
          {account.courtesy ? (
            <>
              <ActionButton label="Cambiar cortesía" onClick={() => open('courtesy')} />
              <ActionButton label="Revocar cortesía" onClick={() => open('courtesy/revoke')} />
            </>
          ) : (
            <ActionButton label="Dar cortesía" onClick={() => open('courtesy')} />
          )}
          {account.founder_number === null ? (
            <>
              <ActionButton label="Dar o extender prueba" onClick={() => open('trial')} />
              <ActionButton label="Marcar founder" onClick={() => open('founder/dar')} />
            </>
          ) : (
            <ActionButton label="Quitar founder" onClick={() => open('founder/quitar')} />
          )}
        </Actions>
        <h4 className="bo-record-subtitle">Historial de planes</h4>
        <PlanHistory account={account} />
      </Section>

      <Section title="Mercado Pago">
        {account.subscriptions.length ? (
          <Actions>
            <ActionButton
              label="Sincronizar con Mercado Pago"
              onClick={() => open('suscripcion/sincronizar')}
            />
            {account.subscriptions.some(isRunning) ? (
              <ActionButton
                label="Cancelar suscripción"
                onClick={() => open('suscripcion/cancelar')}
              />
            ) : null}
          </Actions>
        ) : null}
        <h4 className="bo-record-subtitle">Suscripciones</h4>
        <Subscriptions account={account} />
        <h4 className="bo-record-subtitle">Pagos</h4>
        <Payments account={account} />
      </Section>

      <Section title="Lotes y alertas">
        <LotesAndAlerts account={account} />
      </Section>

      <BackofficeDialog open={dialog !== null} title={title} onClose={close}>
        {dialog === 'edit' ? (
          <EditForm
            account={account}
            onCancel={close}
            onDone={(next) => finish(`Guardamos los datos de ${next.name}.`, next)}
          />
        ) : dialog === 'plan' ? (
          <ChangePlanForm account={account} onCancel={close} onDone={(m) => finish(m)} />
        ) : dialog === 'trial' ? (
          <TrialForm
            account={account}
            onCancel={close}
            onDone={(next) =>
              finish(
                `${next.name} tiene Productor hasta el ${
                  next.plan_expires_at ? formatDay(next.plan_expires_at) : DASH
                }.`,
                next,
              )
            }
          />
        ) : dialog === 'courtesy' ? (
          <CourtesyForm
            account={account}
            onCancel={close}
            onDone={(next) => finish(courtesyDone(next), next)}
          />
        ) : dialog === 'courtesy/revoke' ? (
          <ConfirmAction
            description={
              <p className="fine">
                Pasa a {account.founder_number === null ? 'Básico' : 'Productor'} ahora, en vez del{' '}
                {account.courtesy ? formatDay(account.courtesy.ends_at) : DASH}. No le mandamos
                ningún mail.
              </p>
            }
            confirmLabel="Revocar cortesía"
            pendingLabel="Revocando…"
            danger
            run={() => revokeCourtesy(account.id)}
            onCancel={close}
            onDone={(next) => finish(`Revocamos la cortesía de ${next.name}.`, next)}
          />
        ) : pending && ask ? (
          <ConfirmAction
            key={pending}
            description={ask.description}
            confirmLabel={ask.confirm}
            pendingLabel={ask.pending}
            dismissLabel={ask.dismiss}
            danger={ask.danger}
            run={() => accountAction(account.id, pending)}
            onCancel={close}
            onDone={(next) => finish(ask.done(next), next)}
          />
        ) : null}
      </BackofficeDialog>
    </article>
  );
}
