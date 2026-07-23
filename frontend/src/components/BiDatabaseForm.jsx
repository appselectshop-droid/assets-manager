import { useState } from 'react';
import shared from '../pages/SolicitarCuenta.module.css';

// "Solicitar bases de datos" — el otro camino de Soporte BI (además de
// Solicitud de Proyecto): a diferencia de ese, NO genera ningún documento —
// solo junta canal + sub-canal + periodo y los manda como ticket. Pedido
// explícito del usuario (con foto del árbol de opciones): Ventas e
// Inventarios, cada uno con 3 canales fijos.
export const BI_DATABASE_CHANNELS = {
  ventas: {
    label: 'Ventas',
    icon: '💰',
    subchannels: [
      { value: 'plataforma', label: 'Plataforma (e-commerce)' },
      { value: 'ecommerce', label: 'E-commerce' },
      { value: 'tienda', label: 'Tienda' },
    ],
  },
  inventarios: {
    label: 'Inventarios',
    icon: '📦',
    subchannels: [
      { value: 'erp', label: 'ERP' },
      { value: 'plataforma', label: 'Plataforma' },
      { value: 'tienda', label: 'Tienda' },
    ],
  },
};

export default function BiDatabaseForm({ onSubmit, onBack }) {
  const [channel, setChannel] = useState('');
  const [subchannel, setSubchannel] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');

  const handlePickChannel = (key) => {
    setChannel(key);
    setSubchannel('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!channel) { setError('Elige de qué base de datos se trata: Ventas o Inventarios.'); return; }
    if (!subchannel) { setError('Elige el canal.'); return; }
    if (!startDate || !endDate) { setError('Especifica el periodo (fecha inicial y final) que necesitas.'); return; }
    if (startDate > endDate) { setError('La fecha inicial no puede ser posterior a la fecha final.'); return; }
    setError('');
    onSubmit({ channel, subchannel, startDate, endDate });
  };

  return (
    <form onSubmit={handleSubmit}>
      {error && <p className={shared.error}>{error}</p>}

      <div className={shared.section}>
        <p className={shared.sectionTitle}>¿Base de datos de qué?</p>
        <div className={shared.checkGrid}>
          {Object.entries(BI_DATABASE_CHANNELS).map(([key, ch]) => (
            <label
              key={key}
              className={`${shared.checkOption} ${channel === key ? shared.checkOptionActive : ''}`}
              onClick={() => handlePickChannel(key)}
            >
              <input type="radio" name="channel" checked={channel === key} onChange={() => handlePickChannel(key)} />
              <span className={shared.checkEmoji}>{ch.icon}</span>
              {ch.label}
            </label>
          ))}
        </div>
      </div>

      {channel && (
        <div className={shared.section}>
          <p className={shared.sectionTitle}>Canal</p>
          <div className={shared.radioRow}>
            {BI_DATABASE_CHANNELS[channel].subchannels.map((s) => (
              <label key={s.value} className={shared.radioOption}>
                <input type="radio" name="subchannel" checked={subchannel === s.value} onChange={() => setSubchannel(s.value)} />
                {s.label}
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
