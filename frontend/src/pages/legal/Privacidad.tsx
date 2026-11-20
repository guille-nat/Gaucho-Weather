import { Clause, LegalLayout, Ph } from './LegalLayout';

/**
 * Política de privacidad (promociones S0a), under Ley 25.326. It lists only what the code
 * collects and the services it really calls; a lawyer reviews it before it goes live.
 */
export function Privacidad() {
  return (
    <LegalLayout title="Política de privacidad">
      <Clause title="1. Responsable de los datos">
        <p>
          El responsable de los datos personales es <Ph>RAZÓN SOCIAL</Ph>, CUIT <Ph>CUIT</Ph>, con
          domicilio en <Ph>DOMICILIO</Ph>. Contacto: <Ph>EMAIL DE CONTACTO</Ph>. Los datos se tratan
          conforme a la Ley 25.326 de Protección de los Datos Personales.
        </p>
      </Clause>

      <Clause title="2. Qué datos se tratan">
        <ul>
          <li>
            <strong>Cuenta:</strong> nombre, email, contraseña (guardada con un hash, nunca en
            texto), fecha de alta, plan y su historial, pedidos de cambio de plan, número de
            founder, preferencias de aviso (push y email) y las aceptaciones de estos textos
            (versión, fecha y momento).
          </li>
          <li>
            <strong>Lotes:</strong> nombre, establecimiento, localidad, ubicación (latitud y
            longitud), superficie, el contorno dibujado en el mapa y los cultivos (cultivo,
            superficie y fecha de siembra).
          </li>
          <li>
            <strong>Alertas:</strong> las reglas de alerta de cada lote y los avisos generados, con
            su estado.
          </li>
          <li>
            <strong>Notificaciones push:</strong> si el Usuario las activa, la dirección que da el
            navegador para enviarle avisos, sus claves de cifrado y el nombre del navegador.
          </li>
          <li>
            <strong>Pagos:</strong> la suscripción (plan, monto, estado y fecha del próximo cobro) y
            cada cobro (monto, moneda, estado y fecha), junto con la respuesta que Mercado Pago
            devuelve sobre cada cobro, que puede incluir datos del pagador que Mercado Pago informa.
            Gaucho Weather no recibe ni guarda los datos de la tarjeta: se cargan en Mercado Pago.
          </li>
          <li>
            <strong>Ubicación del teléfono:</strong> solo si el Usuario la permite, para mostrar el
            clima del lugar donde está. Las coordenadas se usan para pedir el pronóstico y el nombre
            del lugar, y no se asocian a la cuenta.
          </li>
          <li>
            <strong>Datos técnicos:</strong> una cookie de sesión y una cookie de seguridad (CSRF).
            La dirección IP se usa de forma temporal para limitar los intentos de ingreso, de alta y
            de recuperación de contraseña, y puede figurar en los registros técnicos del servidor.
            No se usan cookies de publicidad ni de analítica.
          </li>
        </ul>
      </Clause>

      <Clause title="3. Para qué se usan">
        <ul>
          <li>Prestar el servicio: el pronóstico por lote, las orientaciones y las alertas.</li>
          <li>Mantener la cuenta y su seguridad.</li>
          <li>Gestionar los planes, las suscripciones y los cobros.</li>
          <li>
            Enviar emails del servicio: alertas (si el Usuario las eligió por email), recuperación
            de contraseña, cambios de plan, fin de la prueba, confirmación de la suscripción y
            avisos de cambios en estos textos o en los precios.
          </li>
          <li>Atender consultas y reclamos.</li>
        </ul>
        <p>Los datos no se venden ni se usan para publicidad.</p>
      </Clause>

      <Clause title="4. Con quién se comparten">
        <ul>
          <li>
            <strong>Mercado Pago</strong>, para crear y cobrar la suscripción: el email de la
            cuenta, el plan, el monto y un identificador interno de la cuenta.
          </li>
          <li>
            <strong>Open-Meteo</strong>, para obtener los pronósticos: las coordenadas de los lotes
            y de los puntos consultados, sin datos de la cuenta.
          </li>
          <li>
            <strong>Georef AR</strong> (servicio de datos del Estado nacional), para buscar lugares
            y nombrar un punto: el texto buscado o las coordenadas, sin datos de la cuenta.
          </li>
          <li>
            <strong>OpenFreeMap y EOX</strong>, que sirven los mapas: el navegador les pide las
            imágenes de la zona que muestra el mapa, con su dirección IP.
          </li>
          <li>
            <strong>El servicio de notificaciones del navegador</strong> (el de Google, Mozilla o
            Apple, según el navegador), que entrega los avisos push cifrados.
          </li>
          <li>
            <strong>
              <Ph>PROVEEDOR DE EMAIL</Ph>
            </strong>
            , que envía los emails: el email y el contenido del mensaje.
          </li>
          <li>
            <strong>
              <Ph>PROVEEDOR DE HOSTING</Ph>
            </strong>
            , donde funcionan los servidores y se guardan los datos.
          </li>
          <li>Las autoridades, cuando una ley o una orden judicial lo exija.</li>
        </ul>
        <p>
          Algunos de estos servicios funcionan fuera de la República Argentina. El personal
          autorizado de Gaucho Weather accede a las cuentas y los pagos solo para operar el
          servicio, y cada cambio que hace queda registrado.
        </p>
      </Clause>

      <Clause title="5. Datos guardados en el teléfono">
        <p>
          Para funcionar sin conexión, la aplicación guarda en el teléfono una copia de la cuenta y
          de los lotes, y los lugares buscados o guardados. Al salir de la cuenta se borran del
          teléfono los datos de la cuenta; el pronóstico de los lugares buscados queda.
        </p>
      </Clause>

      <Clause title="6. Cuánto tiempo se guardan">
        <p>
          Los datos se guardan mientras exista la cuenta. Al borrar la cuenta se eliminan la cuenta,
          sus lotes, reglas, alertas, suscripciones push, historial de planes, suscripciones y pagos
          registrados en Gaucho Weather, y las aceptaciones de estos textos. Mercado Pago conserva
          sus propios registros según sus políticas. Las copias de seguridad se conservan por{' '}
          <Ph>PLAZO</Ph> y los registros técnicos del servidor por <Ph>PLAZO</Ph>.
        </p>
      </Clause>

      <Clause title="7. Derechos del titular">
        <p>
          El Usuario puede acceder a sus datos, rectificarlos, actualizarlos y pedir su supresión
          (arts. 14 a 16 de la Ley 25.326). Desde Perfil puede cambiar su nombre, su email y sus
          preferencias de aviso, y borrar su cuenta. Para el resto, puede escribir a{' '}
          <Ph>EMAIL DE CONTACTO</Ph>.
        </p>
        <p>
          El titular de los datos personales tiene la facultad de ejercer el derecho de acceso a los
          mismos en forma gratuita a intervalos no inferiores a seis meses, salvo que se acredite un
          interés legítimo al efecto conforme lo establecido en el artículo 14, inciso 3 de la Ley
          25.326. La Agencia de Acceso a la Información Pública, en su carácter de órgano de control
          de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan
          quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en
          materia de protección de datos personales.
        </p>
      </Clause>

      <Clause title="8. Seguridad">
        <p>
          Las contraseñas se guardan con un hash, la conexión con la aplicación está cifrada y el
          acceso a la administración está restringido a personal autorizado, con registro de cada
          acción.
        </p>
      </Clause>

      <Clause title="9. Cambios">
        <p>
          Esta política forma parte del mismo conjunto que los Términos y condiciones: cuando
          cambia, se publica una versión nueva, se avisa por email y se pide aceptarla de nuevo.
        </p>
      </Clause>
    </LegalLayout>
  );
}
