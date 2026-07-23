import { useState } from 'react';
import shared from '../pages/SolicitarCuenta.module.css';

// Formulario de "Solicitud de Proyecto BI" — réplica EXACTA (mismas 8
// secciones, mismos campos, mismo orden) del documento Word que ya usa el
// equipo de BI (solicitud_nuevo_reporte.docx). Los `key` de cada campo
// coinciden 1:1 con lo que espera `backend/src/utils/biProjectDocx.js` para
// rellenar ese mismo .docx como plantilla — si se agrega/quita un campo
// aquí, hay que actualizar ese archivo también (y viceversa).
const SECTIONS = [
  {
    title: '1. Definición del problema / pregunta de negocio',
    fields: [
      { key: 'nombreReporte', label: 'Nombre del Reporte', type: 'text', required: true },
      { key: 'areaDepartamento', label: 'Área / Departamento', type: 'text' },
      { key: 'solicitante', label: 'Solicitante', type: 'text', required: true },
      { key: 'fechaSolicitud', label: 'Fecha de Solicitud', type: 'date' },
      { key: 'fechaRequerida', label: 'Fecha Requerida', type: 'date' },
      { key: 'preguntaNegocio', label: '¿Qué pregunta de negocio responde este reporte?', type: 'textarea' },
      { key: 'queMedir', label: '¿Qué se quiere medir o mejorar?', type: 'textarea' },
      { key: 'prioridad', label: 'Prioridad', type: 'radio', options: [{ value: 'alta', label: 'Alta' }, { value: 'media', label: 'Media' }, { value: 'baja', label: 'Baja' }] },
    ],
  },
  {
    title: '2. Identificación del dueño de los datos',
    fields: [
      { key: 'duenoProceso', label: 'Dueño del Proceso', type: 'text' },
      { key: 'responsableDatos', label: 'Responsable de los Datos', type: 'text' },
      { key: 'contactoCorreo', label: 'Contacto / Correo', type: 'text' },
      { key: 'areaResponsable', label: 'Área Responsable', type: 'text' },
      { key: 'permisosRestricciones', label: 'Permisos o restricciones de acceso a los datos', type: 'textarea' },
    ],
  },
  {
    title: '3. Origen de los datos',
    fields: [
      { key: 'fuenteDatos', label: 'Fuente de Datos', type: 'checkbox', options: [{ value: 'base_datos', label: 'Base de Datos' }, { value: 'excel_csv', label: 'Excel/CSV' }, { value: 'api', label: 'API' }, { value: 'sistema_erp', label: 'Sistema ERP' }, { value: 'otro_fuente', label: 'Otro' }] },
      { key: 'nombreSistemaFuente', label: 'Nombre del Sistema/Fuente', type: 'text' },
      { key: 'tablasCamposRelevantes', label: 'Tablas o Campos Relevantes', type: 'text' },
      { key: 'formatoDatos', label: 'Formato de los Datos', type: 'radio', options: [{ value: 'estructurado', label: 'Estructurado' }, { value: 'semi_estructurado', label: 'Semi-estructurado' }, { value: 'no_estructurado', label: 'No estructurado' }] },
      { key: 'frecuenciaActualizacion', label: 'Frecuencia de actualización', type: 'text' },
      { key: 'observacionesCalidad', label: 'Observaciones sobre la calidad de los datos', type: 'textarea' },
    ],
  },
  {
    title: '4. Limpieza de datos requerida',
    fields: [
      { key: 'accionesLimpieza', label: 'Acciones de limpieza', type: 'checkbox', options: [{ value: 'eliminar_duplicados', label: 'Eliminar duplicados' }, { value: 'manejar_nulos', label: 'Manejar valores nulos' }, { value: 'corregir_formato', label: 'Corregir formato' }, { value: 'normalizar_datos', label: 'Normalizar datos' }, { value: 'unificar_estructura', label: 'Unificar estructura' }] },
      { key: 'reglasNegocioLimpieza', label: 'Reglas de negocio para limpieza (ej. cómo tratar nulos)', type: 'textarea' },
      { key: 'existenDatosHistoricos', label: '¿Existen datos históricos?', type: 'radio', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
      { key: 'rangoFechasDatos', label: 'Rango de fechas de los datos', type: 'text' },
    ],
  },
  {
    title: '5. Exploración y modelado / análisis',
    fields: [
      { key: 'tipoAnalisis', label: 'Tipo de Análisis', type: 'checkbox', options: [{ value: 'descriptivo', label: 'Descriptivo' }, { value: 'diagnostico', label: 'Diagnóstico' }, { value: 'predictivo', label: 'Predictivo' }, { value: 'prescriptivo', label: 'Prescriptivo' }] },
      { key: 'indicadoresAnalizar', label: 'Indicadores a analizar', type: 'checkbox', options: [{ value: 'tendencias', label: 'Tendencias' }, { value: 'correlaciones', label: 'Correlaciones' }, { value: 'outliers', label: 'Outliers' }, { value: 'agrupaciones', label: 'Agrupaciones' }, { value: 'comparaciones', label: 'Comparaciones' }] },
      { key: 'kpisMetricas', label: 'KPIs o métricas clave esperadas', type: 'textarea' },
      { key: 'granularidad', label: 'Granularidad (diario, semanal, mensual)', type: 'text' },
      { key: 'filtrosDimensiones', label: 'Filtros o dimensiones específicas (por región, producto, etc.)', type: 'textarea' },
    ],
  },
  {
    title: '6. Visualización de datos',
    fields: [
      { key: 'tipoVisualizacion', label: 'Tipo de visualización preferida', type: 'checkbox', options: [{ value: 'tabla', label: 'Tabla' }, { value: 'grafica_barras', label: 'Gráfica de barras' }, { value: 'linea_tiempo', label: 'Línea de tiempo' }, { value: 'mapa', label: 'Mapa' }, { value: 'dashboard', label: 'Dashboard' }, { value: 'otro_visualizacion', label: 'Otro' }] },
      { key: 'herramientaVisualizacion', label: 'Herramienta de visualización', type: 'radio', options: [{ value: 'power_bi', label: 'Power BI' }, { value: 'excel', label: 'Excel' }, { value: 'otro_herramienta', label: 'Otro' }] },
      { key: 'descripcionFormatoEsperado', label: 'Descripción del formato esperado del reporte', type: 'textarea' },
      { key: 'frecuenciaReporte', label: 'Frecuencia del reporte', type: 'radio', options: [{ value: 'diaria', label: 'Diaria' }, { value: 'semanal', label: 'Semanal' }, { value: 'mensual', label: 'Mensual' }, { value: 'a_demanda', label: 'A demanda' }] },
    ],
  },
  {
    title: '7. Interpretación e implementación / monitoreo',
    fields: [
      { key: 'comoUsaranResultados', label: '¿Cómo se usarán los resultados / qué decisiones apoyará?', type: 'textarea' },
      { key: 'alertasUmbrales', label: 'Alertas o umbrales esperados (si aplica)', type: 'textarea' },
      { key: 'usuariosFinales', label: 'Usuarios finales del reporte', type: 'text' },
      { key: 'requiereMonitoreo', label: '¿Requiere monitoreo continuo?', type: 'radio', options: [{ value: 'si', label: 'Sí' }, { value: 'no', label: 'No' }] },
      { key: 'criteriosExito', label: 'Criterios de éxito del reporte', type: 'textarea' },
    ],
  },
];

const REQUIRED_FIELDS = SECTIONS.flatMap((s) => s.fields.filter((f) => f.required).map((f) => f.key));

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function emptyForm() {
  const form = { fechaSolicitud: todayIso() };
  SECTIONS.forEach((s) => s.fields.forEach((f) => {
    if (f.key === 'fechaSolicitud') return;
    form[f.key] = f.type === 'checkbox' ? [] : '';
  }));
  return form;
}

export default function BiProjectForm({ onSubmit, onBack }) {
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  const toggleCheckbox = (key, value) => setForm((f) => ({
    ...f,
    [key]: f[key].includes(value) ? f[key].filter((v) => v !== value) : [...f[key], value],
  }));

  const handleSubmit = (e) => {
    e.preventDefault();
    const missing = REQUIRED_FIELDS.filter((key) => !String(form[key] || '').trim());
    if (missing.length) {
      setError('Falta el nombre del reporte y/o el solicitante.');
      return;
    }
    setError('');
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit}>
      <p className={shared.hint} style={{ marginBottom: '1rem' }}>
        Completa todos los campos que apliquen para asegurar un análisis de datos efectivo y alineado con los objetivos del negocio.
      </p>
      {error && <p className={shared.error}>{error}</p>}

      {SECTIONS.map((section) => (
        <div key={section.title} className={shared.section}>
          <p className={shared.sectionTitle}>{section.title}</p>
          {section.fields.map((field) => (
            <div key={field.key} className={shared.field}>
              <label>{field.label}{field.required ? ' *' : ''}</label>
              {field.type === 'text' && (
                <input value={form[field.key]} onChange={(e) => set(field.key)(e.target.value)} />
              )}
              {field.type === 'date' && (
                <input type="date" value={form[field.key]} onChange={(e) => set(field.key)(e.target.value)} />
              )}
              {field.type === 'textarea' && (
                <textarea value={form[field.key]} onChange={(e) => set(field.key)(e.target.value)} />
              )}
              {field.type === 'radio' && (
                <div className={shared.radioRow}>
                  {field.options.map((opt) => (
                    <label key={opt.value} className={shared.radioOption}>
                      <input
                        type="radio"
                        name={field.key}
                        checked={form[field.key] === opt.value}
                        onChange={() => set(field.key)(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
              {field.type === 'checkbox' && (
                <div className={shared.permGrid}>
                  {field.options.map((opt) => (
                    <label key={opt.value} className={shared.permOption}>
                      <input
                        type="checkbox"
                        checked={form[field.key].includes(opt.value)}
                        onChange={() => toggleCheckbox(field.key, opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" className={shared.nameOption} onClick={onBack}>← Cambiar</button>
        <button type="submit" className={shared.submitBtn}>Continuar a vista previa</button>
      </div>
    </form>
  );
}

export { SECTIONS as BI_PROJECT_SECTIONS };
