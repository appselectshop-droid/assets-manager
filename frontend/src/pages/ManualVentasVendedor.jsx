import { Link } from 'react-router-dom';
import PortalLayout from '../components/PortalLayout';
// Mismo módulo de estilos que el manual de Mesa de Ayuda/Gestor de
// Constancias — nombres de clase genéricos, pensados para cualquier manual.
import styles from './ManualMesaDeAyuda.module.css';

// Transcripción fiel de "Manual_Vendedor_SelectShop.docx" (v1.0 · Junio
// 2026) — la app de Ventas (ventas-mobile.vercel.app) es aparte, no vive en
// este repo; se sube aquí por el mismo motivo que Gestor de Constancias:
// Manuales y Políticas es el lugar central de documentación de la empresa.
const TOC = [
  { id: 'introduccion', label: '1. Introducción' },
  { id: 'acceso', label: '2. Acceso al Sistema' },
  { id: 'menu', label: '3. Menú Principal' },
  { id: 'ventas-foraneas', label: '4. Ventas Foráneas — Visitas y Cotizaciones' },
  { id: 'mis-cotizaciones', label: '5. Mis Cotizaciones' },
  { id: 'viaticos', label: '6. Viáticos — Comprobantes de Gastos' },
  { id: 'historial', label: '7. Historial de Visitas' },
  { id: 'catalogo', label: '8. Catálogo de Productos' },
  { id: 'faq', label: '9. Preguntas Frecuentes' },
  { id: 'glosario', label: '10. Glosario de Términos' },
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

export default function ManualVentasVendedor() {
  return (
    <PortalLayout activeNav="manuales">
      <Link to="/mesa-de-ayuda/manuales/ventas" className={styles.backLink}>← Volver a Manual de Ventas</Link>

      <div className={styles.pageCard}>
      <div className={styles.mainHead}>
        <h1>🧑‍💼 Manual del Vendedor Foráneo</h1>
        <p>SelectShop · Ventas App · Versión 1.0 · Junio 2026 · Select Shop MB SA de CV</p>
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
          La app de ventas SelectShop es el sistema digital de Select Shop MB SA de CV para
          gestionar todo el ciclo de ventas en campo: desde la visita al cliente hasta la
          cotización y el registro de gastos de viáticos.
        </p>
        <p>Con este sistema tú, como vendedor, podrás:</p>
        <ul>
          <li>Registrar visitas a clientes con geolocalización automática.</li>
          <li>Crear cotizaciones con el catálogo de productos actualizado.</li>
          <li>Generar y compartir PDFs de cotizaciones directamente desde el celular.</li>
          <li>Subir fotos de comprobantes de pago cuando el cliente acepta en el momento.</li>
          <li>Registrar tus comprobantes de gastos de viáticos (gasolina, comida, casetas, hotel).</li>
          <li>Consultar el historial de tus visitas y llamadas.</li>
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
          <li>Abre tu navegador web e ingresa la dirección del sistema: <code>ventas-mobile.vercel.app</code></li>
          <li>Escribe tu correo electrónico institucional.</li>
          <li>Escribe tu contraseña.</li>
          <li>Toca o haz clic en "Iniciar sesión".</li>
          <li>Serás llevado automáticamente al Menú Principal.</li>
        </ol>
        <Nota>Si olvidaste tu contraseña o no puedes entrar, comunícate con tu administrador para restablecer tus credenciales.</Nota>

        <p className={styles.tableLabel}>2.2 Cerrar sesión</p>
        <p>Para cerrar sesión de forma segura, regresa al Menú Principal y toca el botón "Cerrar Sesión" en la parte inferior de la pantalla.</p>
        <Nota>Siempre cierra sesión cuando termines, especialmente si usas un equipo compartido.</Nota>
      </section>

      <section id="menu" className={styles.section}>
        <h2>3. Menú Principal</h2>
        <p>Al iniciar sesión verás el Menú Principal con tarjetas de acceso rápido a cada módulo. Los módulos que ves dependen de los permisos que te asignó el administrador.</p>
        <table className={styles.table}>
          <thead><tr><th>Módulo</th><th>Ícono</th><th>Para qué sirve</th></tr></thead>
          <tbody>
            <tr><td>Ventas Foráneas</td><td>🧑‍💼</td><td>Ver tus clientes foráneos, iniciar visitas y crear cotizaciones.</td></tr>
            <tr><td>Cotizaciones</td><td>📋</td><td>Ver el historial completo de tus cotizaciones y su estatus.</td></tr>
            <tr><td>Viáticos</td><td>🧾</td><td>Registrar fotos de comprobantes de gastos de viaje.</td></tr>
            <tr><td>Historial</td><td>📊</td><td>Ver el registro de todas tus visitas y llamadas.</td></tr>
            <tr><td>Catálogo</td><td>🧑‍🦽</td><td>Consultar el catálogo completo de productos.</td></tr>
            <tr><td>Clientes</td><td>👥</td><td>Ver la base de datos de clientes.</td></tr>
          </tbody>
        </table>
        <p>En la parte superior de la pantalla verás tu nombre y rol. Para salir, toca "Cerrar Sesión" al pie del menú.</p>
      </section>

      <section id="ventas-foraneas" className={styles.section}>
        <h2>4. Ventas Foráneas — Visitas y Cotizaciones</h2>
        <p>Este es el módulo principal del vendedor foráneo. Desde aquí puedes ver tus clientes asignados, registrar visitas y crear cotizaciones. Accede tocando la tarjeta "🧑‍💼 Ventas Foráneas" en el Menú Principal.</p>

        <p className={styles.tableLabel}>4.1 Buscar y seleccionar un cliente</p>
        <ul>
          <li>Usa la barra de búsqueda en la parte superior para filtrar por nombre o empresa.</li>
          <li>Cada tarjeta de cliente muestra: nombre, empresa, ciudad y teléfono.</li>
          <li>Desliza la lista para ver todos tus clientes.</li>
        </ul>

        <p className={styles.tableLabel}>4.2 Iniciar una visita</p>
        <p>Registra tu presencia en el sitio del cliente antes de cotizar:</p>
        <ol>
          <li>Localiza al cliente en la lista.</li>
          <li>Toca el botón "Iniciar Visita" en la tarjeta del cliente.</li>
          <li>Si el sistema pide permiso de ubicación, acéptalo para que la visita quede geolocalizada.</li>
          <li>Verás una confirmación: "✅ Visita iniciada". A partir de ahí puedes ir a cotizar.</li>
        </ol>
        <Nota>Si tocas directamente el botón "Cotizar", la visita se registra automáticamente. No necesitas iniciarla por separado.</Nota>

        <p className={styles.tableLabel}>4.3 Crear una cotización</p>
        <ol>
          <li>Toca "Cotizar" en la tarjeta del cliente.</li>
          <li>En la pantalla de cotización, toca "+ Agregar Productos" para abrir el catálogo.</li>
          <li>Busca los productos por nombre o SKU. Toca un producto para agregarlo al carrito.</li>
          <li>Ajusta las cantidades en el carrito con los botones + y –.</li>
          <li>Si necesitas cambiar el precio unitario de algún producto, toca el campo de precio y escribe el nuevo valor.</li>
          <li>Elige el método de pago, la vigencia y agrega notas si lo necesitas.</li>
          <li>Toca "Generar Cotización / PDF" para crear el documento y guardarlo en el sistema.</li>
        </ol>
        <Nota>Puedes importar una lista de productos desde Excel (SKUs) en lugar de buscarlos uno a uno. Toca el botón "Importar Excel" para hacerlo.</Nota>

        <p className={styles.tableLabel}>4.4 Tipos de precio disponibles</p>
        <p>El sistema maneja varios niveles de precio según el tipo de cliente. Los botones aparecen automáticamente según lo que esté configurado para ese cliente:</p>
        <table className={styles.table}>
          <thead><tr><th>Tipo de precio</th><th>Descripción</th></tr></thead>
          <tbody>
            <tr><td>Lista</td><td>Precio estándar del catálogo. Aplica por defecto.</td></tr>
            <tr><td>Distribuidor</td><td>Precio preferencial para distribuidores.</td></tr>
            <tr><td>AAA</td><td>Precio especial para clientes AAA (más bajo). Toca el botón para activarlo y vuelve a tocarlo para desactivarlo.</td></tr>
          </tbody>
        </table>
        <Nota>Si el cliente tiene precio AAA configurado, aparecerá el botón "Precios AAA" en la pantalla de cotización. Actívalo para que se apliquen automáticamente los precios especiales a todos los productos del carrito.</Nota>

        <p className={styles.tableLabel}>4.5 Método de pago y recargos</p>
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

        <p className={styles.tableLabel}>4.6 Generar y compartir el PDF</p>
        <p>Al tocar "Generar Cotización":</p>
        <ul>
          <li>El sistema guarda la cotización en la base de datos con un folio único (ej. COT-0042).</li>
          <li>Se genera un PDF con el logo de Select Shop, los productos, precios con IVA incluido y el folio.</li>
          <li>En celular/tablet: se abre el menú para compartir el PDF (WhatsApp, correo, etc.).</li>
          <li>En computadora: el PDF se descarga o abre en una nueva pestaña del navegador.</li>
        </ul>
        <Nota>Los precios en el PDF ya incluyen IVA (16%). El precio que ves en el catálogo es el precio base sin IVA.</Nota>

        <p className={styles.tableLabel}>4.7 Subir comprobante de pago</p>
        <p>Si el cliente paga en el momento (cualquier método excepto Crédito), el sistema te pedirá una foto del comprobante:</p>
        <ol>
          <li>Aparece una pantalla pidiendo la foto del comprobante de pago.</li>
          <li>Toca "📷 Tomar foto" para usar la cámara, o "🖼️ Galería" para seleccionar una imagen existente.</li>
          <li>Selecciona o toma la foto del comprobante (ticket, recibo, voucher, transferencia).</li>
          <li>Toca "Subir y finalizar".</li>
          <li>La cotización queda marcada como Aceptada automáticamente.</li>
        </ol>
        <Nota>Si no tienes el comprobante en ese momento, toca "Omitir por ahora". La cotización quedará como Enviada y podrás actualizar el estatus después.</Nota>
      </section>

      <section id="mis-cotizaciones" className={styles.section}>
        <h2>5. Mis Cotizaciones</h2>
        <p>Accede desde el Menú Principal tocando "📋 Cotizaciones". Aquí puedes ver el historial de todas las cotizaciones que has generado.</p>

        <p className={styles.tableLabel}>5.1 Ver y filtrar cotizaciones</p>
        <p>La pantalla muestra la lista de tus cotizaciones. Puedes filtrar por:</p>
        <table className={styles.table}>
          <thead><tr><th>Filtro</th><th>Qué muestra</th></tr></thead>
          <tbody>
            <tr><td>Todos</td><td>Todas tus cotizaciones sin importar el estatus.</td></tr>
            <tr><td>Borrador</td><td>Cotizaciones guardadas pero no enviadas.</td></tr>
            <tr><td>Enviadas</td><td>Cotizaciones entregadas al cliente, pendientes de respuesta.</td></tr>
            <tr><td>Aceptadas</td><td>Cotizaciones que el cliente aceptó y pagó (o está en proceso).</td></tr>
            <tr><td>Rechazadas</td><td>Cotizaciones que el cliente no aceptó.</td></tr>
          </tbody>
        </table>
        <p>
          También puedes buscar por nombre del cliente o número de folio usando la barra de búsqueda.
          Cada cotización muestra: folio (ej. COT-0042), nombre del cliente y empresa, total con IVA
          incluido, estatus actual y fecha de creación.
        </p>

        <p className={styles.tableLabel}>5.2 Editar una cotización</p>
        <p>Puedes modificar cotizaciones que estén en estatus Borrador o Enviada:</p>
        <ol>
          <li>Toca la cotización en la lista.</li>
          <li>Toca el botón "Editar".</li>
          <li>Agrega, quita o modifica productos, precios, notas o método de pago.</li>
          <li>Toca "Guardar cambios".</li>
        </ol>
        <Nota>Las cotizaciones Aceptadas o Rechazadas no pueden editarse para mantener el historial intacto.</Nota>

        <p className={styles.tableLabel}>5.3 Eliminar una cotización</p>
        <ol>
          <li>Toca la cotización que deseas eliminar.</li>
          <li>Toca el ícono de eliminar (🗑️) o el botón "Eliminar".</li>
          <li>Confirma la eliminación en el cuadro de diálogo.</li>
        </ol>
        <Nota>La eliminación es permanente. Si solo quieres retirar la cotización sin borrarla, cámbiala a estatus Rechazada.</Nota>
      </section>

      <section id="viaticos" className={styles.section}>
        <h2>6. Viáticos — Comprobantes de Gastos</h2>
        <p>
          El módulo de Viáticos te permite registrar fotos de tus comprobantes de gastos de viaje:
          gasolina, comida, casetas, hotel, etc. Accede desde "🧾 Viáticos" en el Menú Principal.
        </p>
        <Nota>Este módulo solo registra los comprobantes fotográficos. El desglose detallado de gastos (monto, categoría, factura) se gestiona en el módulo de Solicitudes cuando el administrador aprueba una solicitud de viáticos.</Nota>

        <p className={styles.tableLabel}>6.1 Tomar foto de un comprobante</p>
        <ol>
          <li>Toca el botón "📷 Foto" en la parte superior derecha.</li>
          <li>Permite el acceso a la cámara cuando el sistema lo solicite.</li>
          <li>Toma la foto del ticket, factura o comprobante.</li>
          <li>La foto se sube automáticamente y aparece en tu lista.</li>
        </ol>
        <Nota>Toma las fotos con buena iluminación y asegúrate de que el monto y la fecha sean legibles.</Nota>

        <p className={styles.tableLabel}>6.2 Ver y ampliar tus fotos</p>
        <p>La pantalla muestra todas tus fotos de comprobantes en orden cronológico (las más recientes primero). Cada foto muestra: miniatura de la imagen, fecha y hora de registro, y nombre del archivo. Toca cualquier foto para verla ampliada en pantalla completa.</p>

        <p className={styles.tableLabel}>6.3 Eliminar una foto</p>
        <ol>
          <li>Localiza la foto que deseas eliminar.</li>
          <li>Toca el ícono de papelera (🗑️) en la tarjeta de la foto.</li>
          <li>Confirma la eliminación.</li>
        </ol>
        <Nota>La eliminación es permanente. Asegúrate de haber entregado o compartido los comprobantes antes de borrarlos.</Nota>
      </section>

      <section id="historial" className={styles.section}>
        <h2>7. Historial de Visitas</h2>
        <p>Accede desde "📊 Historial" en el Menú Principal. Aquí puedes consultar el registro de todas tus visitas a clientes. Puedes filtrar el historial por período:</p>
        <table className={styles.table}>
          <thead><tr><th>Período</th><th>Qué muestra</th></tr></thead>
          <tbody>
            <tr><td>Hoy</td><td>Solo las visitas realizadas en el día actual.</td></tr>
            <tr><td>Semana</td><td>Visitas de los últimos 7 días.</td></tr>
            <tr><td>Mes</td><td>Visitas del mes en curso.</td></tr>
            <tr><td>Todo</td><td>El historial completo sin límite de fecha.</td></tr>
          </tbody>
        </table>
        <p>Cada entrada de visita muestra: nombre del cliente, fecha y hora, y ubicación registrada (ciudad o coordenadas según la configuración).</p>
      </section>

      <section id="catalogo" className={styles.section}>
        <h2>8. Catálogo de Productos</h2>
        <p>Accede desde "🧑‍🦽 Catálogo" en el Menú Principal. Aquí puedes consultar todos los productos disponibles para venta.</p>
        <p>Funciones disponibles:</p>
        <ul>
          <li>Buscar por nombre, SKU o descripción usando la barra de búsqueda.</li>
          <li>Ver el precio de lista de cada producto.</li>
          <li>Alternar entre vista de tarjetas y vista de tabla.</li>
        </ul>
        <Nota>El catálogo es de solo consulta. Para agregar o modificar productos, comunícate con el administrador.</Nota>
      </section>

      <section id="faq" className={styles.section}>
        <h2>9. Preguntas Frecuentes</h2>
        <Faq q="¿Por qué el sistema tarda en cargar cuando lo abro por primera vez?">
          El servidor puede tomar hasta 30-60 segundos en despertar si lleva un rato sin usarse. Esto
          es normal. Espera un momento y vuelve a intentarlo — una vez cargado, todo funciona rápido.
        </Faq>
        <Faq q="¿Puedo crear cotizaciones sin internet?">
          No. El sistema requiere conexión a internet para consultar el catálogo de productos
          actualizado y guardar las cotizaciones. Asegúrate de tener señal antes de atender al cliente.
        </Faq>
        <Faq q="¿Los precios del PDF ya incluyen IVA?">
          Sí. Todos los precios que aparecen en el PDF ya incluyen el IVA del 16%. El precio que ves
          en el catálogo es el precio base sin IVA — el sistema lo calcula automáticamente al generar
          la cotización.
        </Faq>
        <Faq q="¿Puedo cambiar el precio de un producto al cotizar?">
          Sí. En la pantalla de cotización, toca el campo de precio de cualquier producto del carrito
          para editarlo manualmente. Esto es útil cuando acuerdas un precio especial con el cliente.
        </Faq>
        <Faq q="¿Qué pasa si el cliente acepta en crédito?">
          Selecciona "Crédito" como método de pago. En este caso el sistema no te pedirá foto de
          comprobante, ya que el pago se realizará después. La cotización quedará en estatus Enviada.
        </Faq>
        <Faq q="¿Puedo importar productos desde Excel en lugar de buscarlos uno a uno?">
          Sí. En la pantalla de cotización, toca el botón "Importar Excel" y selecciona un archivo con
          los SKUs de los productos. El sistema carga automáticamente los productos encontrados en el
          catálogo.
        </Faq>
        <Faq q="¿La visita se registra aunque no haga una cotización?">
          Sí. Al tocar "Iniciar Visita" se registra la visita inmediatamente, independientemente de si
          generas una cotización después.
        </Faq>
        <Faq q="¿Cómo sé qué estatus tiene una cotización que ya generé?">
          Ve a "Cotizaciones" en el menú. Cada cotización muestra su estatus actual en color: gris =
          borrador, amarillo = enviada, verde = aceptada, rojo = rechazada.
        </Faq>
        <Faq q="¿Puedo ver cotizaciones de otros vendedores?">
          No. Solo puedes ver tus propias cotizaciones. El administrador puede ver las de todo el equipo.
        </Faq>
        <Faq q="¿Qué hago si cometí un error en una cotización ya enviada?">
          Abre la cotización y toca "Editar". Las cotizaciones en estatus Borrador o Enviada pueden
          modificarse. Si ya está Aceptada, contacta al administrador.
        </Faq>
        <Faq q="¿El sistema funciona en mi celular?">
          Sí. La app está diseñada para usarse en celular, tablet o computadora. Solo necesitas el
          navegador web y la URL del sistema. No requiere instalar ninguna aplicación.
        </Faq>
      </section>

      <section id="glosario" className={styles.section}>
        <h2>10. Glosario de Términos</h2>
        <dl className={styles.glossary}>
          <dt>Aceptada</dt>
          <dd>Estatus de una cotización que el cliente aprobó. Puede tener comprobante de pago subido o estar pendiente de cobro si fue en crédito.</dd>
          <dt>Borrador</dt>
          <dd>Estatus inicial de una cotización que fue guardada pero aún no se ha enviado o generado el PDF para el cliente.</dd>
          <dt>Carrito</dt>
          <dd>Lista de productos seleccionados para incluir en una cotización. Puedes agregar, quitar y ajustar cantidades antes de generar el PDF.</dd>
          <dt>Cotización</dt>
          <dd>Documento formal con los precios ofrecidos al cliente para un conjunto de productos. Tiene un folio único y puede tener vigencia definida.</dd>
          <dt>Enviada</dt>
          <dd>Estatus de una cotización cuyo PDF ya fue entregado al cliente y se espera su respuesta.</dd>
          <dt>Folio</dt>
          <dd>Número único que identifica cada cotización (ej. COT-0042). Sirve para dar seguimiento y referencia en futuras comunicaciones.</dd>
          <dt>Geolocalización</dt>
          <dd>Registro automático de las coordenadas GPS del lugar donde se inicia una visita. Requiere que el vendedor acepte el permiso de ubicación en el dispositivo.</dd>
          <dt>IVA</dt>
          <dd>Impuesto al Valor Agregado del 16%. Los precios en el PDF de cotización ya lo incluyen. Los precios del catálogo son sin IVA.</dd>
          <dt>PDF</dt>
          <dd>Documento digital de la cotización que se genera y puede compartirse por WhatsApp, correo u otras aplicaciones.</dd>
          <dt>Precio AAA</dt>
          <dd>Nivel de precio especial (más bajo que lista) disponible para clientes seleccionados. Se activa con el botón "Precios AAA" en la pantalla de cotización.</dd>
          <dt>Precio Distribuidor</dt>
          <dd>Nivel de precio preferencial para clientes distribuidores. Aparece como opción en la cotización si el cliente tiene ese tipo configurado.</dd>
          <dt>Precio Lista</dt>
          <dd>Precio estándar del catálogo, sin descuentos especiales. Es el precio base que aparece por defecto al crear una cotización.</dd>
          <dt>Recargo tarjeta</dt>
          <dd>Cargo adicional del 7% sobre el total cuando el cliente paga con tarjeta de crédito o débito. El sistema lo calcula y muestra automáticamente.</dd>
          <dt>Rechazada</dt>
          <dd>Estatus de una cotización que el cliente no aceptó. Queda en el historial como referencia.</dd>
          <dt>SKU</dt>
          <dd>Código único de identificación de un producto en el catálogo (Stock Keeping Unit). Sirve para buscar e importar productos por su código exacto.</dd>
          <dt>Viático</dt>
          <dd>Gasto de viaje del vendedor (gasolina, comida, casetas, hotel) que debe registrarse con comprobante fotográfico para su reembolso.</dd>
          <dt>Vigencia</dt>
          <dd>Número de días que la cotización tiene validez. Por defecto son 30 días. Después de ese plazo, los precios pueden no ser aplicables.</dd>
          <dt>Visita</dt>
          <dd>Registro de una presencia física en el sitio de un cliente. Queda guardada con fecha, hora y ubicación para el reporte de actividad del vendedor.</dd>
        </dl>
      </section>
      </div>
    </PortalLayout>
  );
}
