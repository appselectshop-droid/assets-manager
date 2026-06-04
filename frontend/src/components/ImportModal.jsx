import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import api from '../services/api';
import {
  IMPORT_CATEGORIES, EMPLOYEE_TEMPLATE,
  mapAssetRows, mapEmployeeRows,
} from '../config/importCategories';
import { ASSET_TYPE_LABELS } from '../config/assetFields';
import styles from './ImportModal.module.css';

function downloadTemplate(template) {
  const ws = XLSX.utils.aoa_to_sheet([template.headers, ...template.sample]);
  ws['!cols'] = template.headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Datos');
  XLSX.writeFile(wb, template.name);
}

export default function ImportModal({ entityType, categoryKey, onClose, onDone }) {
  const isEmployee = entityType === 'employees';
  const category = isEmployee ? null : IMPORT_CATEGORIES[categoryKey];
  const template = isEmployee ? EMPLOYEE_TEMPLATE : category?.template;

  const [step, setStep] = useState('upload');
  const [rawData, setRawData] = useState([]);
  const [rows, setRows] = useState([]);
  const [defaultType, setDefaultType] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [importErrors, setImportErrors] = useState([]);
  const inputRef = useRef();

  const validRows = rows.filter((r) => !r.__error);
  const errorRows = rows.filter((r) => r.__error);

  const applyMapping = (raw, dt) => {
    const mapped = isEmployee
      ? mapEmployeeRows(raw)
      : mapAssetRows(raw, category, dt || null);
    setRows(mapped);
  };

  const parseFile = (file) => {
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
      setRawData(raw);
      applyMapping(raw, defaultType);
      setStep('preview');
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDefaultTypeChange = (val) => {
    setDefaultType(val);
    if (rawData.length) applyMapping(rawData, val);
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
      const { __error, ...data } = row;
      try {
        await api.post(isEmployee ? '/employees' : '/assets', data);
        done++;
        setProgress({ done, total: validRows.length });
      } catch (err) {
        failed.push(err.response?.data?.message || 'Error');
      }
    }

    setImportErrors(failed);
    setStep('done');
  };

  const title = isEmployee ? 'Importar empleados' : `Importar — ${category?.label}`;
  const previewCols = isEmployee ? EMPLOYEE_TEMPLATE.previewCols : category?.previewCols;
  const extractRow = isEmployee ? EMPLOYEE_TEMPLATE.previewExtract : category?.previewExtract;

  // ¿Todas las filas fallan por tipo?
  const allMissingType = !isEmployee && rows.length > 0 && rows.every((r) => r.__error === 'Falta el tipo de activo');

  return (
    <div className={styles.overlay} onClick={step !== 'importing' ? onClose : undefined}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={styles.headerIcon}>{isEmployee ? '👥' : category?.icon}</span>
            <div>
              <h2 className={styles.title}>{title}</h2>
              <p className={styles.subtitle}>
                {isEmployee
                  ? 'Carga masiva desde Excel o CSV'
                  : `Tipos válidos: ${category?.typeHint}`}
              </p>
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

            {/* Tipo por defecto — solo para activos */}
            {!isEmployee && (
              <div className={styles.defaultTypeBox}>
                <div className={styles.defaultTypeLeft}>
                  <p className={styles.defaultTypeTitle}>Tipo de activo por defecto</p>
                  <p className={styles.defaultTypeSub}>
                    Si tu Excel no tiene columna "Tipo", todos los registros se importarán con este tipo
                  </p>
                </div>
                <select
                  className={styles.defaultTypeSelect}
                  value={defaultType}
                  onChange={(e) => setDefaultType(e.target.value)}
                >
                  <option value="">Sin tipo por defecto</option>
                  {category?.types.map((t) => (
                    <option key={t} value={t}>{ASSET_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
            )}

            <div className={styles.templateRow}>
              <div>
                <p className={styles.templateTitle}>¿No tienes el formato correcto?</p>
                <p className={styles.templateSub}>Descarga la plantilla con las columnas y datos de ejemplo</p>
              </div>
              <button className={styles.btnTemplate} onClick={() => downloadTemplate(template)}>
                ⬇ Plantilla
              </button>
            </div>

            <div className={styles.colsBox}>
              <p className={styles.colsTitle}>Columnas reconocidas automáticamente</p>
              <div className={styles.colChips}>
                {(isEmployee
                  ? ['No. Empleado ✱', 'Nombre ✱', 'Departamento', 'Puesto', 'Correo']
                  : template?.headers
                ).map((c) => (
                  <span key={c} className={c.includes('✱') || c.includes('*') ? styles.chipReq : styles.chip}>
                    {c.replace(' *', ' ✱')}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* STEP: preview */}
        {step === 'preview' && (
          <div className={styles.body}>

            {/* Alerta tipo por defecto cuando todas las filas fallan */}
            {allMissingType && (
              <div className={styles.alertBox}>
                <span className={styles.alertIcon}>⚠️</span>
                <div>
                  <p className={styles.alertTitle}>No se detectó columna "Tipo" en tu Excel</p>
                  <p className={styles.alertSub}>Selecciona el tipo de activo para todos los registros:</p>
                  <div className={styles.inlineTypeSelect}>
                    {category?.types.map((t) => (
                      <button
                        key={t}
                        className={`${styles.typeBtn} ${defaultType === t ? styles.typeBtnActive : ''}`}
                        onClick={() => handleDefaultTypeChange(t)}
                      >
                        {ASSET_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className={styles.statsRow}>
              <div className={styles.stat}>
                <span className={styles.statN}>{rows.length}</span>
                <span className={styles.statL}>Filas detectadas</span>
              </div>
              <div className={`${styles.stat} ${styles.statGreen}`}>
                <span className={styles.statN}>{validRows.length}</span>
                <span className={styles.statL}>Listas para importar</span>
              </div>
              {errorRows.length > 0 && (
                <div className={`${styles.stat} ${styles.statRed}`}>
                  <span className={styles.statN}>{errorRows.length}</span>
                  <span className={styles.statL}>Con errores (se omiten)</span>
                </div>
              )}
            </div>

            {errorRows.length > 0 && !allMissingType && (
              <div className={styles.errBox}>
                <p className={styles.errTitle}>Filas con errores:</p>
                {errorRows.slice(0, 5).map((r, i) => (
                  <p key={i} className={styles.errItem}>Fila {rows.indexOf(r) + 2}: {r.__error}</p>
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
                      <tr>{previewCols?.map((c) => <th key={c}>{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {validRows.slice(0, 5).map((r, i) => (
                        <tr key={i}>
                          {extractRow?.(r).map((v, j) => <td key={j}>{v}</td>)}
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
                Importar {validRows.length} {isEmployee ? 'empleados' : 'activos'}
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
                Importando {progress.done} de {progress.total}...
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
                {progress.done} {isEmployee ? 'empleados' : 'activos'} importados correctamente
              </h3>
              {importErrors.length > 0 && (
                <p className={styles.doneErrors}>{importErrors.length} registros no se pudieron guardar</p>
              )}
            </div>
            <div className={styles.actions}>
              <button className={styles.btnImport} onClick={() => { onDone(); onClose(); }}>Listo</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
