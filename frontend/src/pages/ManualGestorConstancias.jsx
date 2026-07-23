import { Link } from 'react-router-dom';
import PortalLayout from '../components/PortalLayout';
// Mismo módulo de estilos que el manual de Mesa de Ayuda — nombres de clase
// genéricos (.section/.nota/.faqItem/.table/.glossary), pensados para
// cualquier manual, no solo el de esta app.
import styles from './ManualMesaDeAyuda.module.css';

// Transcripción fiel de "Manual_Usuario_GestorConstancias.docx" (el que
// compartió el usuario, v1.0 · Junio 2026) — Gestor de Constancias
// Aduaneras es una aplicación aparte (gestor-constancias.vercel.app), no
// parte de este repo; este manual solo vive aquí porque Manuales y
// Políticas es el lugar central de documentación de Mesa de Ayuda para
// cualquier sistema interno, no solo para este Assets Manager.
const TOC = [
  { id: 'introduccion', label: '1. Introducción' },
  { id: 'acceso', label: '2. Acceso al sistema' },
  { id: 'historial', label: '3. Historial de constancias' },
  { id: 'documentos', label: '4. Documentos y correo de liberación' },
  { id: 'alertas', label: '5. Módulo de Alertas' },
  { id: 'configuracion', label: '6. Configuración (administrador)' },
  { id: 'push', label: '7. Notificaciones push' },
  { id: 'avisos', label: '8. Avisos automáticos del sistema' },
  { id: 'faq', label: '9. Preguntas frecuentes' },
  { id: 'glosario', label: '10. Glosario' },
];

function Nota({ children }) {
  return (
    <div className={styles.nota}>
      <span className={styles.notaIcon}>📌</span>
      <p>{children}</p>
    </div>
  );
}

function Faq({ q, children }) {
  return (
    <details className={styles.faqItem}>
      <summary>❓ {q}</summary>
      <p>{children}</p>
    </details>
  );
}

export default function ManualGestorConstancias() {
  return (
    <PortalLayout activeNav="manuales">
      <Link to="/mesa-de-ayuda/manuales" className={styles.backLink}>← Volver a Manuales y Políticas</Link>

      <div className={styles.pageCard}>
      <div className={styles.mainCol}>
      <div className={styles.mainHead}>
        <h1>📗 Manual de Usuario — Gestor de Constancias Aduaneras</h1>
        <p>Versión 1.0 · Junio 2026 · SELECT SHOP MB SA DE CV</p>
      </div>

      <section id="introduccion" className={styles.section}>
        <h2>1. Introducción</h2>
        <p>
          El Gestor de Constancias Aduaneras es una aplicación web interna de SELECT SHOP MB SA DE CV
          diseñada para controlar y hacer seguimiento de las constancias de garantía emitidas ante la
          autoridad aduanera. Su propósito principal es evitar que venzan los plazos para solicitar la
          liberación de los recursos en garantía, automatizando los recordatorios y facilitando el
          envío de la documentación al banco.
        </p>
        <p>Con este sistema podrás:</p>
        <ul>
          <li>Consultar el listado completo de constancias con código de colores por urgencia.</li>
          <li>Importar el archivo Excel actualizado del banco para mantener el inventario al día (revisor y administrador).</li>
          <li>Subir y gestionar los documentos de cada constancia (flujo por pasos y por rol).</li>
          <li>Generar y enviar el correo de liberación directamente al banco desde tu buzón de Outlook.</li>
          <li>Recibir recordatorios automáticos por correo, calendario y notificación push.</li>
          <li>Administrar usuarios y roles desde el módulo de Configuración.</li>
        </ul>
        <p className={styles.tableLabel}>Requisitos para acceder</p>
        <ul>
          <li>Computadora, laptop o tablet con acceso a internet.</li>
          <li>Navegador web actualizado (Chrome, Edge, Firefox, Safari).</li>
          <li>Cuenta Microsoft corporativa (se recomienda) o correo y contraseña.</li>
          <li>Que el administrador haya asignado tu rol y activado tu cuenta.</li>
        </ul>
        <table className={styles.table}>
          <thead><tr><th>Rol</th><th>Acceso disponible</th></tr></thead>
          <tbody>
            <tr><td>Operador</td><td>Ver el historial · Subir la copia del pedimento pagado · Recibir recordatorios.</td></tr>
            <tr><td>Revisor</td><td>Todo lo del operador + subir documentos, generar y enviar correo de liberación, ver Alertas.</td></tr>
            <tr><td>Administrador</td><td>Acceso total + gestión de usuarios (activar, cambiar rol, eliminar) en Configuración.</td></tr>
          </tbody>
        </table>
      </section>

      <section id="acceso" className={styles.section}>
        <h2>2. Acceso al sistema</h2>
        <p>La URL del sistema es: <code>gestor-constancias.vercel.app</code></p>

        <p className={styles.tableLabel}>2.1 Iniciar sesión con Microsoft (recomendado)</p>
        <p>Este método usa tu cuenta corporativa de Microsoft 365. No necesitas recordar una contraseña adicional.</p>
        <ol>
          <li>Abre el navegador e ingresa la dirección del sistema.</li>
          <li>Haz clic en el botón "Iniciar sesión con Microsoft".</li>
          <li>Escribe tu correo corporativo (@selectshop.com.mx) y sigue las instrucciones de Microsoft.</li>
          <li>Al volver al sistema, quedarás autenticado automáticamente.</li>
        </ol>
        <Nota>Si es tu primera vez, tu cuenta quedará en estado pendiente hasta que un administrador te asigne un rol y te active.</Nota>

        <p className={styles.tableLabel}>2.2 Iniciar sesión con correo y contraseña</p>
        <p>Método alterno. Usa la pestaña "Acceso con correo" en la pantalla de inicio.</p>
        <ol>
          <li>Escribe tu correo electrónico institucional.</li>
          <li>Escribe tu contraseña.</li>
          <li>Haz clic en "Iniciar sesión".</li>
        </ol>
        <Nota>Si aún no tienes cuenta, usa el enlace "¿Sin cuenta? Crear cuenta" para registrarte. Tu acceso quedará pendiente de aprobación por un administrador.</Nota>

        <p className={styles.tableLabel}>2.3 Cerrar sesión</p>
        <p>Para cerrar sesión de forma segura, haz clic en el ícono o el menú de usuario en la barra lateral y selecciona "Cerrar sesión". El token de sesión expira automáticamente a las 8 horas.</p>

        <p className={styles.tableLabel}>2.4 Cuenta pendiente de aprobación</p>
        <p>Si tras iniciar sesión ves la pantalla "Cuenta pendiente de aprobación", significa que tu cuenta aún no tiene rol asignado. Comunícalo con el administrador del sistema para que active tu acceso.</p>
      </section>

      <section id="historial" className={styles.section}>
        <h2>3. Historial de constancias</h2>
        <p>
          Al entrar al sistema verás el Historial: una tabla con todas las constancias de garantía
          registradas. Las columnas provienen directamente del Excel oficial del banco, incluyendo
          folio, pedimento, importe y fecha de solicitud de devolución (F.Sol.Dev.).
        </p>

        <p className={styles.tableLabel}>3.1 Código de colores por urgencia</p>
        <p>Cada fila se colorea automáticamente según los días restantes a la F.Sol.Dev.:</p>
        <table className={styles.table}>
          <thead><tr><th>Color</th><th>Significado</th></tr></thead>
          <tbody>
            <tr><td>Rojo intenso</td><td>Vence hoy — acción inmediata requerida.</td></tr>
            <tr><td>Rojo claro</td><td>Faltan 1 a 3 días.</td></tr>
            <tr><td>Ámbar / amarillo</td><td>Faltan 4 a 10 días.</td></tr>
            <tr><td>Verde</td><td>Constancia ya pagada — no requiere acción.</td></tr>
            <tr><td>Blanco / neutro</td><td>Sin urgencia inmediata o vencida.</td></tr>
          </tbody>
        </table>

        <p className={styles.tableLabel}>3.2 Búsqueda y filtrado</p>
        <p>En la parte superior de la tabla encontrarás una barra de búsqueda. Puedes filtrar las constancias por:</p>
        <ul>
          <li>Folio de la constancia.</li>
          <li>Número de pedimento.</li>
          <li>Razón social.</li>
          <li>Estatus (PENDIENTE / PAGADO).</li>
        </ul>

        <p className={styles.tableLabel}>3.3 Importar el Excel del banco</p>
        <p>Cuando el banco envíe una versión actualizada del listado, impórtala para mantener el historial al día. El sistema detecta automáticamente las columnas.</p>
        <Nota>Esta acción está disponible solo para el revisor y el administrador. El operador no ve el botón de importación.</Nota>
        <ol>
          <li>Haz clic en el botón "Importar Excel" o el área de carga.</li>
          <li>Selecciona el archivo .xlsx enviado por el banco.</li>
          <li>El sistema procesa el contenido y actualiza el listado de constancias.</li>
        </ol>
        <Nota>Si el archivo tiene columnas nuevas, se agregarán automáticamente. Si faltan columnas, el sistema se ajusta sin requerir cambios.</Nota>

        <p className={styles.tableLabel}>3.4 Marcar constancia como pagada</p>
        <p>Cuando se confirme el pago de una constancia, el revisor o administrador puede marcarla como PAGADO. La fila se pondrá verde y se desactivarán los botones de correo y calendario para esa constancia.</p>
        <ol>
          <li>Ubica la constancia en la tabla.</li>
          <li>Haz clic en el botón de estatus (PENDIENTE / PAGADO) en la columna correspondiente.</li>
          <li>La fila cambiará a color verde y quedará marcada como pagada.</li>
        </ol>
      </section>

      <section id="documentos" className={styles.section}>
        <h2>4. Documentos y correo de liberación</h2>
        <p>
          Cada constancia requiere tres documentos antes de poder enviar el correo de liberación al
          banco. El proceso es secuencial y por rol: cada paso habilita el siguiente.
        </p>

        <p className={styles.tableLabel}>4.1 Flujo de documentos (tres pasos, dos roles)</p>
        <table className={styles.table}>
          <thead><tr><th>Paso</th><th>Quién</th><th>Documento</th><th>Efecto al subir</th></tr></thead>
          <tbody>
            <tr><td>1</td><td>Revisor</td><td>Formato de Liberación firmada (pdf1)</td><td>El operador recibe una notificación push y un correo para que suba su documento.</td></tr>
            <tr><td>2</td><td>Operador</td><td>Copia del pedimento pagado (pdf3)</td><td>El revisor / administrador recibe notificación push y correo para generar el correo de liberación.</td></tr>
            <tr><td>3</td><td>Revisor</td><td>Constancia de garantía (pdf2) + generar correo</td><td>Se crea el borrador en el buzón del revisor o se envía directamente al banco.</td></tr>
          </tbody>
        </table>
        <Nota>Los documentos se identifican internamente como pdf1, pdf2 y pdf3, pero NO van en ese orden numérico. Sigue siempre el flujo de 3 pasos descrito arriba.</Nota>

        <p className={styles.tableLabel}>4.2 Paso 1 — Revisor: subir el Formato de Liberación</p>
        <ol>
          <li>En el Historial, haz clic en el botón "Generar correo" de la constancia correspondiente.</li>
          <li>Se abre la ventana de documentos. Verás tres slots: Formato firmado, Pedimento pagado y Constancia.</li>
          <li>En el slot "Formato de Liberación firmada", arrastra el PDF a la zona marcada o haz clic para seleccionarlo.</li>
          <li>Antes de guardar, puedes pulsar "Vista previa" para abrir el PDF en una pestaña nueva y confirmar que es el archivo correcto.</li>
          <li>Al guardarlo, el operador recibirá automáticamente un push y un correo con tu nombre indicando que puede proceder.</li>
        </ol>

        <p className={styles.tableLabel}>4.3 Paso 2 — Operador: subir la Copia del pedimento pagado</p>
        <p>El operador verá el botón "Subir PDF" en la fila de las constancias que ya tienen el Formato firmado. El slot de la Constancia de garantía no estará disponible hasta que el operador haya subido su documento.</p>
        <ol>
          <li>En el Historial, haz clic en "Subir PDF" en la constancia correspondiente.</li>
          <li>En el slot "Copia del pedimento pagado", arrastra el PDF a la zona marcada o haz clic para seleccionarlo.</li>
          <li>Antes de guardar, pulsa "Vista previa" para abrir el PDF y verificar que adjuntaste el documento correcto.</li>
          <li>Al guardarlo, el revisor y el administrador recibirán un push y un correo con tu nombre.</li>
        </ol>

        <p className={styles.tableLabel}>4.4 Paso 3 — Revisor: subir la Constancia y generar el correo</p>
        <ol>
          <li>Con los dos documentos anteriores ya guardados, abre la ventana de documentos de esa constancia.</li>
          <li>Arrastra la Constancia de garantía a la zona del slot (o haz clic para seleccionarla) y, si quieres, revísala con "Vista previa".</li>
          <li>Haz clic en "Generar correo" para crear el borrador en tu buzón de Outlook, o en "Enviar ahora" para enviarlo directamente al banco.</li>
        </ol>

        <p className={styles.tableLabel}>4.5 Borrador vs. Enviar ahora</p>
        <table className={styles.table}>
          <thead><tr><th>Opción</th><th>Qué hace</th></tr></thead>
          <tbody>
            <tr><td>Generar borrador (Abrir en Outlook)</td><td>Crea el correo en tu bandeja de borradores de Outlook con los tres PDFs adjuntos. Puedes revisarlo, editarlo y enviarlo desde Outlook cuando estés listo.</td></tr>
            <tr><td>Enviar ahora</td><td>Envía el correo directamente al banco (cuentaaduanera.mx@bbva.com) con copia automática a tesorería. No requiere que abras Outlook.</td></tr>
          </tbody>
        </table>
        <Nota>El correo de liberación siempre incluye en copia (CC) a tesoreria@selectshop.com.mx y tesoreria.2@selectshop.com.mx. Esto es automático.</Nota>

        <p className={styles.tableLabel}>4.6 Quitar o reemplazar un documento</p>
        <p>Si se subió un archivo equivocado, el revisor o administrador puede quitarlo desde la ventana de documentos.</p>
        <ol>
          <li>Abre la ventana de documentos de esa constancia.</li>
          <li>Haz clic en el botón "Quitar" debajo del documento incorrecto.</li>
          <li>Confirma la acción en el cuadro de diálogo.</li>
          <li>Vuelve a subir el archivo correcto en el mismo slot.</li>
        </ol>
        <Nota>
          El operador puede seleccionar y cancelar su archivo antes de guardar. Una vez que pulsa
          «Guardar documento», el botón «Subir PDF» queda deshabilitado para él y ya no puede
          reemplazar ni eliminar su documento. Solo el revisor o el administrador pueden quitarlo.
        </Nota>
      </section>

      <section id="alertas" className={styles.section}>
        <h2>5. Módulo de Alertas</h2>
        <p>
          El módulo de Alertas está disponible para revisores y administradores. Muestra en tarjetas
          las constancias que vencen en los próximos 30 días, ordenadas por urgencia. Accede desde el
          menú lateral.
        </p>

        <p className={styles.tableLabel}>5.1 Radar de vencimientos</p>
        <p>Cada tarjeta muestra el folio, el pedimento, la fecha de solicitud de devolución y los días restantes. El mismo código de colores del Historial indica la urgencia.</p>

        <p className={styles.tableLabel}>5.2 Enviar recordatorio manual</p>
        <p>Puedes disparar manualmente el correo de recordatorio para una constancia específica sin esperar al proceso automático.</p>
        <ol>
          <li>Ubica la tarjeta de la constancia en el módulo de Alertas.</li>
          <li>Haz clic en "Vista previa" para ver el correo que se enviará.</li>
          <li>Haz clic en "Enviar recordatorio" para mandarlo de inmediato.</li>
        </ol>
        <p>El correo llegará a todos los usuarios activos con rol revisor, operador o administrador.</p>

        <p className={styles.tableLabel}>5.3 Agendar en calendario (manual)</p>
        <p>Si el evento de calendario no se agendó automáticamente, puedes hacerlo de forma manual desde la tarjeta de la constancia.</p>
        <ol>
          <li>Haz clic en el botón "Cal." o "Calendario" en la tarjeta correspondiente.</li>
          <li>El sistema creará el evento de vencimiento en el calendario de Outlook de todos los usuarios activos.</li>
        </ol>
        <Nota>El calendario se llena automáticamente cuando faltan 30 días o menos. El botón manual es solo un respaldo por si el scheduler no lo hizo.</Nota>

        <p className={styles.tableLabel}>5.4 Verificar conexión con Microsoft 365 (solo administrador)</p>
        <p>Esta función permite comprobar que la integración con Microsoft 365 (correo, calendario, SSO) esté funcionando correctamente. Solo es visible para administradores.</p>
        <ol>
          <li>Ve a Configuración → sección "Microsoft Graph API" → botón "Verificar conexión".</li>
          <li>El sistema mostrará un mensaje en verde (✓ Conexión activa) o en rojo (✗ Error) con el detalle.</li>
        </ol>
        <Nota>Si la verificación falla, puede ser que el secret de Azure haya caducado. Comunícalo con el administrador de sistemas.</Nota>
      </section>

      <section id="configuracion" className={styles.section}>
        <h2>6. Configuración (solo administrador)</h2>
        <p>
          El módulo de Configuración es exclusivo para administradores. Permite gestionar los usuarios
          del sistema: asignar roles, activar o desactivar cuentas y eliminar usuarios. Accede desde el
          menú lateral.
        </p>

        <p className={styles.tableLabel}>6.1 Gestión de usuarios</p>
        <p>La tabla de usuarios muestra el nombre, correo, rol actual y estado (activo / inactivo) de cada cuenta registrada.</p>
        <ol>
          <li>Ve al menú lateral y haz clic en "Configuración".</li>
          <li>La tabla de usuarios aparece en la parte superior de la página.</li>
          <li>Haz clic en "Recargar lista" para ver el estado más reciente.</li>
        </ol>

        <p className={styles.tableLabel}>6.2 Asignar o cambiar el rol de un usuario</p>
        <ol>
          <li>Ubica al usuario en la tabla.</li>
          <li>En la columna "Rol", despliega el menú y selecciona el rol correcto: operador, revisor o admin.</li>
          <li>El cambio se guarda automáticamente.</li>
        </ol>
        <Nota>Una cuenta nueva queda con el estado "— pendiente —" hasta que le asignes un rol. Sin rol, el usuario solo verá la pantalla de "Cuenta pendiente de aprobación".</Nota>

        <p className={styles.tableLabel}>6.3 Activar o desactivar un usuario</p>
        <p>El interruptor en la columna "Activo" controla si el usuario puede acceder al sistema.</p>
        <ol>
          <li>Haz clic en el interruptor del usuario para alternarlo (encendido / apagado).</li>
          <li>Un usuario desactivado no puede iniciar sesión aunque tenga credenciales válidas.</li>
        </ol>
        <Nota>Desactivar un usuario es preferible a eliminarlo cuando necesitas suspender el acceso temporalmente sin perder su registro.</Nota>

        <p className={styles.tableLabel}>6.4 Eliminar un usuario</p>
        <ol>
          <li>Haz clic en el botón "Eliminar" en la fila del usuario.</li>
          <li>Confirma la acción en el cuadro de diálogo.</li>
        </ol>
        <Nota>La eliminación es permanente. Si solo quieres suspender el acceso, usa "Desactivar" en su lugar.</Nota>
      </section>

      <section id="push" className={styles.section}>
        <h2>7. Notificaciones push</h2>
        <p>
          Las notificaciones push avisan en el navegador sobre vencimientos próximos y sobre el avance
          del flujo de documentos (por ejemplo, cuando el operador sube su PDF). Funcionan aunque la
          pestaña del sistema esté cerrada, siempre que el navegador esté abierto.
        </p>

        <p className={styles.tableLabel}>7.1 Activar notificaciones</p>
        <ol>
          <li>Al acceder al sistema por primera vez, el navegador pedirá permiso para enviar notificaciones.</li>
          <li>Haz clic en "Permitir" en el cuadro de diálogo del navegador.</li>
          <li>Listo. Recibirás los avisos automáticamente.</li>
        </ol>
        <Nota>
          Si accidentalmente hiciste clic en "Bloquear", deberás restablecer el permiso manualmente:
          en el ícono del candado en la barra de dirección del navegador → Notificaciones → Permitir.
          Las ventanas de incógnito no guardan permisos; abre el sistema en una ventana normal.
        </Nota>

        <p className={styles.tableLabel}>7.2 Qué notificaciones recibirás</p>
        <table className={styles.table}>
          <thead><tr><th>Notificación</th><th>Cuándo llega</th><th>A quién</th></tr></thead>
          <tbody>
            <tr><td>Recordatorio de vencimiento</td><td>A 10 días, 3 días y el día mismo de la F.Sol.Dev.</td><td>Todos los usuarios con notificaciones activas.</td></tr>
            <tr><td>Documento listo (paso 1 → 2)</td><td>Cuando el revisor sube el Formato de Liberación.</td><td>Usuarios con rol operador.</td></tr>
            <tr><td>Documento listo (paso 2 → 3)</td><td>Cuando el operador sube la Copia del pedimento.</td><td>Usuarios con rol revisor y administrador.</td></tr>
            <tr><td>Alerta de conexión Microsoft 365</td><td>Si la verificación diaria falla (posible caducidad del secret de Azure).</td><td>Solo administradores.</td></tr>
          </tbody>
        </table>
      </section>

      <section id="avisos" className={styles.section}>
        <h2>8. Avisos automáticos del sistema</h2>
        <p>
          El sistema ejecuta un proceso automático todos los días a las 10:00 AM hora México
          (scheduler) que revisa los vencimientos. No es necesario hacer nada para que estos avisos
          lleguen; ocurren de forma transparente en segundo plano.
        </p>
        <table className={styles.table}>
          <thead><tr><th>Canal</th><th>Hitos de envío</th><th>Destinatarios</th><th>Nota</th></tr></thead>
          <tbody>
            <tr>
              <td>Correo electrónico</td>
              <td>A ~10 días y a ~3 días de la F.Sol.Dev. (una vez por hito). Se envían a las 10:00 AM hora México.</td>
              <td>Todos los usuarios activos con rol revisor, operador o administrador.</td>
              <td>El día del vencimiento no se envía correo; lo cubren el calendario y el push.</td>
            </tr>
            <tr>
              <td>Evento de calendario (Outlook)</td>
              <td>Una sola vez cuando faltan 30 días o menos.</td>
              <td>Todos los usuarios activos con cuenta Microsoft + el buzón del sistema.</td>
              <td>Incluye el monto de la constancia y un aviso un día antes.</td>
            </tr>
            <tr>
              <td>Notificación push</td>
              <td>A 10 días, 3 días y el día del vencimiento (una vez por hito).</td>
              <td>Todos los usuarios con notificaciones activadas en el navegador.</td>
              <td>Canal independiente del correo; llega aunque la app esté cerrada.</td>
            </tr>
          </tbody>
        </table>
        <Nota>Los avisos no se duplican: el sistema lleva un registro de qué recordatorios ya se enviaron para cada constancia.</Nota>
      </section>

      <section id="faq" className={styles.section}>
        <h2>9. Preguntas frecuentes</h2>
        <Faq q='¿Por qué veo la pantalla "Cuenta pendiente de aprobación"?'>
          Tu cuenta está registrada pero el administrador aún no te ha asignado un rol ni ha activado
          tu acceso. Comunícalo con el administrador (Lilly o Bruno) para que te configuren.
        </Faq>
        <Faq q="¿Por qué no me llegan notificaciones push?">
          Las causas más comunes son: (1) bloqueaste el permiso de notificaciones en el navegador —
          restáblecelo desde el ícono del candado en la barra de dirección; (2) estás usando una
          ventana de incógnito, que no guarda permisos ni suscripciones; (3) el navegador no está
          abierto (el push llega al navegador, no al teléfono).
        </Faq>
        <Faq q="¿Por qué no llega el correo de recordatorio?">
          Verifica que tu usuario esté activo y tenga el rol revisor, operador o administrador en
          Configuración. Los correos se envían a las 10:00 AM hora México a usuarios activos con esos
          roles. Si todo está correcto y aun así no llega, el administrador puede usar "Verificar
          conexión" en Configuración para revisar el estado de la integración con Microsoft 365.
        </Faq>
        <Faq q="¿Puedo subir un PDF de un paso que no me corresponde?">
          No. El sistema muestra solo el slot que le corresponde a tu rol en el paso en que se
          encuentra el flujo. El operador solo puede subir la Copia del pedimento (paso 2) y solo
          cuando el revisor ya subió el Formato firmado (paso 1).
        </Faq>
        <Faq q="Subí un archivo equivocado. ¿Cómo lo corrijo?">
          Abre la ventana de documentos de esa constancia y usa el botón "Quitar" bajo el archivo
          incorrecto. Luego vuelve a subir el archivo correcto en el mismo slot.
        </Faq>
        <Faq q="¿El correo de liberación se envía desde una cuenta compartida?">
          No. El correo de liberación se envía desde el buzón del revisor o administrador que está
          operando el sistema en ese momento. El banco recibirá el correo desde tu cuenta corporativa
          de Outlook.
        </Faq>
        <Faq q="¿Por qué en el correo de liberación aparecen dos destinatarios en CC?">
          El sistema incluye automáticamente en copia a tesoreria@selectshop.com.mx y
          tesoreria.2@selectshop.com.mx en todos los correos enviados al banco. Esto es parte del
          proceso estándar y no puede desactivarse desde la interfaz.
        </Faq>
        <Faq q="¿Puedo acceder desde el celular?">
          Sí, la interfaz es responsiva y se adapta a pantallas pequeñas. Sin embargo, para mayor
          comodidad en el manejo de archivos PDF y el trabajo diario, se recomienda usar una
          computadora o laptop.
        </Faq>
        <Faq q="¿Qué pasa si no agendo el evento de calendario y el scheduler tampoco lo hizo?">
          Puedes agendarlo manualmente desde el módulo de Alertas. Ubica la constancia en la tarjeta de
          vencimientos y haz clic en el botón "Cal." para crear el evento en Outlook de forma
          inmediata.
        </Faq>
        <Faq q="La verificación de conexión con Microsoft 365 muestra un error. ¿Qué hago?">
          Avisa al administrador de sistemas (área de TI). Puede indicar que el secret de Azure ha
          caducado (vigencia de 2 años) y requiere renovación. Mientras tanto, las demás funciones del
          sistema (historial, documentos) seguirán operando con normalidad.
        </Faq>
      </section>

      <section id="glosario" className={styles.section}>
        <h2>10. Glosario</h2>
        <dl className={styles.glossary}>
          <dt>Constancia de garantía</dt>
          <dd>Certificado de depósito emitido ante la autoridad aduanera como garantía de pago de impuestos. Tiene una fecha límite para solicitar su liberación al banco.</dd>
          <dt>F.Sol.Dev. (Fecha de Solicitud de Devolución)</dt>
          <dd>Fecha límite para presentar ante el banco la solicitud de liberación de los recursos en garantía. Es la fecha base de todos los cálculos y recordatorios del sistema.</dd>
          <dt>Folio</dt>
          <dd>Número único que identifica cada constancia dentro del sistema. Aparece en las notificaciones, en el nombre de los documentos adjuntos y en el correo de liberación.</dd>
          <dt>Pedimento</dt>
          <dd>Número oficial del pedimento aduanero asociado a la constancia (15 dígitos). Se usa en el cuerpo del correo de liberación al banco.</dd>
          <dt>Correo de liberación</dt>
          <dd>Correo electrónico que se envía al banco (BBVA, cuentaaduanera.mx@bbva.com) con los tres documentos PDF adjuntos para solicitar la liberación de la garantía.</dd>
          <dt>Borrador (Draft)</dt>
          <dd>Copia del correo de liberación guardada en el buzón de Outlook del usuario para revisión antes del envío definitivo.</dd>
          <dt>Scheduler</dt>
          <dd>Proceso automático que corre en el servidor todos los días a las 10:00 AM hora México y envía los recordatorios de vencimiento por correo, agenda eventos de calendario y dispara notificaciones push.</dd>
          <dt>Notificación push</dt>
          <dd>Aviso que aparece en el navegador web (y en la barra de tareas del sistema operativo) sin necesidad de tener la aplicación abierta en ese momento. Requiere que el usuario haya otorgado permiso.</dd>
          <dt>Microsoft Graph API</dt>
          <dd>Servicio de Microsoft que permite al sistema enviar correos, crear borradores y agendar eventos en el calendario de Outlook usando las cuentas corporativas de Microsoft 365.</dd>
          <dt>SSO (Single Sign-On)</dt>
          <dd>Inicio de sesión único mediante la cuenta corporativa de Microsoft 365. Permite acceder al sistema con las mismas credenciales de Outlook y el portal de empresa, sin una contraseña adicional.</dd>
          <dt>Azure AD / Azure Active Directory</dt>
          <dd>Servicio de identidad y acceso de Microsoft donde están registradas las cuentas corporativas y la aplicación del sistema. Gestiona la autenticación SSO y los permisos de la API.</dd>
          <dt>Rol</dt>
          <dd>Nivel de acceso asignado a cada usuario: operador, revisor o administrador. Determina qué funciones y módulos puede usar.</dd>
          <dt>Importe inicial / Importe vigente</dt>
          <dd>Monto de la garantía. El importe inicial es el registrado al ingresar la constancia; el vigente refleja el saldo actualizado. El sistema usa el vigente para los recordatorios y el inicial como respaldo si el vigente está en cero.</dd>
        </dl>
      </section>
      </div>

      <aside className={styles.tocSidebar}>
        <p className={styles.tocTitle}>📋 Tabla de contenido</p>
        <ul>
          {TOC.map((t) => (
            <li key={t.id}><a href={`#${t.id}`}>{t.label}</a></li>
          ))}
        </ul>
      </aside>
      </div>
    </PortalLayout>
  );
}
