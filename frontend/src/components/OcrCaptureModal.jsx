import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import styles from '../pages/Assets.module.css';

// Leer número de serie/modelo con la cámara — pedido explícito del usuario
// (2026-09-04): "como con el traductor que lee palabras y las traduce, así
// pero que se jale número de serie y números de modelo". Toma una foto de
// la etiqueta, deja recortar solo el pedazo con el texto (mejora mucho la
// lectura vs. mandar la foto completa) y se la manda a un modelo de visión
// (Groq, del lado del backend — ver POST /assets/ocr) que interpreta el
// texto en vez de solo reconocer caracteres a ciegas como un OCR clásico.
// A diferencia de la primera versión (Tesseract.js, corría 100% en el
// navegador), aquí la foto sí viaja al backend y de ahí a Groq para
// procesarse — la API key nunca está en el navegador.
//
// `targets`: [{ key, label }] — a qué campos se puede mandar cada línea
// reconocida (ej. Marca/Modelo/No. de serie). El modal NO se cierra solo al
// asignar una línea — pedido explícito del usuario (2026-09-05): "si quieres
// llenar cosa por cosa, no te deja" — una sola foto suele traer varios datos
// (serie Y modelo a la vez), así que hay que poder mandar cada línea a su
// campo, una por una, sin volver a tomar la foto ni reabrir el modal.
export default function OcrCaptureModal({ targets, onAssign, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null); // foto completa a resolución real
  const imgRef = useRef(null); // <img> mostrado en pantalla (para mapear el recorte)
  const [photo, setPhoto] = useState(null); // dataURL de la foto tomada
  const [status, setStatus] = useState('camera'); // camera | crop | recognizing | done | error
  const [lines, setLines] = useState([]);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(null); // { startX, startY, x, y }
  // Qué línea ya se mandó a qué campo(s) — solo para avisar visualmente
  // ("✓ Modelo") que sí se aplicó, sin cerrar el modal.
  const [assignedLog, setAssignedLog] = useState({}); // { [lineIndex]: [label, label...] }

  const assign = (lineIndex, target) => {
    onAssign(target.key, lines[lineIndex]);
    setAssignedLog((prev) => ({
      ...prev,
      [lineIndex]: [...(prev[lineIndex] || []), target.label],
    }));
  };

  useEffect(() => {
    if (photo) return; // ya se tomó la foto, no seguir usando la cámara
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } })
      .then((stream) => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => setError('No se pudo acceder a la cámara — revisa los permisos del navegador para este sitio.'));
    return () => streamRef.current?.getTracks().forEach((t) => t.stop());
  }, [photo]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    canvasRef.current = canvas;
    setPhoto(canvas.toDataURL('image/jpeg', 0.95));
    setStatus('crop');
  };

  // Recorte a mano — arrastrar sobre la foto para marcar solo el texto que
  // importa (número de serie, modelo). Sin selección, se usa la foto
  // completa tal cual.
  const posFromEvent = (e) => {
    const rect = imgRef.current.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };
  const handlePointerDown = (e) => {
    const p = posFromEvent(e);
    setDrag({ startX: p.x, startY: p.y, x: p.x, y: p.y });
  };
  const handlePointerMove = (e) => {
    if (!drag) return;
    const p = posFromEvent(e);
    setDrag((d) => ({ ...d, x: p.x, y: p.y }));
  };
  const handlePointerUp = () => {};

  const runOcr = async () => {
    const img = imgRef.current;
    const full = canvasRef.current;
    let target = full;

    const rectWidth = drag ? Math.abs(drag.x - drag.startX) : 0;
    const rectHeight = drag ? Math.abs(drag.y - drag.startY) : 0;
    if (drag && rectWidth > 15 && rectHeight > 15) {
      // Convierte la selección (coordenadas de pantalla) a píxeles reales
      // de la foto — el <img> se muestra más chico/grande que su resolución.
      const scaleX = full.width / img.clientWidth;
      const scaleY = full.height / img.clientHeight;
      const sx = Math.min(drag.startX, drag.x) * scaleX;
      const sy = Math.min(drag.startY, drag.y) * scaleY;
      const sw = rectWidth * scaleX;
      const sh = rectHeight * scaleY;
      const cropCanvas = document.createElement('canvas');
      cropCanvas.width = sw;
      cropCanvas.height = sh;
      cropCanvas.getContext('2d').drawImage(full, sx, sy, sw, sh, 0, 0, sw, sh);
      target = cropCanvas;
    }

    setStatus('recognizing');
    setError('');
    try {
      const blob = await new Promise((resolve) => target.toBlob(resolve, 'image/jpeg', 0.92));
      const fd = new FormData();
      fd.append('photo', blob, 'etiqueta.jpg');
      const { data } = await api.post('/assets/ocr', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setLines(data.lines || []);
      setStatus('done');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo leer el texto de la foto. Intenta de nuevo con más luz, más de cerca, o recortando solo el texto.');
      setStatus('error');
    }
  };

  const retake = () => {
    setPhoto(null);
    setLines([]);
    setAssignedLog({});
    setDrag(null);
    setStatus('camera');
    setError('');
  };

  const recropAgain = () => {
    setLines([]);
    setAssignedLog({});
    setDrag(null);
    setStatus('crop');
    setError('');
  };

  const rectStyle = drag ? {
    left: Math.min(drag.startX, drag.x),
    top: Math.min(drag.startY, drag.y),
    width: Math.abs(drag.x - drag.startX),
    height: Math.abs(drag.y - drag.startY),
  } : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🔤</span>
          <h2 className={styles.modalTitle}>Leer con cámara</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.form}>
          {error && <p className={styles.formError}>{error}</p>}

          {status === 'camera' && !error && (
            <>
              <div className={styles.scannerVideoWrap}>
                <video ref={videoRef} autoPlay muted playsInline className={styles.scannerVideo} />
              </div>
              <p className={styles.serialProgress}>Encuadra la etiqueta con el número de serie/modelo bien iluminada.</p>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={onClose}>Cancelar</button>
                <button type="button" className={styles.btnPrimary} onClick={capture}>📷 Tomar foto</button>
              </div>
            </>
          )}

          {status === 'crop' && (
            <>
              <p className={styles.serialProgress}>
                Marca con el dedo/mouse solo el número de serie o modelo (mejora mucho la lectura) — o toca "Leer" sin marcar nada para usar toda la foto.
              </p>
              <div
                className={styles.ocrCropWrap}
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              >
                <img ref={imgRef} src={photo} alt="" className={styles.ocrPreview} draggable={false} />
                {rectStyle && <div className={styles.ocrCropRect} style={rectStyle} />}
              </div>
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={retake}>🔄 Tomar otra foto</button>
                <button type="button" className={styles.btnPrimary} onClick={runOcr}>🔤 Leer texto</button>
              </div>
            </>
          )}

          {(status === 'recognizing' || status === 'done' || status === 'error') && (
            <>
              <img src={photo} alt="" className={styles.ocrPreview} />
              {status === 'recognizing' && <p className={styles.serialProgress}>Leyendo texto de la foto...</p>}
              {status === 'done' && (
                <>
                  <p className={styles.serialProgress}>
                    {lines.length > 0
                      ? 'Para cada línea, toca a qué campo mandarla — puedes usar varias de la misma foto.'
                      : 'No se reconoció texto legible — intenta recortar más de cerca.'}
                  </p>
                  <div className={styles.ocrLines}>
                    {lines.map((line, i) => (
                      <div key={i} className={styles.ocrLineRow}>
                        <code className={styles.ocrLineText}>{line}</code>
                        <div className={styles.ocrLineTargets}>
                          {targets.map((t) => (
                            <button
                              key={t.key}
                              type="button"
                              className={styles.ocrTargetBtn}
                              onClick={() => assign(i, t)}
                            >
                              → {t.label}
                            </button>
                          ))}
                        </div>
                        {assignedLog[i]?.length > 0 && (
                          <p className={styles.ocrAssignedTag}>✓ Usado en: {assignedLog[i].join(', ')}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={recropAgain}>↩️ Recortar de nuevo</button>
                <button type="button" className={styles.btnCancel} onClick={retake}>🔄 Tomar otra foto</button>
                <button type="button" className={styles.btnPrimary} onClick={onClose}>Listo</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
