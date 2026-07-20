import { Link } from 'react-router-dom';
import PortalLayout from '../components/PortalLayout';
import styles from './ManualMesaDeAyuda.module.css';

// Mismo formato que los demás manuales de usuario de la empresa (ver
// Manual_Usuario_GestorConstancias.docx, compartido como referencia): tabla
// de contenido, secciones numeradas, notas 📌, preguntas frecuentes y
// glosario al final — adaptado a web (anclas en vez de tabla de Word) y con
// el contenido real de ESTA app, no una traducción genérica del formato.
const TOC = [
  { id: 'introduccion', label: '1. Introducción' },
  { id: 'acceso', label: '2. Acceso al sistema' },
  { id: 'pantalla-principal', label: '3. Pantalla principal' },
  { id: 'reportar-ticket', label: '4. Reportar un problema (ticket)' },
  { id: 'mis-tickets', label: '5. Mis tickets' },
  { id: 'mis-solicitudes', label: '6. Mis solicitudes' },
  { id: 'faq', label: '7. Preguntas frecuentes' },
  { id: 'glosario', label: '8. Glosario' },
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

export default function ManualMesaDeAyuda() {
  return (
    <PortalLayout activeNav="manuales">
      <Link to="/manuales" className={styles.backLink}>← Volver a Manuales y Políticas</Link>

      <div className={styles.mainHead}>
        <h1>📘 Manual de Usuario — Mesa de Ayuda</h1>
        <p>Versión 1.0 · Julio 2026 · SELECT SHOP MB SA DE CV</p>
      </div>

      <div className={styles.tocBox}>
        <p className={styles.tocTitle}>📋 Tabla de contenido</p>
        <ul>
          {TOC.map((t) => (
            <li key={t.id}><a href={`#${t.id}`}>{t.label}</a></li>
          ))}
        </ul>
      </div>

      <section id="introduccion" className={styles.section}>
        <h2>1. Introducción</h2>
        <p>
          Mesa de Ayuda es el punto de entrada único para pedir soporte y recursos al área de
          Sistemas IT &amp; BI de Select Shop MB: reportar algo que no funciona, pedir acceso a un
          sistema o correo, pedir un equipo o servicio nuevo, y — si tienes el permiso — dar de
          alta a un nuevo ingreso. Todo queda registrado con folio y puedes darle seguimiento
          desde el mismo portal.
        </p>
        <p>Con este sistema puedes:</p>
        <ul>
          <li>Buscar tu problema en tus propias palabras y que el portal te lleve directo a dónde reportarlo.</li>
          <li>Reportar un ticket de soporte (hardware, software, aplicaciones, red, impresoras, cuenta/acceso, ERP, seguridad u otro).</li>
          <li>Seguir la conversación de cada ticket, adjuntar imágenes y calificar la atención recibida.</li>
          <li>Pedir acceso a Gmail, plataformas de venta o el ERP; pedir equipo, accesorios, línea telefónica o software.</li>
          <li>Ver el estatus de todo lo que has pedido (tickets y solicitudes) en un solo lugar.</li>
        </ul>
        <p className={styles.tableLabel}>Requisitos para acceder</p>
        <ul>
          <li>Computadora, laptop o celular con acceso a internet.</li>
          <li>Navegador web actualizado (Chrome, Edge, Firefox, Safari).</li>
          <li>Tu correo corporativo (@selectshop.com.mx) o tu número de empleado.</li>
          <li>Ser un empleado activo en el sistema — nadie te da de alta a mano, tú mismo activas tu cuenta la primera vez (ver sección 2).</li>
        </ul>
      </section>

      <section id="acceso" className={styles.section}>
        <h2>2. Acceso al sistema</h2>
        <p>La Mesa de Ayuda vive dentro del Assets Manager, en <code>/mesa-de-ayuda</code>.</p>

        <p className={styles.tableLabel}>2.1 Primera vez (activar tu cuenta)</p>
        <ol>
          <li>Escribe tu correo corporativo o tu número de empleado y pulsa "Continuar".</li>
          <li>Si el sistema no te reconoce todavía como usuario activado, te pedirá crear una contraseña (mínimo 6 caracteres, dos veces para confirmarla).</li>
          <li>Al confirmar, quedas dentro automáticamente — no hace falta que nadie de Sistemas te dé de alta a mano.</li>
        </ol>

        <p className={styles.tableLabel}>2.2 Ya tienes cuenta (iniciar sesión)</p>
        <ol>
          <li>Escribe tu correo corporativo o tu número de empleado.</li>
          <li>Escribe tu contraseña y listo.</li>
        </ol>
        <Nota>
          No hace falta escribir "@selectshop.com.mx" — si no pones "@" y no son puros números, el
          sistema completa el dominio solo. Tu sesión dura 30 días; no tendrás que volver a
          iniciar sesión cada vez que entres.
        </Nota>

        <p className={styles.tableLabel}>2.3 Cerrar sesión</p>
        <p>Desde el menú de tu usuario, abajo del todo en la barra lateral, pulsa "Cerrar sesión".</p>
      </section>

      <section id="pantalla-principal" className={styles.section}>
        <h2>3. Pantalla principal — "¿Qué necesitas?"</h2>
        <p>
          Al entrar ves un buscador y un conjunto de tarjetas — cada una te lleva directo al
          formulario correspondiente, sin pasos intermedios.
        </p>

        <p className={styles.tableLabel}>3.1 Buscador</p>
        <p>
          Escribe tu problema en tus propias palabras (ej. "no me funciona la impresora",
          "necesito un mouse", "olvidé mi contraseña") y el sistema te sugiere hasta 5 resultados,
          del más específico al más general. Si encuentra el problema exacto, el resultado te
          lleva directo al formulario de ticket con ese problema ya elegido — no tienes que volver
          a navegar las categorías.
        </p>

        <p className={styles.tableLabel}>3.2 Las tarjetas</p>
        <ul>
          <li><strong>Acceso a un sistema o correo</strong> — Gmail, una plataforma de venta o el ERP.</li>
          <li><strong>Equipo, accesorio o servicio</strong> — monitor, mouse, línea telefónica, software o licencia nuevos.</li>
          <li><strong>Alta de un nuevo ingreso</strong> — solo la ve quien tiene permiso de RH.</li>
          <li><strong>Tengo un problema o algo no funciona</strong> — reportar un ticket (ver sección 4).</li>
          <li><strong>Manuales y Políticas</strong> — donde estás leyendo esto ahora mismo.</li>
        </ul>
        <Nota>
          Las tres primeras tarjetas son Solicitudes (pides algo nuevo), no tickets — no tienen
          conversación ni seguimiento en tiempo real como los tickets, pero sí puedes ver su
          estatus en "Mis solicitudes" (sección 6).
        </Nota>

        <p className={styles.tableLabel}>3.3 Tus tickets recientes</p>
        <p>
          Debajo de las tarjetas hay una vista rápida de tus últimos 5 tickets con su folio,
          asunto, estatus y fecha. Pulsa cualquier renglón o "Ver todos mis tickets" para ir a tu
          historial completo (sección 5).
        </p>
      </section>

      <section id="reportar-ticket" className={styles.section}>
        <h2>4. Reportar un problema (ticket)</h2>
        <p>
          Es un asistente de varios pasos: primero eliges la categoría, después el problema
          específico, y al final llenas los datos del ticket.
        </p>

        <p className={styles.tableLabel}>4.1 Paso 1 — elige la categoría</p>
        <p>Las categorías están agrupadas por sección, para que sea más fácil ubicar la tuya:</p>
        <ul>
          <li><strong>Tu equipo</strong> — Hardware, Accesorios.</li>
          <li><strong>Programas y sistemas</strong> — Software, Aplicaciones, ERP.</li>
          <li><strong>Conexión e impresión</strong> — Red / Conectividad, Impresoras.</li>
          <li><strong>Cuentas y seguridad</strong> — Cuenta / Acceso, Seguridad.</li>
          <li><strong>Otro</strong> — cualquier cosa que no encaje arriba.</li>
        </ul>

        <p className={styles.tableLabel}>4.2 ¿Computadora o celular?</p>
        <p>
          Al elegir Hardware, Software o Red / Conectividad, el sistema te pregunta si es sobre
          una computadora (laptop, escritorio o all-in-one) o un celular, y te muestra el catálogo
          de problemas correspondiente. Si no tienes un celular asignado, esa opción ni te
          aparece — el sistema lo revisa contra el equipo que realmente tienes asignado.
        </p>

        <p className={styles.tableLabel}>4.3 Paso 2 — elige el problema específico</p>
        <p>
          Cada categoría tiene su propia lista de problemas comunes (ej. "No enciende o no
          prende", "Olvidé mi contraseña", "Se atora el papel"). Elegir uno concreto ayuda a que
          tu ticket quede clasificado automáticamente con su Nivel de Servicio desde que lo
          reportas (ver sección 5.3) — si de plano no encaja ninguno, siempre hay una opción
          "Otro problema de..." al final de cada lista.
        </p>

        <p className={styles.tableLabel}>4.4 Cuando en realidad no es una falla</p>
        <p>
          Algunos problemas comunes (ej. "No encuentro Word, Excel o PowerPoint en mi
          computadora", "Necesito instalar un programa nuevo") no son una falla — son una
          Solicitud de Recurso, para que la petición quede aprobada antes de instalarse. En esos
          casos el sistema te explica por qué y te da dos salidas: ir a Solicitar Recurso, o
          reportarlo como ticket de todos modos si insistes en que sí es una falla.
        </p>

        <p className={styles.tableLabel}>4.5 Aplicaciones internas con su propio catálogo</p>
        <p>
          Al elegir "Aplicaciones" te aparece la lista de sistemas internos de la empresa. Algunas
          aplicaciones (por ejemplo Solicitud de Pagos, Ventas o el Gestor de Constancias
          Aduaneras) tienen su propio catálogo de apartados y problemas, en vez del formulario
          genérico — porque cada una la atiende un equipo específico (no siempre Sistemas), y así
          tu ticket llega directo a quien te puede ayudar de verdad.
        </p>

        <p className={styles.tableLabel}>4.6 Impresoras</p>
        <p>
          Al reportar un problema de impresora, eliges tu impresora real de una lista agrupada por
          sucursal (modelo y número de serie) en vez de escribirlo a mano. Si no encuentras la
          tuya, hay una opción "Otra / no está en la lista" que te deja describirla con tus propias
          palabras.
        </p>

        <p className={styles.tableLabel}>4.7 Completa el formulario</p>
        <ul>
          <li>Si tienes más de un equipo asignado, eliges sobre cuál es el problema (o "No es sobre un equipo en particular").</li>
          <li><strong>Asunto</strong> (obligatorio) y <strong>Descripción</strong> (opcional, para dar más detalle).</li>
          <li><strong>Adjuntar evidencia</strong> (opcional): una foto o captura de pantalla, o un PDF — hasta 15MB.</li>
        </ul>
        <p>Al enviarlo, recibes tu folio y el ticket aparece de inmediato en "Mis tickets".</p>
      </section>

      <section id="mis-tickets" className={styles.section}>
        <h2>5. Mis tickets</h2>
        <p>
          Tu historial completo, con folio, asunto, estatus y fecha. Pulsa cualquier renglón para
          abrir la conversación completa de ese ticket.
        </p>

        <p className={styles.tableLabel}>5.1 Estatus</p>
        <table className={styles.table}>
          <thead><tr><th>Estatus</th><th>Qué significa</th></tr></thead>
          <tbody>
            <tr><td>Abierto</td><td>Se acaba de reportar, todavía nadie lo ha tomado.</td></tr>
            <tr><td>En proceso</td><td>Sistemas ya lo está atendiendo.</td></tr>
            <tr><td>Resuelto</td><td>Ya tiene una resolución — puedes calificar la atención o seguir escribiendo si el problema sigue.</td></tr>
            <tr><td>Cerrado</td><td>Ya se dio por terminado; si el problema vuelve, reporta un ticket nuevo.</td></tr>
          </tbody>
        </table>

        <p className={styles.tableLabel}>5.2 Nivel de Servicio</p>
        <p>
          Es la prioridad con la que Sistemas atiende tu ticket (Nivel 1, 2 o 3), según el tipo de
          problema. Si elegiste un problema específico en el paso 2, normalmente ya nace
          clasificado; si no, aparece como "Sin clasificar" hasta que alguien de Sistemas lo revise.
          Es de solo lectura para ti.
        </p>

        <p className={styles.tableLabel}>5.3 Seguir la conversación</p>
        <p>
          Cada ticket es una conversación: tu reporte inicial, cualquier mensaje de ida y vuelta con
          Sistemas, y la resolución al final. Puedes seguir escribiendo mensajes y adjuntar
          imágenes en cualquier momento mientras el ticket no esté cerrado. Si escribes un mensaje
          nuevo sobre un ticket ya resuelto, se reabre solo.
        </p>

        <p className={styles.tableLabel}>5.4 Cerrar tu ticket</p>
        <p>
          Cuando el ticket está resuelto, puedes pulsar "Cerrar ticket" si ya no necesitas seguir la
          conversación. Si no lo cierras tú, se cierra solo después de 5 días sin actividad.
        </p>

        <p className={styles.tableLabel}>5.5 Encuesta de satisfacción</p>
        <p>
          Una vez que tu ticket queda resuelto o cerrado, se te pregunta qué tan satisfecho
          quedaste con la atención (de "Extremadamente satisfecho" a "Extremadamente
          insatisfecho"). Solo se responde una vez.
        </p>
      </section>

      <section id="mis-solicitudes" className={styles.section}>
        <h2>6. Mis solicitudes</h2>
        <p>
          Reúne, en una sola tabla ordenada por fecha, todas las Solicitudes de Cuenta, Recurso e
          Ingreso que has enviado — con su folio y estatus:
        </p>
        <table className={styles.table}>
          <thead><tr><th>Estatus</th><th>Qué significa</th></tr></thead>
          <tbody>
            <tr><td>Pendiente</td><td>Todavía nadie la ha revisado.</td></tr>
            <tr><td>Aprobada</td><td>Ya se autorizó y se está gestionando.</td></tr>
            <tr><td>Rechazada</td><td>No procedió — si tienes dudas de por qué, contacta a quien la revisa según el tipo de solicitud.</td></tr>
          </tbody>
        </table>
      </section>

      <section id="faq" className={styles.section}>
        <h2>7. Preguntas frecuentes</h2>
        <Faq q="¿Por qué no encuentro mi problema exacto en la lista?">
          Usa la opción "Otro problema de..." al final de cada categoría — tu ticket se sigue
          reportando igual, solo que sin clasificación automática de Nivel de Servicio.
        </Faq>
        <Faq q="¿Por qué no me aparece la categoría de Celulares?">
          El sistema solo muestra Celulares si tienes un celular asignado a tu nombre. Si crees que
          debería aparecer y no lo hace, repórtalo como "Hardware Computadoras" u "Otro" mientras
          se revisa tu asignación.
        </Faq>
        <Faq q="¿Por qué me manda a Solicitar Recurso en vez de dejarme reportar el ticket?">
          Porque el problema que elegiste (ej. instalar un programa nuevo) en realidad es una
          petición de algo nuevo, no una falla — así queda registrada la solicitud y su aprobación
          en el lugar correcto. Si de verdad es una falla, tienes la opción de reportarlo como
          ticket de todos modos.
        </Faq>
        <Faq q="Reporté un problema de una aplicación interna, ¿a quién le llega?">
          Depende de la aplicación: la mayoría le llega a Sistemas, pero algunas (Solicitud de
          Pagos, Ventas, Gestor de Constancias Aduaneras) tienen su propio equipo responsable
          según el apartado que elegiste — el wizard te lo pregunta antes de llenar el formulario.
        </Faq>
        <Faq q="Mi impresora no está en la lista, ¿qué hago?">
          Elige "Otra / no está en la lista" y descríbela con tus propias palabras (modelo o
          ubicación) en el campo que aparece.
        </Faq>
        <Faq q="¿Por qué mi ticket dice 'Sin clasificar' en Nivel de Servicio?">
          Porque elegiste "Otro problema de..." o el problema que reportaste no tiene una
          clasificación automática — un admin de Sistemas lo clasificará al revisarlo.
        </Faq>
        <Faq q="Ya cerré mi ticket pero el problema volvió, ¿qué hago?">
          Un ticket cerrado ya no admite más mensajes — reporta uno nuevo describiendo que el
          problema volvió a aparecer.
        </Faq>
        <Faq q="¿Puedo usar la Mesa de Ayuda desde mi celular?">
          Sí, la interfaz es responsiva. Para adjuntar fotos de un equipo dañado incluso es más
          cómodo desde el celular.
        </Faq>
      </section>

      <section id="glosario" className={styles.section}>
        <h2>8. Glosario</h2>
        <dl className={styles.glossary}>
          <dt>Folio</dt>
          <dd>Número único que identifica cada ticket o solicitud dentro del sistema.</dd>
          <dt>Ticket</dt>
          <dd>Reporte de un problema o falla, con conversación y seguimiento hasta su resolución.</dd>
          <dt>Solicitud</dt>
          <dd>Petición de algo nuevo (una cuenta, un equipo, un alta de ingreso) — no es una falla.</dd>
          <dt>Nivel de Servicio (SLA)</dt>
          <dd>Prioridad de atención de un ticket (Nivel 1, 2 o 3), asignada según el tipo de problema.</dd>
          <dt>Categoría de Falla</dt>
          <dd>Clasificación interna que usa Sistemas para fijar el Nivel de Servicio y los tiempos límite de atención de un ticket.</dd>
          <dt>Apartado</dt>
          <dd>Sub-catálogo de problemas dentro de una aplicación interna (ej. "Usuarios" dentro de Solicitud de Pagos), cada uno con su propio equipo responsable.</dd>
          <dt>Encuesta de satisfacción (CSAT)</dt>
          <dd>Calificación que das a la atención recibida una vez que tu ticket queda resuelto o cerrado.</dd>
        </dl>
      </section>
    </PortalLayout>
  );
}
