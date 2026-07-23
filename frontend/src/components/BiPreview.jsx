import { BI_PROJECT_SECTIONS } from './BiProjectForm';
import { BI_DATABASE_CHANNELS } from './BiDatabaseForm';
import shared from '../pages/SolicitarCuenta.module.css';
import styles from './BiPreview.module.css';

// Vista previa antes de enviar — pedido explícito del usuario: "antes de
// enviar deja ver una vista previa". Para "Solicitar proyecto" es un
// resumen de las respuestas (el documento real, idéntico al .docx
// original, se genera hasta que se confirma el envío — ver
// utils/biProjectDocx.js en el backend); para "Solicitar bases de datos"
// no hay documento de por medio, así que esta vista previa ES el detalle
// completo de lo que se va a solicitar.
function labelFor(options, value) {
  return options.find((o) => o.value === value)?.label || value;
}

function ProjectPreview({ data }) {
  return (
    <div className={styles.preview}>
      {BI_PROJECT_SECTIONS.map((section) => {
        const rows = section.fields
          .map((field) => {
            const value = data[field.key];
            let display;
            if (field.type === 'checkbox') {
              display = (value || []).map((v) => labelFor(field.options, v)).join(', ');
            } else if (field.type === 'radio') {
              display = value ? labelFor(field.options, value) : '';
            } else {
              display = value;
            }
            return { label: field.label, display };
          })
          .filter((r) => r.display);
        if (!rows.length) return null;
        return (
          <div key={section.title} className={styles.previewSection}>
            <p className={styles.previewSectionTitle}>{section.title}</p>
            {rows.map((r) => (
              <div key={r.label} className={styles.previewRow}>
                <span className={styles.previewLabel}>{r.label}</span>
                <span className={styles.previewValue}>{r.display}</span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function DatabasePreview({ data }) {
  const channel = BI_DATABASE_CHANNELS[data.channel];
  const subchannelLabel = channel?.subchannels.find((s) => s.value === data.subchannel)?.label || data.subchannel;
  return (
    <div className={styles.preview}>
      <div className={styles.previewSection}>
        <div className={styles.previewRow}>
          <span className={styles.previewLabel}>Base de datos</span>
          <span className={styles.previewValue}>{channel?.icon} {channel?.label}</span>
        </div>
        <div className={styles.previewRow}>
          <span className={styles.previewLabel}>Canal</span>
          <span className={styles.previewValue}>{subchannelLabel}</span>
        </div>
        <div className={styles.previewRow}>
          <span className={styles.previewLabel}>Periodo solicitado</span>
          <span className={styles.previewValue}>{data.startDate} — {data.endDate}</span>
        </div>
      </div>
    </div>
  );
}

export default function BiPreview({ kind, data, onConfirm, onBack, submitting }) {
  return (
    <div>
      <p className={shared.hint} style={{ marginBottom: '0.85rem' }}>
        Revisa que todo esté correcto antes de enviarlo a Soporte BI.
      </p>
      {kind === 'proyecto' ? <ProjectPreview data={data} /> : <DatabasePreview data={data} />}
      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
        <button type="button" className={shared.nameOption} onClick={onBack} disabled={submitting}>← Editar</button>
        <button type="button" className={shared.submitBtn} onClick={onConfirm} disabled={submitting}>
          {submitting ? 'Enviando...' : 'Confirmar y enviar'}
        </button>
      </div>
    </div>
  );
}
