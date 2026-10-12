import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ASSET_TYPE_LABELS, TYPE_ICONS } from '../config/assetFields';
import pageStyles from './Page.module.css';

// Histórico de un activo — pedido explícito del usuario (2026-10-12):
// "hazme en la página un apartado de históricos de activos, para saber
// cuál ha sido su evolución en la empresa". Mismo espíritu que la sección
// "Histórico de activos" que ya existe en EmployeeDetail.jsx, pero visto
// desde el activo: aquí importa la cadena completa de dueños de ESTE
// equipo, no la lista de equipos de una persona.
const STATUS_LABELS = { disponible: 'Disponible', asignado: 'Asignado', baja: 'De baja' };

export default function AssetHistory() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    api.get(`/assets/${id}/history`)
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar el histórico'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className={pageStyles.empty}>Cargando...</p>;
  if (error) return <p className={pageStyles.empty}>{error}</p>;
  if (!data) return null;

  const { asset, assignments, bajas } = data;

  return (
    <div>
      <button className={pageStyles.btnBack} onClick={() => navigate('/assets')}>← Volver</button>

      <div className={pageStyles.detailHeader}>
        <div>
          <h1 className={pageStyles.title}>
            <span className={pageStyles.typeBadge}>{TYPE_ICONS[asset.type]} {ASSET_TYPE_LABELS[asset.type] || asset.type}</span>
            {' '}{asset.brand} {asset.model}
          </h1>
          <p className={pageStyles.subtitle}>
            {asset.serialNumber && <>Serie {asset.serialNumber} · </>}
            {asset.inventoryTag && <>{asset.inventoryTag} · </>}
            Estatus actual: {STATUS_LABELS[asset.status] || asset.status}
          </p>
        </div>
      </div>

      <h2 className={pageStyles.sectionTitle}>📜 Historial de asignaciones ({assignments.length})</h2>
      {assignments.length === 0 ? (
        <p className={pageStyles.empty}>Este equipo nunca se ha asignado a nadie.</p>
      ) : (
        <div className={pageStyles.tableWrap}>
          <table className={pageStyles.table}>
            <thead>
              <tr>
                <th>Empleado</th>
                <th>Oficina / Empresa</th>
                <th>Asignado</th>
                <th>Devuelto</th>
                <th>Estatus</th>
              </tr>
            </thead>
            <tbody>
              {assignments.map((a) => (
                <tr key={a._id}>
                  <td className={pageStyles.nameCell}>{a.employee?.name || '—'}</td>
                  <td className={pageStyles.textMuted}>
                    {[a.employee?.office, a.employee?.businessName].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td>{a.assignedDate ? new Date(a.assignedDate).toLocaleDateString('es-MX') : '—'}</td>
                  <td>{a.returnDate ? new Date(a.returnDate).toLocaleDateString('es-MX') : '—'}</td>
                  <td>
                    {a.active
                      ? <span className={pageStyles.statusBadge} style={{ color: '#16a34a', background: '#f0fdf4' }}>Vigente</span>
                      : <span className={pageStyles.statusBadge} style={{ color: '#6b7280', background: '#f5f5f5' }}>Devuelta</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bajas.length > 0 && (
        <>
          <h2 className={pageStyles.sectionTitle} style={{ marginTop: '2rem' }}>🗑️ Bajas registradas ({bajas.length})</h2>
          <div className={pageStyles.tableWrap}>
            <table className={pageStyles.table}>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Motivo</th>
                  <th>Fecha</th>
                  <th>Comprador</th>
                  <th>Entregó</th>
                </tr>
              </thead>
              <tbody>
                {bajas.map((b) => (
                  <tr key={b._id}>
                    <td className={pageStyles.nameCell}>{b.folio}</td>
                    <td>{b.reason}{b.reasonOther ? `: ${b.reasonOther}` : ''}</td>
                    <td>{new Date(b.createdAt).toLocaleDateString('es-MX')}</td>
                    <td className={pageStyles.textMuted}>
                      {b.buyerName ? `${b.buyerName}${b.saleAmount ? ` — $${b.saleAmount.toLocaleString('es-MX')}` : ''}` : '—'}
                    </td>
                    <td className={pageStyles.textMuted}>{b.deliveredByName || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
