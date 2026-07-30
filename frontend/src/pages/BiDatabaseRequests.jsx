import { useMemo } from 'react';
import { useBiContext } from './BiLayout';
import { BI_DATABASE_TYPES, BI_PLATFORM_CATALOG, BI_STORE_CATALOG } from '../components/BiDatabaseForm';
import styles from './Tickets.module.css';

const STAGE_CONFIG = {
  recibido:      { label: 'Recibido',      color: '#6b7280', bg: '#f5f5f5' },
  en_definicion: { label: 'En definición',  color: '#d97706', bg: '#fffbeb' },
  en_desarrollo: { label: 'En desarrollo',  color: '#2563eb', bg: '#eff6ff' },
  en_revision:   { label: 'En revisión',    color: '#7c3aed', bg: '#f5f3ff' },
  entregado:     { label: 'Entregado',      color: '#16a34a', bg: '#f0fdf4' },
};

// Cola de "Solicitar bases de datos" — pedido explícito del usuario
// (2026-07-30): que BI vea tipo/plataforma/tienda/periodo reales, no el
// `subject` genérico del ticket. Tabla simple (no kanban, a diferencia de
// Proyectos) porque este tipo de solicitud es más transaccional — se
// arma y se entrega, no suele tener el mismo ida-y-vuelta de un proyecto.
export default function BiDatabaseRequests() {
  const { tickets, loading, setDetailTarget } = useBiContext();
  const requests = useMemo(() => (
    tickets.filter((t) => t.biRequestKind === 'bases_datos').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  ), [tickets]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🗄️</div>
          <div>
            <h1 className={styles.title}>Bases de Datos</h1>
            <p className={styles.subtitle}>Solicitudes de Ventas/Inventarios reportadas por el equipo.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.zabbixTable}>
            <thead>
              <tr>
                <th>Folio</th>
                <th>Solicitante</th>
                <th>Tipo</th>
                <th>Plataforma</th>
                <th>Tienda</th>
                <th>Periodo</th>
                <th>Etapa</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={7} className={styles.empty}>Sin solicitudes de bases de datos todavía</td></tr>
              )}
              {requests.map((t) => {
                const d = t.biDatabaseRequest || {};
                const tipo = BI_DATABASE_TYPES[d.tipo];
                const platformLabel = d.plataforma === 'otra'
                  ? d.plataformaOtra
                  : BI_PLATFORM_CATALOG[d.tipo]?.find((p) => p.value === d.plataforma)?.label || d.plataforma;
                const storeLabel = BI_STORE_CATALOG.find((s) => s.value === d.tienda)?.label || d.tienda;
                const stage = STAGE_CONFIG[t.biStage] || STAGE_CONFIG.recibido;
                return (
                  <tr key={t._id} onClick={() => setDetailTarget(t)} style={{ cursor: 'pointer' }}>
                    <td><strong>{t.folio}</strong></td>
                    <td>{t.employeeName}</td>
                    <td>{tipo?.icon} {tipo?.label}</td>
                    <td>{platformLabel}</td>
                    <td>{storeLabel}</td>
                    <td className={styles.muted}>{d.startDate} — {d.endDate}</td>
                    <td>
                      <span className={styles.statusBadge} style={{ color: stage.color, background: stage.bg }}>{stage.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
