// Lectura mínima de un CFDI 3.3/4.0 (XML del SAT) — solo los datos que
// sirven en Pagos Recurrentes: total, moneda, serie/folio, fecha, emisor y
// UUID del timbre. Sin dependencias: el CFDI es XML plano con atributos en
// nodos conocidos, basta con leer los atributos de esos nodos. Si el
// archivo no es un CFDI (o viene raro) devuelve null y el archivo se guarda
// igual — nunca bloquea la subida.
function attrsOf(xml, tag) {
  const m = xml.match(new RegExp(`<(?:[\\w]+:)?${tag}\\b([^>]*)>`, 'i'));
  if (!m) return null;
  const attrs = {};
  const decode = (v) => v.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  for (const a of m[1].matchAll(/([\w:]+)\s*=\s*"([^"]*)"/g)) attrs[a[1].replace(/^\w+:/, '')] = decode(a[2]);
  return attrs;
}

function parseCfdi(buffer) {
  try {
    const xml = buffer.toString('utf8');
    const comp = attrsOf(xml, 'Comprobante');
    if (!comp) return null;
    const emisor = attrsOf(xml, 'Emisor') || {};
    const receptor = attrsOf(xml, 'Receptor') || {};
    const timbre = attrsOf(xml, 'TimbreFiscalDigital') || {};
    const total = Number(comp.Total);
    return {
      uuid: (timbre.UUID || '').toUpperCase(),
      serie: comp.Serie || '',
      folio: comp.Folio || '',
      fecha: comp.Fecha || '',
      total: Number.isFinite(total) ? total : null,
      moneda: comp.Moneda || '',
      tipo: comp.TipoDeComprobante || '',
      emisorNombre: emisor.Nombre || '',
      emisorRfc: emisor.Rfc || '',
      receptorNombre: receptor.Nombre || '',
      receptorRfc: receptor.Rfc || '',
    };
  } catch {
    return null;
  }
}

module.exports = { parseCfdi };
