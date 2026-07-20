// Catálogo real de impresoras por sucursal — pasado por el usuario
// (archivo "DIGITAL COPY 26 (2).xlsx", hoja MARZO, tabla MODELO/SERIE/
// NOMBRE de cada sucursal — el listado de equipos en sí no cambia mes a
// mes, solo las copias usadas, así que se tomó la hoja más reciente).
// Alimenta el selector de "¿Cuál impresora es?" en ReportarTicket.jsx
// (categoría Impresoras), en vez de que quien reporta escriba el nombre a
// mano — con el modelo y número de serie reales, Sistemas ya sabe
// exactamente cuál equipo es sin tener que preguntar.
//
// Hay 2 sucursales distintas llamadas "Tepotzotlán" en el archivo original
// (una del contrato de Select Shop, otra del de Bloom & Blush, cada una con
// su propio grupo de impresoras) — se distinguen aquí por la empresa entre
// paréntesis, tal cual venían separadas en el archivo.
export const PRINTER_CATALOG = [
  {
    branch: 'Naucalpan',
    printers: [
      { nombre: 'General', modelo: 'MX-2610N', serie: '25022836' },
    ],
  },
  {
    branch: 'Polanco',
    printers: [
      { nombre: 'Administración', modelo: 'MX-3070N', serie: '85068442' },
      { nombre: 'Ventas', modelo: 'MX-M3070N', serie: '8501532X' },
      { nombre: 'Contabilidad', modelo: 'MX-C301W', serie: '73011402' },
      { nombre: 'RH', modelo: 'MX-C301W', serie: '73015571' },
    ],
  },
  {
    branch: 'Tepotzotlán (Select Shop)',
    printers: [
      { nombre: 'Bodega Meli', modelo: 'MXN455W', serie: '8F001165' },
      { nombre: 'Oficinas', modelo: 'MX-3070N', serie: '65069646' },
      { nombre: 'Bodega', modelo: 'MX-M3070N', serie: '95004425' },
      { nombre: 'Entrada', modelo: 'MX-M3070N', serie: '85008955' },
    ],
  },
  {
    branch: 'Iztapalapa',
    printers: [
      { nombre: 'P1 Alto Valor', modelo: 'MX-M365N', serie: '55017357' },
      { nombre: 'Facturación', modelo: 'MX-414IN', serie: '55102284' },
      { nombre: 'Almacén', modelo: 'MX-M365N', serie: '55005415' },
      { nombre: 'Taller', modelo: 'MX-M6070N', serie: '95016365' },
    ],
  },
  {
    branch: 'Tepotzotlán (Bloom & Blush)',
    printers: [
      { nombre: 'CEDIS', modelo: 'MX-M3571', serie: '5012013' },
    ],
  },
  {
    branch: 'Cuernavaca',
    printers: [
      { nombre: 'Eq. 1 Administración', modelo: 'MX-3071', serie: '95073910' },
      { nombre: 'Eq. 2 Enfermería', modelo: 'MX-M3070N', serie: '85015147' },
      { nombre: 'Golden', modelo: 'MX-C304', serie: '3300517X' },
    ],
  },
];

// Escape hatch si su impresora no está en el catálogo (uno nuevo, una
// sucursal que falte, etc.) — deja seguir reportando con texto libre, como
// funcionaba antes de este catálogo.
export const OTHER_PRINTER_OPTION = '__otra__';

export function printerOptionLabel(p) {
  return `${p.nombre} — ${p.modelo} (Serie ${p.serie})`;
}

export function printerOptionValue(branch, printer) {
  return `${branch}|${printer.serie}`;
}

export function findPrinterByValue(value) {
  const [branch, serie] = value.split('|');
  const group = PRINTER_CATALOG.find((g) => g.branch === branch);
  const printer = group?.printers.find((p) => p.serie === serie);
  return printer ? { branch, printer } : null;
}
