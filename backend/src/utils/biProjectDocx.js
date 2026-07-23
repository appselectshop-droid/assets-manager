const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');

// Genera la "Solicitud de Proyecto BI" rellenando el MISMO archivo Word que
// ya usa el equipo de BI (solicitud_nuevo_reporte.docx) — pedido explícito
// del usuario: "NO CAMBIES EL DOCUMENTO... es como si fueras un OCR y
// mandaras esa copia". No se reconstruye el documento desde cero (nada de
// pdfkit aquí) — se abre el .docx original como plantilla, se ubican los
// espacios en blanco y los checkboxes YA EXISTENTES en su XML interno
// (word/document.xml) y se sustituye SOLO ese texto, dejando fuente,
// tamaño, tablas, bordes y todo lo demás exactamente como está.
//
// Cómo se ubican los espacios/checkboxes: se leyó `word/document.xml` del
// .docx original y se extrajeron, EN ORDEN, los 217 `<w:t>` (runs de texto)
// que lo componen — cada raya de espacio en blanco es un run que es
// ÚNICAMENTE guiones bajos ("_____...", 10 o más), y cada checkbox es un run
// que es ÚNICAMENTE "☐ ". Ningún otro texto del documento tiene esa forma
// exacta (los renglones de firma, ej. "Firma: ___________________", NO
// coinciden porque el run completo no es solo guiones — quedan intactos a
// propósito, esas son firmas físicas, no campos del formulario digital).
// Por eso basta con un regex que encuentre esos 2 patrones EN ORDEN y los
// vaya sustituyendo con la siguiente pieza de esta lista — sin tocar nada
// más del XML.
const TEMPLATE_PATH = path.join(__dirname, '../assets/templates/solicitud_nuevo_reporte.docx');

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Un espacio en blanco de 1 sola línea = { field }. Uno de varias líneas
// (párrafos de texto libre) = { field, lines: N } — la respuesta completa
// se pone en la PRIMERA línea (Word ajusta el texto largo solo dentro de la
// celda); las líneas siguientes del grupo se dejan vacías (no en blanco con
// guiones — vacías del todo), en vez de dejar rayas sueltas después de la
// respuesta.
const BLANK_SEQUENCE = [
  { field: 'nombreReporte' },
  { field: 'areaDepartamento' },
  { field: 'solicitante' },
  { field: 'fechaSolicitud' },
  { field: 'fechaRequerida' },
  { field: 'preguntaNegocio', lines: 3 },
  { field: 'queMedir', lines: 2 },
  { field: 'duenoProceso' },
  { field: 'responsableDatos' },
  { field: 'contactoCorreo' },
  { field: 'areaResponsable' },
  { field: 'permisosRestricciones', lines: 2 },
  { field: 'nombreSistemaFuente' },
  { field: 'tablasCamposRelevantes' },
  { field: 'frecuenciaActualizacion' },
  { field: 'observacionesCalidad', lines: 2 },
  { field: 'reglasNegocioLimpieza', lines: 2 },
  { field: 'rangoFechasDatos' },
  { field: 'kpisMetricas', lines: 2 },
  { field: 'granularidad' },
  { field: 'filtrosDimensiones', lines: 2 },
  { field: 'descripcionFormatoEsperado', lines: 2 },
  { field: 'comoUsaranResultados', lines: 2 },
  { field: 'alertasUmbrales', lines: 2 },
  { field: 'usuariosFinales' },
  { field: 'criteriosExito', lines: 2 },
];

// Grupos de checkbox, en el mismo orden en que aparecen en el documento —
// `single: true` son los que en el formulario web se muestran como opción
// única (radio) porque son mutuamente excluyentes; el resto se muestran
// como checkboxes de verdad (selección múltiple). Esto solo afecta la UI
// del formulario — en el documento de salida cualquier combinación de
// opciones marcadas se ve igual (☐ vs ☒), sin importar cómo se capturó.
const CHECKBOX_GROUPS = [
  { field: 'prioridad', single: true, options: ['alta', 'media', 'baja'] },
  { field: 'fuenteDatos', options: ['base_datos', 'excel_csv', 'api', 'sistema_erp', 'otro_fuente'] },
  { field: 'formatoDatos', single: true, options: ['estructurado', 'semi_estructurado', 'no_estructurado'] },
  { field: 'accionesLimpieza', options: ['eliminar_duplicados', 'manejar_nulos', 'corregir_formato', 'normalizar_datos', 'unificar_estructura'] },
  { field: 'existenDatosHistoricos', single: true, options: ['si', 'no'] },
  { field: 'tipoAnalisis', options: ['descriptivo', 'diagnostico', 'predictivo', 'prescriptivo'] },
  { field: 'indicadoresAnalizar', options: ['tendencias', 'correlaciones', 'outliers', 'agrupaciones', 'comparaciones'] },
  { field: 'tipoVisualizacion', options: ['tabla', 'grafica_barras', 'linea_tiempo', 'mapa', 'dashboard', 'otro_visualizacion'] },
  { field: 'herramientaVisualizacion', single: true, options: ['power_bi', 'excel', 'otro_herramienta'] },
  { field: 'frecuenciaReporte', single: true, options: ['diaria', 'semanal', 'mensual', 'a_demanda'] },
  { field: 'requiereMonitoreo', single: true, options: ['si', 'no'] },
];

// Aplana BLANK_SEQUENCE/CHECKBOX_GROUPS en la lista COMBINADA y en el orden
// EXACTO en que blancos y checkboxes se van alternando dentro del documento
// real — reconstruido corriendo el mismo documento sección por sección (ver
// comentario de cada bloque abajo, con el número de sección del formulario
// entre paréntesis para poder ubicarlo rápido si el .docx cambia algún día).
function buildTokenQueue() {
  const tokens = [];
  const blank = (field, lines = 1) => {
    for (let i = 0; i < lines; i++) tokens.push({ type: 'blank', field, isFirstLine: i === 0 });
  };
  const checkboxGroup = (field, options) => {
    options.forEach((option) => tokens.push({ type: 'checkbox', field, option }));
  };

  // (1) DEFINICIÓN DEL PROBLEMA / PREGUNTA DE NEGOCIO
  blank('nombreReporte');
  blank('areaDepartamento');
  blank('solicitante');
  blank('fechaSolicitud');
  blank('fechaRequerida');
  blank('preguntaNegocio', 3);
  blank('queMedir', 2);
  checkboxGroup('prioridad', ['alta', 'media', 'baja']);

  // (2) IDENTIFICACIÓN DEL DUEÑO DE LOS DATOS
  blank('duenoProceso');
  blank('responsableDatos');
  blank('contactoCorreo');
  blank('areaResponsable');
  blank('permisosRestricciones', 2);

  // (3) ORIGEN DE LOS DATOS
  checkboxGroup('fuenteDatos', ['base_datos', 'excel_csv', 'api', 'sistema_erp', 'otro_fuente']);
  blank('nombreSistemaFuente');
  blank('tablasCamposRelevantes');
  checkboxGroup('formatoDatos', ['estructurado', 'semi_estructurado', 'no_estructurado']);
  blank('frecuenciaActualizacion');
  blank('observacionesCalidad', 2);

  // (4) LIMPIEZA DE DATOS REQUERIDA
  checkboxGroup('accionesLimpieza', ['eliminar_duplicados', 'manejar_nulos', 'corregir_formato', 'normalizar_datos', 'unificar_estructura']);
  blank('reglasNegocioLimpieza', 2);
  checkboxGroup('existenDatosHistoricos', ['si', 'no']);
  blank('rangoFechasDatos');

  // (5) EXPLORACIÓN Y MODELADO / ANÁLISIS
  checkboxGroup('tipoAnalisis', ['descriptivo', 'diagnostico', 'predictivo', 'prescriptivo']);
  checkboxGroup('indicadoresAnalizar', ['tendencias', 'correlaciones', 'outliers', 'agrupaciones', 'comparaciones']);
  blank('kpisMetricas', 2);
  blank('granularidad');
  blank('filtrosDimensiones', 2);

  // (6) VISUALIZACIÓN DE DATOS
  checkboxGroup('tipoVisualizacion', ['tabla', 'grafica_barras', 'linea_tiempo', 'mapa', 'dashboard', 'otro_visualizacion']);
  checkboxGroup('herramientaVisualizacion', ['power_bi', 'excel', 'otro_herramienta']);
  blank('descripcionFormatoEsperado', 2);
  checkboxGroup('frecuenciaReporte', ['diaria', 'semanal', 'mensual', 'a_demanda']);

  // (7) INTERPRETACIÓN E IMPLEMENTACIÓN / MONITOREO
  blank('comoUsaranResultados', 2);
  blank('alertasUmbrales', 2);
  blank('usuariosFinales');
  checkboxGroup('requiereMonitoreo', ['si', 'no']);
  blank('criteriosExito', 2);

  // (8) APROBACIONES Y FIRMAS — a propósito NO se toca: son firmas físicas
  // de un proceso posterior a este formulario digital, no campos a llenar.

  return tokens;
}

// `data`: objeto plano con una llave por cada `field` de arriba. Los campos
// de blanco de 1 línea esperan un string; los de varias líneas también
// (el texto completo se pone en la primera línea). Los grupos de checkbox
// esperan: si `single`, un string con el `option` elegido; si no, un array
// de `option`s marcados (puede venir vacío).
async function buildBiProjectDocx(data) {
  const templateBuffer = fs.readFileSync(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(templateBuffer);
  const xml = await zip.file('word/document.xml').async('string');

  const queue = buildTokenQueue();
  let queueIndex = 0;

  const filled = xml.replace(/<w:t( xml:space="preserve")?>(_{10,}|☐ )<\/w:t>/g, (match, preserve, original) => {
    const token = queue[queueIndex];
    queueIndex += 1;
    if (!token) return match; // no debería pasar; de plano no toca nada si la plantilla cambió

    if (token.type === 'blank') {
      const value = token.isFirstLine ? escapeXml(data[token.field]) : '';
      return `<w:t xml:space="preserve">${value}</w:t>`;
    }

    // checkbox
    const selected = token.checked !== undefined ? token.checked : isOptionSelected(data, token.field, token.option);
    return `<w:t xml:space="preserve">${selected ? '☒' : '☐'} </w:t>`;
  });

  if (queueIndex !== queue.length) {
    throw new Error(`La plantilla de Solicitud de Proyecto BI no coincide con lo esperado (se llenaron ${queueIndex} de ${queue.length} campos) — revisa si el .docx cambió.`);
  }

  zip.file('word/document.xml', filled);
  return zip.generateAsync({ type: 'nodebuffer' });
}

function isOptionSelected(data, field, option) {
  const value = data[field];
  if (Array.isArray(value)) return value.includes(option);
  return value === option;
}

module.exports = { buildBiProjectDocx, BLANK_SEQUENCE, CHECKBOX_GROUPS };
