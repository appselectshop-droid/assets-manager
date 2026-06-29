import { useState, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import { mapEmailRows, detectEmailColumns, EMAIL_TEMPLATE } from '../config/importEmails';
import styles from './ImportModal.module.css';

function downloadTemplate() {
  const ws = XLSX.utils.aoa_to_sheet([EMAIL_TEMPLATE.headers, ...EMAIL_TEMPLATE.sample]);
  ws['!cols'] = EMAIL_TEMPLATE.headers.map(() => ({ wch: 32 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Correos');
  XLSX.writeFile(wb, EMAIL_TEMPLATE.name);
}

export default function ImportEmailsModal({ onClose, onDone }) {
  const [step, setStep] = useState('upload');
  const [rows, setRows] = useState([]);
  const [cols, setCols] = useState({ hasCorp: false, hasGmail: false });
  const [employeesById, setEmployeesById] = useState(new Map());
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importErrors, setImportErrors] = useState([]);
  const inputRef = useRef();

  useEffect(() => {
    api.get('/employees').then(({ data }) => {
      setEmployeesById(new Map(data.map((e) => [e.employeeId, e.name])));
    });
  }, []);

  const validRows = rows.filter((r) => !r.__error);
  const errorRows = rows.filter((r) => r.__error);

  const parseFile = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      alert('Solo se aceptan archivos .xlsx, .xls o .csv');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });
      setCols(detectEmailColumns(raw));
      const mapped = mapEmailRows(raw).map((r) => {
        if (!r.__error && !employeesById.has(r.employeeId)) {
          return { ...r, __error: 'Empleado no encontrado en el sistema' };
        }
        return r;
      });
      setRows(mapped);
      setStep('preview');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    parseFile(e.dataTransfer.files[0]);
  };

  const handleImport = async () => {
    setStep('importing');
    setProgress({ done: 0, total: validRows.length });
    const failed = [];
    let done = 0;

    for (const row of validRows) {
      const payload = {};
      if (cols.hasCorp)  payload.corporateEmails = row.corporateEmails;
      if (cols.hasGmail) payload.gmailAccounts   = row.gmailAccounts;
      try {
        await api.put(`/employees/by-code/${encodeURIComponent(row.employeeId)}/emails`, payload);
        done++;
        setProgress({ done, total: validRows.length });
      } catch (err) {
        failed.push(`${row.employeeId}: ${err.response?.data?.message || 'Error'}`);
      }
    }

    setImportErrors(failed);
    setStep('done');
  };

  return (
    <div className={styles.overlay} onClick={step !== 'importing' ? onClose : undefined}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>📧</span>
            <div>
              <h2 className={styles.title}>Importar correos de empleados</h2>
              <p className={styles.subtitle}>Actualiza correo corporativo y Gmail de empleados ya registrados</p>
            </div>
          </div>
          {step !== 'importing' && (
            <button className={styles.closeBtn} onClick={onClose}>✕</button>
          )}
        </div>

        {/* STEP: upload */}
        {step === 'upload' && (
          <div className={styles.body}>
            <div
              className={`${styles.dropzone} ${dragOver ? styles.dropzoneActive : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current.click()}
            >
              <span className={styles.dropIcon}>📂</span>
              <p className={styles.dropText}>Arrastra tu archivo aquí o haz clic para seleccionar</p>
              <p className={styles.dropHint}>.xlsx &nbsp;·&nbsp; .xls &nbsp;·&nbsp; .csv</p>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv"
                className={styles.fileInput}
                onChange={(e) => parseFile(e.target.files[0])} />
            </div>

            <div className={styles.templateRow}>
              <div>
                <p className={styles.templateTitle}>¿No tienes el formato correcto?</p>
                <p className={styles.templateSub}>Descarga la plantilla con las columnas de ejemplo</p>
              </div>
              <button className={styles.btnTemplate} onClick={downloadTemplate}>⬇ Plantilla</button>
            </div>

            <div className={styles.colsBox}>
              <p className={styles.colsTitle}>Columnas reconocidas automáticamente</p>
              <div className={styles.colChips}>
                {['No. Empleado ✱', 'Correo Corporativo', 'Correo Gmail'].map((c) => (
                  <span key={c} className={c.includes('✱') ? styles.chipReq : styles.chip}>{c}</span>
                ))}
              </div>
              <p style={{ fontSize: '0.72rem', color: '#999', marginTop: '0.6rem', lineHeight: 1.4 }}>
                El empleado debe existir ya en el sistema — este import solo actualiza correos,
                no da de alta empleados nuevos. Si un empleado tiene varios correos, sepáralos
                por coma dentro de la misma celda.
              </p>
            </div>
          </div>
        )}

        {/* STEP: preview */}
        {step === 'preview' && (
          <div className={styles.body}>
            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.statN}>{rows.length}</span>
                <span className={styles.statL}>Filas detectadas</span>
              </div>
              <div className={`${styles.stat} ${styles.statGreen}`}>
                <span className={styles.statN}>{validRows.length}</span>
                <span className={styles.statL}>Listas para actualizar</span>
              </div>
              {errorRows.length > 0 && (
                <div className={`${styles.stat} ${styles.statRed}`}>
                  <span className={styles.statN}>{errorRows.length}</span>
                  <span className={styles.statL}>Con errores (se omiten)</span>
                </div>
              )}
            </div>

            {errorRows.length > 0 && (
              <div className={styles.errBox}>
                <p className={styles.errTitle}>Filas con errores:</p>
                {errorRows.slice(0, 5).map((r, i) => (
                  <p key={i} className={styles.errItem}>
                    Fila {rows.indexOf(r) + 2} ({r.employeeId || 's/n'}): {r.__error}
                  </p>
                ))}
                {errorRows.length > 5 && <p className={styles.errMore}>...y {errorRows.length - 5} más</p>}
              </div>
            )}

            {validRows.length > 0 && (
              <>
                <p className={styles.previewLabel}>Vista previa — primeras 5 filas válidas</p>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>No. Empleado</th>
                        <th>Nombre</th>
                        {cols.hasCorp  && <th>Correo(s) Corporativo(s)</th>}
                        {cols.hasGmail && <th>Correo(s) Gmail</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 5).map((r, i) => (
                        <tr key={i}>
                          <td><code>{r.employeeId}</code></td>
                          <td>{employeesById.get(r.employeeId) || '—'}</td>
                          {cols.hasCorp  && <td>{r.corporateEmails.join(' · ') || '—'}</td>}
                          {cols.hasGmail && <td>{r.gmailAccounts.join(' · ') || '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className={styles.actions}>
              <button className={styles.btnCancel} onClick={() => setStep('upload')}>← Cambiar archivo</button>
              <button className={styles.btnImport} disabled={validRows.length === 0} onClick={handleImport}>
                Actualizar {validRows.length} empleados
              </button>
            </div>
          </div>
        )}

        {/* STEP: importing */}
        {step === 'importing' && (
          <div className={styles.body}>
            <div className={styles.importing}>
              <div className={styles.spinner} />
              <p className={styles.importingText}>
                Actualizando {progress.done} de {progress.total}...
              </p>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP: done */}
        {step === 'done' && (
          <div className={styles.body}>
            <div className={styles.doneBox}>
              <span className={styles.doneIcon}>✅</span>
              <h3 className={styles.doneTitle}>
                {progress.done} empleados actualizados correctamente
              </h3>
              {importErrors.length > 0 && (
                <p className={styles.doneErrors}>{importErrors.length} registros no se pudieron actualizar</p>
              )}
            </div>
            <div className={styles.actions}>
              <button className={styles.btnImport} onClick={() => { onDone?.(); onClose(); }}>Listo</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
