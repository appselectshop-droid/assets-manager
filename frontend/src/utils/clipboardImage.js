// Ctrl+V/Cmd+V de una captura de pantalla — el navegador SÍ mete la imagen
// en el portapapeles como items de `clipboardData`, pero no la pega
// visualmente en un textarea (no hay nada que "prevenir" ahí), así que
// basta con revisar si viene un item de imagen y tratarlo igual que si se
// hubiera elegido con el input de archivo. El File que da el navegador casi
// siempre viene sin nombre real (o vacío) — se le pone uno por si el
// back/la lista de adjuntos necesitan mostrar algo legible. Compartido
// entre el "Responder" del chat y las Notas internas (TicketDetailModal.jsx
// e InternalNotesPanel.jsx).
export function imageFileFromClipboard(e) {
  const item = [...(e.clipboardData?.items || [])].find((it) => it.type.startsWith('image/'));
  if (!item) return null;
  const file = item.getAsFile();
  if (!file) return null;
  return file.name ? file : new File([file], `pegado-${Date.now()}.png`, { type: file.type });
}
