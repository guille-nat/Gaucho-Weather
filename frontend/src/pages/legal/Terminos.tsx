import { Link } from 'react-router';
import { Clause, LegalLayout, Ph } from './LegalLayout';

/**
 * Términos y condiciones (promociones S0a). A draft in a neutral register that describes only
 * what the app does; a lawyer reviews it before it goes live.
 */
export function Terminos() {
  return (
    <LegalLayout title="Términos y condiciones">
      <Clause title="1. Quién presta el servicio">
        <p>
          Gaucho Weather es un servicio de <Ph>RAZÓN SOCIAL</Ph>, CUIT <Ph>CUIT</Ph>, con domicilio
          en <Ph>DOMICILIO</Ph> (en adelante, «Gaucho Weather»). Para cualquier consulta o reclamo,
          el Usuario puede escribir a <Ph>EMAIL DE CONTACTO</Ph>.
        </p>
        <p>
          Estos términos, junto con la <Link to="/privacidad">Política de privacidad</Link> y las{' '}
          <Link to="/reglas">Reglas del programa</Link>, regulan el uso de Gaucho Weather y forman
          un solo conjunto, con una misma versión.
        </p>
      </Clause>

      <Clause title="2. Qué es Gaucho Weather">
        <p>
          Gaucho Weather es una aplicación web para el trabajo en el campo en la República
          Argentina. Permite:
        </p>
        <ul>
          <li>consultar el pronóstico del tiempo de cualquier punto del país, sin cuenta;</li>
          <li>
            con una cuenta, guardar lotes con su ubicación y sus cultivos, y ver para cada uno el
            pronóstico, el clima pasado y orientaciones sobre helada, pulverización y labores;
          </li>
          <li>
            definir reglas de alerta por lote y recibir los avisos en la aplicación, por
            notificación push o por email.
          </li>
        </ul>
      </Clause>

      <Clause title="3. Aceptación y cambios">
        <p>
          El Usuario acepta estos términos al crear su cuenta y nuevamente cada vez que contrata una
          suscripción paga. Gaucho Weather registra la versión aceptada, la fecha y el momento en
          que se aceptó (alta, suscripción o actualización).
        </p>
        <p>
          Cuando estos textos cambien, se publicará una versión nueva con su fecha de vigencia y se
          avisará por email antes de que entre en vigencia. Al ingresar, la aplicación pedirá
          aceptar la versión nueva para seguir usando la cuenta. Quien no la acepte puede salir de
          su cuenta, darse de baja de su suscripción y borrar su cuenta.
        </p>
      </Clause>

      <Clause title="4. La cuenta">
        <ul>
          <li>La cuenta es personal y se identifica con un email y una contraseña.</li>
          <li>
            El Usuario debe dar datos verdaderos y cuidar su contraseña. Es responsable de lo que se
            haga con su cuenta.
          </li>
          <li>
            El Usuario puede cambiar su nombre, su email y su contraseña, y recuperar la contraseña
            por email, desde la aplicación.
          </li>
          <li>
            No está permitido usar el servicio para fines ilícitos, intentar acceder a cuentas
            ajenas, ni afectar el funcionamiento del servicio (por ejemplo, con pedidos
            automatizados masivos).
          </li>
        </ul>
      </Clause>

      <Clause title="5. El pronóstico y las orientaciones son información de apoyo">
        <p>
          Los pronósticos provienen de modelos meteorológicos de terceros (Open-Meteo) y las
          observaciones, del Servicio Meteorológico Nacional. Las orientaciones sobre helada,
          pulverización y labores se calculan a partir de esos datos con reglas generales.
        </p>
        <p>
          Un pronóstico puede no cumplirse. Esta información no reemplaza el criterio del Usuario ni
          el de un profesional (por ejemplo, un ingeniero agrónomo), ni las indicaciones de la
          etiqueta de un producto fitosanitario. Las decisiones sobre el campo son del Usuario.
        </p>
      </Clause>

      <Clause title="6. Planes">
        <ul>
          <li>
            Hay tres planes: Básico, gratuito, y Productor y Empresa, pagos. Lo que incluye cada uno
            (cantidad de lotes, reglas de alerta, notificaciones push y soporte) y su precio se
            informan en la página <Link to="/planes">Planes</Link>.
          </li>
          <li>
            Una cuenta nueva que no es founder prueba el plan Productor sin cargo durante los días
            que informa la página Planes. Al terminar la prueba pasa al plan Básico, sin ningún
            cobro.
          </li>
          <li>
            Las primeras cuentas tienen el beneficio founder, que se rige por las{' '}
            <Link to="/reglas">Reglas del programa</Link>.
          </li>
          <li>
            Al pasar a un plan con menos lotes o reglas, los lotes y las reglas se conservan, pero
            no se pueden crear nuevos y las reglas que superan el límite quedan en pausa.
          </li>
        </ul>
      </Clause>

      <Clause title="7. Suscripciones pagas">
        <ul>
          <li>
            Los planes pagos se contratan como una suscripción mensual que se cobra en pesos a
            través de Mercado Pago. Mercado Pago procesa el pago con sus propios términos; Gaucho
            Weather no recibe los datos de la tarjeta.
          </li>
          <li>
            Antes de ir a Mercado Pago, la aplicación muestra el monto por mes, que la suscripción
            se renueva automáticamente, que el primer cobro es en ese momento y cómo darse de baja.
          </li>
          <li>
            La suscripción se renueva automáticamente todos los meses hasta que el Usuario se dé de
            baja. El plan se activa cuando Mercado Pago confirma la suscripción, y Gaucho Weather
            envía un email de confirmación.
          </li>
          <li>Cada cuenta puede tener una sola suscripción paga a la vez.</li>
          <li>
            Si un cobro es rechazado, Mercado Pago lo reintenta. Si Mercado Pago cancela la
            suscripción, el plan sigue hasta el final del mes pagado.
          </li>
          <li>
            Los precios pueden cambiar. Un cambio de precio se avisa por email con al menos 30 días
            de anticipación y rige desde el cobro siguiente a ese plazo.
          </li>
        </ul>
      </Clause>

      <Clause title="8. Baja y revocación">
        <ul>
          <li>
            El Usuario puede darse de baja en cualquier momento, desde la aplicación, en Perfil → Tu
            suscripción → «Darme de baja», sin otro trámite (art. 10 ter de la Ley 24.240 de Defensa
            del Consumidor).
          </li>
          <li>
            Al darse de baja, Mercado Pago deja de cobrar y el Usuario conserva el plan hasta el
            final del mes que ya pagó. Después, la cuenta pasa al plan Básico (o a Productor, si es
            founder).
          </li>
          <li>
            Una suscripción pausada en Mercado Pago se trata como una baja: el plan sigue hasta el
            final del mes pagado.
          </li>
          <li>
            El Usuario puede revocar la contratación dentro de los diez (10) días corridos desde que
            la hizo, conforme al art. 34 de la Ley 24.240, escribiendo a <Ph>EMAIL DE CONTACTO</Ph>.
          </li>
        </ul>
      </Clause>

      <Clause title="9. Borrar la cuenta">
        <p>
          El Usuario puede borrar su cuenta desde Perfil, confirmando con su contraseña. Se borran
          sus lotes, reglas, alertas y demás datos, como explica la{' '}
          <Link to="/privacidad">Política de privacidad</Link>. Borrar la cuenta no cancela por sí
          solo una suscripción en Mercado Pago: antes de borrarla, el Usuario debe darse de baja. Un
          número de founder no se vuelve a asignar.
        </p>
      </Clause>

      <Clause title="10. Disponibilidad">
        <p>
          Gaucho Weather procura que el servicio funcione de forma continua, pero puede tener
          interrupciones por mantenimiento, fallas técnicas o fallas de los proveedores de datos. La
          aplicación guarda en el teléfono los últimos datos para consultarlos sin conexión, y avisa
          cuando lo que muestra no está actualizado.
        </p>
      </Clause>

      <Clause title="11. Propiedad intelectual">
        <p>
          La marca, el diseño y el software de Gaucho Weather pertenecen a <Ph>RAZÓN SOCIAL</Ph>.
          Los datos de terceros (pronósticos, lugares y mapas) se usan bajo sus propias licencias,
          con las atribuciones que se muestran en la aplicación. Los datos que carga el Usuario
          siguen siendo suyos.
        </p>
      </Clause>

      <Clause title="12. Responsabilidad">
        <p>
          En la medida que permita la ley aplicable, Gaucho Weather no responde por decisiones
          tomadas a partir de un pronóstico o una orientación que no se cumplió, ni por
          interrupciones ajenas a su control. Nada de lo anterior limita los derechos que la Ley
          24.240 de Defensa del Consumidor reconoce al Usuario.
        </p>
      </Clause>

      <Clause title="13. Ley aplicable y reclamos">
        <p>
          Estos términos se rigen por las leyes de la República Argentina. Para cualquier
          controversia son competentes los tribunales de <Ph>JURISDICCIÓN</Ph>, sin perjuicio del
          derecho del Usuario consumidor a reclamar ante los tribunales de su domicilio y ante la
          autoridad de aplicación de la Ley 24.240.
        </p>
      </Clause>
    </LegalLayout>
  );
}
