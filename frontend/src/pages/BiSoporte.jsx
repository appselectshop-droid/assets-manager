import { useMemo } from 'react';
import { useBiContext } from './BiLayout';
import styles from './Tickets.module.css';

const STATUS_CONFIG = {
  abierto:    { label: 'Abierto',    color: '#d97706', bg: '#fffbeb' },
  en_proceso: { label: 'En proceso', color: '#2563eb', bg: '#eff6ff' },
  resuelto:   { label: 'Resuelto',   color: '#16a34a', bg: '#f0fdf4' },
  cerrado:    { label: 'Cerrado',    color: '#6b7280', bg: '#f5f5f5' },
};

// "Soporte" — 3ra pata de Soporte BI (2026-07-30), a raíz del ticket de
// Ovadia ("no tengo Anydesk, solo requiero apoyo de BI"): dudas o
// problemas puntuales, sin el formulario elaborado de Proyecto/Bases de
// Datos. A diferencia de esas dos, estos NO usan `biStage` — se resuelven
// como un ticket normal (status genérico + PUT /:id/status, ver
// BiRequestDetailModal.jsx).
export default function BiSoporte() {
  const { tickets, loading, setDetailTarget } = useBiContext();
  const requests = useMemo(() => (
    tickets.filter((t) => t.biRequestKind === 'soporte').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
  ), [tickets]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>❓</div>
          <div>
            <h1 className={styles.title}>Soporte</h1>
            <p className={styles.subtitle}>Dudas o problemas puntuales reportados al equipo — sin formulario.</p>
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
                <th>Asunto</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {requests.length === 0 && (
                <tr><td colSpan={4} className={styles.empty}>Sin solicitudes de soporte todavía</td></tr>
              )}
              {requests.map((t) => {
                const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.abierto;
                return (
                  <tr key={t._id} onClick={() => setDetailTarget(t)} style={{ cursor: 'pointer' }}>
                    <td><strong>{t.folio}</strong></td>
                    <td>{t.employeeName}</td>
                    <td>{t.subject}</td>
                    <td>
                      <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
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
