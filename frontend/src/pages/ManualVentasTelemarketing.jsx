import { Link } from 'react-router-dom';
import PortalLayout from '../components/PortalLayout';
// Mismo módulo de estilos que el resto de los manuales — nombres de clase genéricos.
import styles from './ManualMesaDeAyuda.module.css';

// Transcripción fiel de "Manual_Telemarketing_SelectShop.docx" (v1.0 ·
// Junio 2026) — misma app de Ventas que ManualVentasVendedor.jsx, pero
// contada desde el punto de vista del agente de telemarketing (llamadas en
// vez de visitas presenciales).
const TOC = [
  { id: 'introduccion', label: '1. Introducción' },
  { id: 'acceso', label: '2. Acceso al Sistema' },
  { id: 'menu', label: '3. Menú Principal' },
  { id: 'telemarketing', label: '4. Módulo de Telemarketing — Llamadas y Cotizaciones' },
  { id: 'mis-cotizaciones', label: '5. Mis Cotizaciones' },
  { id: 'historial', label: '6. Historial de Llamadas y Visitas' },
  { id: 'catalogo', label: '7. Catálogo de Productos' },
  { id: 'faq', label: '8. Preguntas Frecuentes' },
  { id: 'glosario', label: '9. Glosario de Términos' },
];

function Nota({ children }) {
  return (
    <div className={styles.nota}>
      <span className={styles.notaIcon}>📌</span>
      <p>{children}</p>
    </div>
  );
}

function Tip({ children }) {
  return (
    <div className={styles.nota}>
      <span className={styles.notaIcon}>💡</span>
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

export default function ManualVentasTelemarketing() {
  return (
    <PortalLayout activeNav="manuales">
      <Link to="/mesa-de-ayuda/manuales/ventas" className={styles.backLink}>← Volver a Manual de Ventas</Link>

      <div className={styles.pageCard}>
      <div className={styles.mainCol}>
      <div className={styles.mainHead}>
        <h1>📞 Manual de Telemarketing</h1>
        <p>SelectShop · Ventas App · Versión 1.0 · Junio 2026 · Select Shop MB SA de CV</p>
      </div>

      <section id="introduccion" className={styles.section}>
        <h2>1. Introducción</h2>
        <p>
          La app de ventas SelectShop es el sistema digital de Select Shop MB SA de CV para
          gestionar llamadas comerciales, cotizaciones y seguimiento de clientes desde cualquier
          dispositivo con internet.
        </p>
        <p>Con este sistema tú, como agente de telemarketing, podrás:</p>
        <ul>
          <li>Ver tu lista de clientes de telemarketing con teléfono de contacto.</li>
          <li>Llamar a los clientes directamente desde la app con un solo toque.</li>
          <li>Registrar automáticamente cada llamada realizada con fecha y hora.</li>
          <li>Crear cotizaciones durante o después de una llamada.</li>
          <li>Generar PDFs de cotizaciones y compartirlos por WhatsApp o correo.</li>
          <li>Consultar el historial completo de tus llamadas y sus resultados.</li>
          <li>Buscar productos en el catálogo actualizado.</li>
        </ul>
        <p className={styles.tableLabel}>Requisitos para acceder</p>
        <ul>
          <li>Celular, tablet o computadora con internet.</li>
          <li>Navegador web (Chrome, Edge, Firefox, Safari).</li>
          <li>Correo y contraseña proporcionados por tu administrador.</li>
        </ul>
      </section>

      <section id="acceso" className={styles.section}>
        <h2>2. Acceso al Sistema</h2>
        <p className={styles.tableLabel}>2.1 Iniciar sesión</p>
        <ol>
          <li>Abre tu navegador web e ingresa la dirección: <code>ventas-mobile.vercel.app</code></li>
          <li>Escribe tu correo electrónico institucional.</li>
          <li>Escribe tu contraseña.</li>
          <li>Toca o haz clic en "Iniciar sesión".</li>
          <li>Serás llevado automáticamente al Menú Principal.</li>
        </ol>
        <Nota>Si olvidaste tu contraseña o no puedes entrar, comunícate con el administrador del sistema para restablecer tus credenciales.</Nota>

        <p className={styles.tableLabel}>2.2 Cerrar sesión</p>
        <p>Para cerrar sesión, regresa al Menú Principal y toca el botón "Cerrar Sesión" en la parte inferior de la pantalla.</p>
        <Nota>Siempre cierra sesión al terminar tu turno, especialmente si usas un equipo compartido o público.</Nota>
      </section>

      <section id="menu" className={styles.section}>
        <h2>3. Menú Principal</h2>
        <p>Al iniciar sesión verás el Menú Principal con los módulos disponibles para tu perfil. Los módulos que aparecen dependen de los permisos que asignó el administrador.</p>
        <table className={styles.table}>
          <thead><tr><th>Módulo</th><th>Ícono</th><th>Para qué sirve</th></tr></thead>
          <tbody>
            <tr><td>Telemarketing</td><td>📞</td><td>Tu módulo principal: ver clientes, llamar y crear cotizaciones.</td></tr>
            <tr><td>Cotizaciones</td><td>📋</td><td>Ver el historial completo de tus cotizaciones y su estatus.</td></tr>
            <tr><td>Historial</td><td>📊</td><td>Ver el registro de tus llamadas, resultados y visitas.</td></tr>
            <tr><td>Catálogo</td><td>🧑‍🦽</td><td>Consultar el catálogo completo de productos y precios.</td></tr>
            <tr><td>Clientes</td><td>👥</td><td>Ver la base de datos de clientes asignados.</td></tr>
          </tbody>
        </table>
        <p>En la parte superior verás tu nombre y rol. Para salir, toca "Cerrar Sesión" al pie del menú.</p>
      </section>

      <section id="telemarketing" className={styles.section}>
        <h2>4. Módulo de Telemarketing — Llamadas y Cotizaciones</h2>
        <p>Este es tu módulo principal. Accede tocando "📞 Telemarketing" en el Menú Principal. Muestra la lista de todos tus clientes de telemarketing con sus datos de contacto.</p>

        <p className={styles.tableLabel}>4.1 Buscar un cliente</p>
        <ul>
          <li>Usa la barra de búsqueda para filtrar por nombre o empresa.</li>
          <li>Cada tarjeta muestra: nombre del cliente, empresa y teléfono de contacto.</li>
          <li>Desliza hacia abajo para ver más clientes.</li>
        </ul>
        <Tip>Antes de cada turno, revisa la lista para planear a quién vas a llamar primero.</Tip>

        <p className={styles.tableLabel}>4.2 Realizar una llamada</p>
        <ol>
          <li>Localiza al cliente en la lista.</li>
          <li>Toca el botón "📞 Llamar" en la tarjeta del cliente.</li>
          <li>El sistema abre automáticamente el marcador telefónico de tu dispositivo con el número del cliente.</li>
          <li>Realiza la llamada normalmente.</li>
          <li>Al terminar la llamada y regresar a la app, la llamada queda registrada automáticamente.</li>
        </ol>
        <Nota>La función de llamada automática funciona en celulares y tablets. En computadora, el botón abre la app de teléfono predeterminada (si está configurada). Si no funciona en tu computadora, marca el número manualmente.</Nota>

        <p className={styles.tableLabel}>4.3 Resultado automático de la llamada</p>
        <p>Cuando regresas a la app después de una llamada, el sistema registra la llamada con resultado "contestó" de forma automática. Los posibles resultados son:</p>
        <table className={styles.table}>
          <thead><tr><th>Resultado</th><th>Color</th><th>Significado</th></tr></thead>
          <tbody>
            <tr><td>contestó</td><td>🟢 Verde</td><td>El cliente atendió la llamada.</td></tr>
            <tr><td>no contestó</td><td>🔴 Rojo</td><td>El cliente no respondió.</td></tr>
            <tr><td>cita agendada</td><td>🔵 Azul</td><td>Se acordó una cita o seguimiento con el cliente.</td></tr>
            <tr><td>buzón</td><td>🟡 Amarillo</td><td>La llamada fue al buzón de voz.</td></tr>
          </tbody>
        </table>
        <Nota>El resultado automático siempre se guarda como "contestó". Si la llamada tuvo un resultado diferente (no contestó, buzón, cita), puedes verlo y filtrarlo en el Historial. Habla con tu administrador si necesitas cambiar el resultado registrado.</Nota>

        <p className={styles.tableLabel}>4.4 Registrar el resultado manualmente (historial)</p>
        <p>Si necesitas revisar o consultar el resultado de una llamada, dirígete al módulo Historial (sección 6 de este manual). Ahí puedes ver todas tus llamadas agrupadas por día y filtrarlas por resultado.</p>
        <Tip>Lleva un registro personal (libreta o notas del celular) del resultado de cada llamada durante tu turno para que puedas hacer seguimiento sin depender solo del historial del sistema.</Tip>

        <p className={styles.tableLabel}>4.5 Crear una cotización</p>
        <p>Puedes crear una cotización directamente desde la lista de clientes, durante o después de una llamada:</p>
        <ol>
          <li>Toca el botón "Cotizar" en la tarjeta del cliente.</li>
          <li>En la pantalla de cotización, toca "+ Agregar Productos" para abrir el catálogo.</li>
          <li>Busca los productos por nombre o SKU y tócalos para agregarlos.</li>
          <li>Ajusta las cantidades con los botones + y –.</li>
          <li>Si acuerdas un precio especial, toca el campo de precio del producto para editarlo.</li>
          <li>Selecciona el método de pago y agrega notas si es necesario.</li>
          <li>Toca "Generar Cotización / PDF" para crear y guardar la cotización.</li>
        </ol>
        <Nota>También puedes importar los SKUs de los productos desde un archivo Excel. Toca "Importar Excel" en la pantalla de cotización para cargar la lista de productos de forma masiva.</Nota>

        <p className={styles.tableLabel}>4.6 Tipos de precio disponibles</p>
        <table className={styles.table}>
          <thead><tr><th>Tipo de precio</th><th>Descripción</th></tr></thead>
          <tbody>
            <tr><td>Lista</td><td>Precio estándar del catálogo. Aplica por defecto.</td></tr>
            <tr><td>Distribuidor</td><td>Precio preferencial para distribuidores.</td></tr>
            <tr><td>AAA</td><td>Precio especial para clientes AAA (más bajo). Toca el botón para activarlo y vuelve a tocarlo para desactivarlo.</td></tr>
          </tbody>
        </table>
        <Nota>Si el cliente tiene precios AAA, aparecerá el botón "Precios AAA" en la pantalla de cotización. Al activarlo, todos los productos del carrito toman automáticamente el precio especial.</Nota>

        <p className={styles.tableLabel}>4.7 Método de pago y recargos</p>
        <table className={styles.table}>
          <thead><tr><th>Método</th><th>¿Aplica recargo?</th><th>Notas</th></tr></thead>
          <tbody>
            <tr><td>Efectivo</td><td>No</td><td>Sin recargo.</td></tr>
            <tr><td>Transferencia</td><td>No</td><td>Sin recargo.</td></tr>
            <tr><td>Cheque</td><td>No</td><td>Sin recargo.</td></tr>
            <tr><td>Crédito</td><td>No</td><td>No pide comprobante de pago al finalizar.</td></tr>
            <tr><td>Tarjeta</td><td>Sí (+7%)</td><td>Se agrega automáticamente el 7% al total.</td></tr>
          </tbody>
        </table>
        <Nota>El recargo de tarjeta se muestra claramente en el resumen antes de generar el PDF.</Nota>

        <p className={styles.tableLabel}>4.8 Generar y compartir el PDF</p>
        <p>Al tocar "Generar Cotización":</p>
        <ul>
          <li>El sistema guarda la cotización con un folio único (ej. COT-0042).</li>
          <li>Se genera un PDF con el logo de Select Shop, los productos, precios con IVA y el folio.</li>
          <li>En celular/tablet: se abre el menú para compartir por WhatsApp, correo, etc.</li>
          <li>En computadora: el PDF se descarga o abre en una nueva pestaña.</li>
        </ul>
        <Nota>Los precios en el PDF ya incluyen IVA (16%). El precio del catálogo es la base sin IVA — el sistema lo calcula automáticamente.</Nota>

        <p className={styles.tableLabel}>4.9 Subir comprobante de pago</p>
        <p>Si el cliente paga en el momento (cualquier método excepto Crédito), el sistema pedirá una foto del comprobante:</p>
        <ol>
          <li>Aparece una pantalla pidiendo el comprobante de pago.</li>
          <li>Toca "📷 Tomar foto" o "🖼️ Galería" para seleccionar la imagen.</li>
          <li>Sube la foto del comprobante (ticket, voucher, captura de transferencia).</li>
          <li>Toca "Subir y finalizar". La cotización queda marcada como Aceptada.</li>
        </ol>
        <Nota>Si no tienes el comprobante en ese momento, toca "Omitir por ahora". La cotización quedará en estatus Enviada y podrás actualizar el estatus después.</Nota>
      </section>

      <section id="mis-cotizaciones" className={styles.section}>
        <h2>5. Mis Cotizaciones</h2>
        <p>Accede desde "📋 Cotizaciones" en el Menú Principal. Aquí puedes ver y gestionar todas las cotizaciones que has generado.</p>

        <p className={styles.tableLabel}>5.1 Ver y filtrar cotizaciones</p>
        <p>La pantalla muestra tu lista de cotizaciones. Puedes filtrar por estatus:</p>
        <table className={styles.table}>
          <thead><tr><th>Estatus</th><th>Color</th><th>Significado</th></tr></thead>
          <tbody>
            <tr><td>Borrador</td><td>⚪ Gris</td><td>Cotización guardada, no entregada al cliente todavía.</td></tr>
            <tr><td>Enviada</td><td>🟡 Amarillo</td><td>PDF generado y entregado al cliente, esperando respuesta.</td></tr>
            <tr><td>Aceptada</td><td>🟢 Verde</td><td>Cliente aceptó la cotización.</td></tr>
            <tr><td>Rechazada</td><td>🔴 Rojo</td><td>Cliente no aceptó la cotización.</td></tr>
          </tbody>
        </table>
        <p>Usa la barra de búsqueda para encontrar cotizaciones por nombre del cliente o número de folio.</p>

        <p className={styles.tableLabel}>5.2 Editar una cotización</p>
        <ol>
          <li>Toca la cotización que deseas modificar.</li>
          <li>Toca el botón "Editar".</li>
          <li>Agrega, quita o modifica productos, precios, notas o método de pago.</li>
          <li>Toca "Guardar cambios".</li>
        </ol>
        <Nota>Solo puedes editar cotizaciones en estatus Borrador o Enviada. Las cotizaciones Aceptadas o Rechazadas no pueden editarse.</Nota>

        <p className={styles.tableLabel}>5.3 Eliminar una cotización</p>
        <ol>
          <li>Toca la cotización que deseas eliminar.</li>
          <li>Toca el ícono de papelera (🗑️) o el botón "Eliminar".</li>
          <li>Confirma la eliminación en el cuadro de diálogo.</li>
        </ol>
        <Nota>La eliminación es permanente. Si solo quieres archivar la cotización, cámbiala a estatus Rechazada en lugar de eliminarla.</Nota>
      </section>

      <section id="historial" className={styles.section}>
        <h2>6. Historial de Llamadas y Visitas</h2>
        <p>Accede desde "📊 Historial" en el Menú Principal. Esta pantalla muestra el registro completo de tu actividad: llamadas realizadas y visitas registradas. La pantalla tiene dos pestañas:</p>
        <ul>
          <li>📞 Llamadas — registro de todas tus llamadas con resultado y cliente.</li>
          <li>🚗 Visitas — registro de visitas presenciales (si aplica para tu perfil).</li>
        </ul>

        <p className={styles.tableLabel}>6.1 Ver llamadas registradas</p>
        <p>En la pestaña Llamadas verás tus llamadas agrupadas por día. Cada registro muestra: nombre y empresa del cliente, hora en que se realizó la llamada, y resultado de la llamada.</p>
        <p>En la parte superior encontrarás un resumen del período seleccionado:</p>
        <table className={styles.table}>
          <thead><tr><th>Indicador</th><th>Qué muestra</th></tr></thead>
          <tbody>
            <tr><td>Total</td><td>Número total de llamadas realizadas en el período.</td></tr>
            <tr><td>Contestó</td><td>Cuántos clientes atendieron la llamada.</td></tr>
            <tr><td>Cita agendada</td><td>Cuántas llamadas resultaron en una cita o seguimiento.</td></tr>
            <tr><td>No contestó / Buzón</td><td>Cuántas llamadas no fueron atendidas.</td></tr>
          </tbody>
        </table>

        <p className={styles.tableLabel}>6.2 Filtrar por período y resultado</p>
        <p>Puedes combinar dos tipos de filtro. Por período:</p>
        <table className={styles.table}>
          <thead><tr><th>Período</th><th>Qué muestra</th></tr></thead>
          <tbody>
            <tr><td>Hoy</td><td>Solo las llamadas de hoy.</td></tr>
            <tr><td>Semana</td><td>Llamadas de los últimos 7 días.</td></tr>
            <tr><td>Mes</td><td>Llamadas del mes en curso.</td></tr>
            <tr><td>Todo</td><td>Historial completo sin límite de fecha.</td></tr>
          </tbody>
        </table>
        <p>Y por resultado, con chips de color debajo del resumen: Todos, contestó, cita agendada, no contestó, buzón.</p>
        <Tip>Usa el filtro "cita agendada" cada mañana para identificar rápidamente a los clientes con los que tienes seguimiento pendiente.</Tip>

        <p className={styles.tableLabel}>6.3 Ver visitas en el historial</p>
        <p>La pestaña Visitas muestra el registro de visitas presenciales (si tu perfil lo incluye). Cada visita muestra el nombre del cliente, fecha y hora. Si la visita tiene coordenadas, puedes tocar "📍 Ver en Maps" para ver la ubicación en Google Maps.</p>
      </section>

      <section id="catalogo" className={styles.section}>
        <h2>7. Catálogo de Productos</h2>
        <p>Accede desde "🧑‍🦽 Catálogo" en el Menú Principal. Aquí puedes consultar todos los productos disponibles para venta antes o durante una llamada.</p>
        <p>Funciones disponibles:</p>
        <ul>
          <li>Buscar por nombre, SKU o descripción usando la barra de búsqueda.</li>
          <li>Ver el precio de lista de cada producto.</li>
          <li>Alternar entre vista de tarjetas y vista de tabla para facilitar la consulta.</li>
        </ul>
        <Tip>Ten el catálogo abierto durante tus llamadas para responder preguntas de precios y disponibilidad al instante sin tener que buscar en otro lado.</Tip>
        <Nota>El catálogo es de solo consulta. Para modificar precios o agregar productos, comunícate con el administrador.</Nota>
      </section>

      <section id="faq" className={styles.section}>
        <h2>8. Preguntas Frecuentes</h2>
        <Faq q="¿Por qué el sistema tarda en cargar al abrirlo por primera vez?">
          El servidor puede tardar hasta 30-60 segundos en responder si lleva un rato inactivo. Esto
          es normal en la versión gratuita. Espera un momento y vuelve a intentarlo — una vez activo,
          todo funciona rápido.
        </Faq>
        <Faq q="¿La llamada se registra automáticamente aunque el cliente no conteste?">
          La llamada se registra cuando regresas a la app después de marcar. El resultado automático
          siempre es "contestó". Si el cliente no contestó, el registro queda en el historial pero con
          ese resultado. Habla con el administrador si necesitas cambiar el resultado.
        </Faq>
        <Faq q="¿Puedo hacer la llamada desde la computadora?">
          Depende de la configuración de tu computadora. El botón "Llamar" abre el protocolo tel: que
          activa la app de llamadas de tu sistema (Skype, teléfono de Windows, etc.). Si no tienes una
          app de llamadas configurada, marca el número manualmente.
        </Faq>
        <Faq q="¿Puedo crear una cotización sin haber llamado primero?">
          Sí. Puedes crear cotizaciones directamente desde el módulo de Telemarketing tocando
          "Cotizar" en la tarjeta del cliente, sin necesidad de registrar una llamada primero.
        </Faq>
        <Faq q="¿Los precios en el PDF ya incluyen IVA?">
          Sí. Todos los precios del PDF incluyen el IVA del 16%. El precio que ves en el catálogo es
          el precio base sin IVA — el sistema lo suma automáticamente al generar la cotización.
        </Faq>
        <Faq q="¿Puedo ver cotizaciones de otros agentes?">
          No. Solo puedes ver tus propias cotizaciones. El administrador puede ver las de todo el equipo.
        </Faq>
        <Faq q="¿Qué hago si me equivoqué en una cotización que ya envié al cliente?">
          Ve a Cotizaciones, toca la cotización y presiona Editar. Puedes modificar cotizaciones en
          estatus Borrador o Enviada. Si ya está Aceptada, contacta al administrador.
        </Faq>
        <Faq q="¿Cómo sé cuántas llamadas hice hoy?">
          Ve al Historial → pestaña Llamadas → selecciona el filtro "Hoy". El número grande en la
          parte superior muestra el total de llamadas del día.
        </Faq>
        <Faq q="¿La app funciona en mi celular sin instalar nada?">
          Sí. Solo necesitas el navegador web de tu celular (Chrome, Safari, etc.) y la URL del
          sistema. No se instala ninguna aplicación. Puedes guardar el enlace en tus favoritos o en la
          pantalla de inicio del celular para acceder más rápido.
        </Faq>
        <Faq q="¿Puedo importar una lista de productos desde Excel para una cotización grande?">
          Sí. En la pantalla de cotización, toca "Importar Excel" y selecciona un archivo con los
          códigos SKU de los productos. El sistema carga automáticamente los productos que encuentre
          en el catálogo.
        </Faq>
        <Faq q="¿El botón 'Cotizar' abre la misma pantalla que el de Ventas Foráneas?">
          Sí. La pantalla de cotización es la misma para todos los usuarios — puedes agregar
          productos, elegir precios, método de pago y generar el PDF exactamente igual.
        </Faq>
      </section>

      <section id="glosario" className={styles.section}>
        <h2>9. Glosario de Términos</h2>
        <dl className={styles.glossary}>
          <dt>Aceptada</dt>
          <dd>Estatus de una cotización que el cliente aprobó. Puede tener comprobante de pago subido si el pago fue inmediato.</dd>
          <dt>Borrador</dt>
          <dd>Estatus inicial de una cotización que fue guardada pero aún no se ha generado el PDF ni se ha enviado al cliente.</dd>
          <dt>Buzón</dt>
          <dd>Resultado de una llamada en la que el cliente no contestó y la llamada fue dirigida al buzón de voz.</dd>
          <dt>Carrito</dt>
          <dd>Lista de productos seleccionados dentro de la pantalla de cotización antes de generar el PDF. Puedes agregar, quitar y ajustar cantidades.</dd>
          <dt>Cita agendada</dt>
          <dd>Resultado de llamada que indica que el cliente y el agente acordaron una reunión, llamada de seguimiento o visita posterior.</dd>
          <dt>Contestó</dt>
          <dd>Resultado de llamada que indica que el cliente atendió la llamada. Es el resultado que se registra automáticamente al regresar a la app.</dd>
          <dt>Cotización</dt>
          <dd>Documento formal con los precios ofrecidos al cliente para un conjunto de productos. Tiene un folio único y vigencia definida.</dd>
          <dt>Enviada</dt>
          <dd>Estatus de una cotización cuyo PDF fue generado y entregado al cliente, pendiente de respuesta.</dd>
          <dt>Folio</dt>
          <dd>Número único que identifica cada cotización (ej. COT-0042). Útil para dar seguimiento y referenciar en conversaciones con el cliente.</dd>
          <dt>IVA</dt>
          <dd>Impuesto al Valor Agregado del 16%. Los precios del PDF ya lo incluyen. El catálogo muestra precios sin IVA.</dd>
          <dt>No contestó</dt>
          <dd>Resultado de llamada que indica que el cliente no atendió la llamada y no fue al buzón.</dd>
          <dt>PDF</dt>
          <dd>Documento digital de la cotización que se genera y puede compartirse por WhatsApp, correo u otras aplicaciones.</dd>
          <dt>Precio AAA</dt>
          <dd>Nivel de precio especial (más bajo que lista) para clientes seleccionados. Se activa con el botón "Precios AAA" en la pantalla de cotización.</dd>
          <dt>Precio Distribuidor</dt>
          <dd>Nivel de precio preferencial para clientes distribuidores. Aparece como opción si el cliente tiene ese tipo configurado.</dd>
          <dt>Precio Lista</dt>
          <dd>Precio estándar del catálogo, sin descuentos especiales. Es el precio base que aparece por defecto al cotizar.</dd>
          <dt>Recargo tarjeta</dt>
          <dd>Cargo adicional del 7% sobre el total cuando el cliente paga con tarjeta. El sistema lo calcula automáticamente.</dd>
          <dt>Rechazada</dt>
          <dd>Estatus de una cotización que el cliente no aceptó. Se mantiene en el historial como referencia.</dd>
          <dt>SKU</dt>
          <dd>Código único del producto en el catálogo (Stock Keeping Unit). Sirve para buscar e importar productos por su código exacto.</dd>
          <dt>Vigencia</dt>
          <dd>Número de días que una cotización tiene validez (por defecto 30 días). Después de ese plazo los precios pueden no ser aplicables.</dd>
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
