import { useState } from 'react';
import shared from '../pages/SolicitarCuenta.module.css';

// Formulario de "Solicitud de Reporte ERP" — pedido explícito de ERP
// (2026-08-10): mismo trato que "Proyecto" de BI (etapas propias, tablero,
// ver ErpReports.jsx), pero SIN las ~30 preguntas de BI — ese formulario
// replica un Word que ya existía en esa área; ERP no tiene un documento
// previo que replicar, así que el formulario es corto: lo justo para que
// ERP no tenga que ir a preguntar por chat qué necesitaba la persona.
const EMPTY = { reportName: '', module: '', dataNeeded: '', purpose: '', deadline: '' };

export default function ErpReportForm({ onSubmit, onBack }) {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState('');

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.reportName.trim() || !form.module.trim() || !form.dataNeeded.trim() || !form.purpose.trim() || !form.deadline) {
      setError('Completa todos los campos.');
      return;
    }
    setError('');
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit}>
      <p className={shared.hint} style={{ marginBottom: '1rem' }}>
        Entre más detalle des, más rápido ERP puede empezar a trabajarlo.
      </p>
      {error && <p className={shared.error}>{error}</p>}

      <div className={shared.field}>
        <label>Nombre del reporte *</label>
        <input value={form.reportName} onChange={set('reportName')} placeholder="Ej. Ventas por sucursal del mes" />
      </div>
      <div className={shared.field}>
        <label>Módulo del ERP *</label>
        <input value={form.module} onChange={set('module')} placeholder="Ej. Ventas, Compras, Inventarios, Contabilidad..." />
      </div>
      <div className={shared.field}>
        <label>¿Qué información debe incluir? *</label>
        <textarea value={form.dataNeeded} onChange={set('dataNeeded')} placeholder="Ej. Ventas por sucursal y vendedor, del 1 al 31 de julio, con totales por día" />
      </div>
      <div className={shared.field}>
        <label>¿Para qué se va a usar? *</label>
        <textarea value={form.purpose} onChange={set('purpose')} placeholder="Ej. Presentación mensual a Dirección" />
      </div>
      <div className={shared.field}>
        <label>Fecha límite en que lo necesitas *</label>
        <input type="date" value={form.deadline} onChange={set('deadline')} />
      </div>

      <div className={shared.actionsRow || ''} style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem' }}>
        <button type="button" className={shared.nameOption} onClick={onBack}>← Cambiar</button>
        <button type="submit" className={shared.submitBtn}>Continuar a vista previa</button>
      </div>
    </form>
  );
}
