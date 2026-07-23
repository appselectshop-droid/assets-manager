import { useState } from 'react';
import shared from '../pages/SolicitarCuenta.module.css';

// "Solicitar bases de datos" — el otro camino de Soporte BI (además de
// Solicitud de Proyecto): a diferencia de ese, NO genera ningún documento —
// solo junta los filtros de abajo y los manda como ticket.
//
// Corrección explícita del usuario sobre el diseño original: esto NO es
// "elegir un canal fijo" (Plataforma/E-commerce/Tienda como 3 opciones
// mutuamente excluyentes) — es un filtro real, ej. "ventas de ML (una
// plataforma específica) de la tienda Fontastic (una tienda específica) de
// tal a tal periodo", o "inventarios del ERP de la tienda Fontastic de tal
// a tal periodo". Por eso "plataforma" y "tienda" ahora son catálogos reales
// que se combinan, no un radio de 3 palabras genéricas.
export const BI_DATABASE_TYPES = {
  ventas: { label: 'Ventas', icon: '💰' },
  inventarios: { label: 'Inventarios', icon: '📦' },
};

// ERP solo aparece como plataforma para Inventarios (pedido explícito del
// usuario) — para Ventas siempre es una plataforma de venta real.
const MARKETPLACE_PLATFORMS = [
  { value: 'amazon', label: 'Amazon' },
  { value: 'ml', label: 'ML (Mercado Libre)' },
  { value: 'tiktok', label: 'Tiktok' },
  { value: 'walmart', label: 'Walmart' },
  { value: 'coppel', label: 'Coppel' },
  { value: 'realtrends', label: 'RealTrends' },
];
const OTRA_PLATAFORMA = { value: 'otra', label: 'Otra' };

export const BI_PLATFORM_CATALOG = {
  ventas: [...MARKETPLACE_PLATFORMS, OTRA_PLATAFORMA],
  inventarios: [{ value: 'erp', label: 'ERP' }, ...MARKETPLACE_PLATFORMS, OTRA_PLATAFORMA],
};

// Catálogo de tiendas/cuentas/sellers que pasó el usuario — lista cerrada,
// a diferencia de plataforma (que sí tiene "Otra" porque dijo "etc.").
export const BI_STORE_CATALOG = [
  { value: 'select_shop', label: 'Select Shop' },
  { value: 'nexu', label: 'Nexu' },
  { value: 'medical_store', label: 'Medical Store' },
  { value: 'armaf_ocenid', label: 'Armaf/Ocenid' },
  { value: 'signa', label: 'Signa' },
  { value: 't_lab', label: 'T-lab' },
  { value: 'fontastic', label: 'Fontastic' },
  { value: 'creativa_integral', label: 'Creativa Integral' },
];

export default function BiDatabaseForm({ onSubmit, onBack }) {
  const [tipo, setTipo] = useState('');
  const [plataforma, setPlataforma] = useState('');
  const [plataformaOtra, setPlataformaOtra] = useState('');
  const [tienda, setTienda] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');

  const handlePickTipo = (key) => {
    setTipo(key);
    setPlataforma('');
    setPlataformaOtra('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!tipo) { setError('Elige de qué base de datos se trata: Ventas o Inventarios.'); return; }
    if (!plataforma) { setError('Elige la plataforma.'); return; }
    if (plataforma === 'otra' && !plataformaOtra.trim()) { setError('Escribe el nombre de la plataforma.'); return; }
    if (!tienda) { setError('Elige la tienda.'); return; }
    if (!startDate || !endDate) { setError('Especifica el periodo (fecha inicial y final) que necesitas.'); return; }
    if (startDate > endDate) { setError('La fecha inicial no puede ser posterior a la fecha final.'); return; }
    setError('');
    onSubmit({
      tipo,
      plataforma,
      plataformaOtra: plataforma === 'otra' ? plataformaOtra.trim() : '',
      tienda,
      startDate,
      endDate,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className={shared.error}>{error}</p>}

      <div className={shared.section}>
        <p className={shared.sectionTitle}>¿Base de datos de qué?</p>
        <div className={shared.checkGrid}>
          {Object.entries(BI_DATABASE_TYPES).map(([key, t]) => (
            <label
              key={key}
              className={`${shared.checkOption} ${tipo === key ? shared.checkOptionActive : ''}`}
              onClick={() => handlePickTipo(key)}
            >
              <input type="radio" name="tipo" checked={tipo === key} onChange={() => handlePickTipo(key)} />
              <span className={shared.checkEmoji}>{t.icon}</span>
              {t.label}
            </label>
          ))}
        </div>
      </div>

      {tipo && (
        <div className={shared.section}>
          <p className={shared.sectionTitle}>Plataforma</p>
          <div className={shared.radioRow}>
            {BI_PLATFORM_CATALOG[tipo].map((p) => (
              <label key={p.value} className={shared.radioOption}>
                <input type="radio" name="plataforma" checked={plataforma === p.value} onChange={() => setPlataforma(p.value)} />
                {p.label}
              </label>
            ))}
          </div>
          {plataforma === 'otra' && (
            <div className={shared.field} style={{ marginTop: '0.6rem' }}>
              <label>¿Cuál? *</label>
              <input value={plataformaOtra} onChange={(e) => setPlataformaOtra(e.target.value)} placeholder="Nombre de la plataforma" />
            </div>
          )}
        </div>
      )}

      {tipo && (
        <div className={shared.section}>
          <p className={shared.sectionTitle}>Tienda</p>
          <div className={shared.radioRow}>
            {BI_STORE_CATALOG.map((t) => (
              <label key={t.value} className={shared.radioOption}>
                <input type="radio" name="tienda" checked={tienda === t.value} onChange={() => setTienda(t.value)} />
                {t.label}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className={shared.section}>
        <p className={shared.sectionTitle}>Periodo solicitado</p>
        <div className={shared.row}>
          <div className={shared.field}>
            <label>Desde *</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div className={shared.field}>
            <label>Hasta *</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button type="button" className={shared.nameOption} onClick={onBack}>← Cambiar</button>
        <button type="submit" className={shared.submitBtn}>Continuar a vista previa</button>
      </div>
    </form>
  );
}
