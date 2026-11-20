import { Link } from 'react-router';
import { Clause, LegalLayout } from './LegalLayout';

/**
 * Reglas del programa (promociones S0a): founders, the Productor trial and paid subscriptions.
 * Coupons, referrals and free months are added here when they ship. A lawyer reviews the text
 * before it goes live.
 */
export function Reglas() {
  return (
    <LegalLayout title="Reglas del programa">
      <Clause title="1. Founders">
        <p>
          Las primeras cuentas que se crean, hasta completar el cupo que informa la página{' '}
          <Link to="/planes">Planes</Link>, son founders y reciben un número. Para un founder:
        </p>
        <ul>
          <li>
            «Gratis para siempre» significa el plan Productor sin cargo, mientras el servicio
            exista.
          </li>
          <li>
            Puede pasar al plan Empresa pagando solo la diferencia entre el precio de Empresa y el
            de Productor, por mes, con Mercado Pago.
          </li>
          <li>Si se da de baja de Empresa, la cuenta vuelve a Productor sin cargo.</li>
          <li>
            El beneficio es personal e intransferible: queda en la cuenta y no se puede ceder,
            vender ni pasar a otra cuenta. Si la cuenta se borra, el beneficio se pierde y su número
            no se vuelve a asignar.
          </li>
        </ul>
      </Clause>

      <Clause title="2. Prueba de Productor">
        <p>
          Una cuenta nueva que no es founder prueba el plan Productor sin cargo durante los días que
          informa la página Planes. La prueba no pide tarjeta ni cobra nada. Al terminar, la cuenta
          pasa al plan Básico, salvo que antes se haya suscripto a un plan pago.
        </p>
      </Clause>

      <Clause title="3. Suscripciones pagas">
        <ul>
          <li>
            Son mensuales, se renuevan automáticamente y se cobran en pesos a través de Mercado
            Pago.
          </li>
          <li>El primer cobro se hace al confirmar la suscripción en Mercado Pago.</li>
          <li>Cada cuenta puede tener una sola suscripción paga a la vez.</li>
          <li>
            Al darse de baja con «Darme de baja» se conserva el mes ya pagado: no se cobra más y el
            plan sigue hasta el final de ese mes.
          </li>
          <li>
            Una suscripción pausada o cancelada conserva el plan hasta el final del mes pagado.
            Después, la cuenta pasa al plan Básico, o a Productor si es founder.
          </li>
          <li>
            Los precios pueden cambiar. Cada cambio se avisa antes por email, como dicen los{' '}
            <Link to="/terminos">Términos y condiciones</Link>.
          </li>
        </ul>
      </Clause>

      <Clause title="4. Cupones, referidos y meses gratis">
        <p>Todavía no están disponibles. Sus reglas se agregarán a esta página cuando lo estén.</p>
      </Clause>
    </LegalLayout>
  );
}
