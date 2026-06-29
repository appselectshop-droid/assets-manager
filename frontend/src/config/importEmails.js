import { norm } from './importCategories';

const EMP_ID_COLS = [
  'no empleado', 'num empleado', 'numero empleado', 'numero de empleado',
  'no. empleado', 'id empleado', 'empleado', 'clave', 'clave empleado',
];

const CORP_EMAIL_COLS = [
  'correo corporativo', 'correos corporativos', 'correo empresa',
  'correo empresarial', 'email corporativo', 'correo institucional',
];

const GMAIL_COLS = [
  'correo gmail', 'correos gmail', 'gmail', 'cuenta gmail',
  'cuentas gmail', 'correo personal', 'correos personales',
];

const splitEmails = (val) =>
  String(val).split(/[,;\n]+/).map((e) => e.trim()).filter(Boolean);

/* Detecta, a partir de las cabeceras del Excel, qué columnas trae el archivo
   (para no borrar en el backend un campo que el usuario no quiso tocar) */
export function detectEmailColumns(rawRows) {
  const headers = rawRows.length ? Object.keys(rawRows[0]).map(norm) : [];
  return {
    hasCorp:  headers.some((h) => CORP_EMAIL_COLS.includes(h)),
    hasGmail: headers.some((h) => GMAIL_COLS.includes(h)),
  };
}

export function mapEmailRows(rawRows) {
  return rawRows.map((raw) => {
    const obj = { employeeId: '', corporateEmails: [], gmailAccounts: [] };

    for (const [col, val] of Object.entries(raw)) {
      const key = norm(col);
      if (val === '' || val == null) continue;

      if (EMP_ID_COLS.includes(key)) {
        obj.employeeId = String(val).trim();
      } else if (CORP_EMAIL_COLS.includes(key)) {
        obj.corporateEmails.push(...splitEmails(val));
      } else if (GMAIL_COLS.includes(key)) {
        obj.gmailAccounts.push(...splitEmails(val));
      }
    }

    if (!obj.employeeId) {
      obj.__error = 'Falta el No. de empleado';
    } else if (obj.corporateEmails.length === 0 && obj.gmailAccounts.length === 0) {
      obj.__error = 'Sin correos para importar en esta fila';
    }

    return obj;
  });
}

export const EMAIL_TEMPLATE = {
  name: 'plantilla_correos_empleados.xlsx',
  headers: ['No. Empleado *', 'Correo Corporativo', 'Correo Gmail'],
  sample: [
    ['EMP001', 'juan.perez@selectshop.com', 'juan.perez@gmail.com'],
    ['EMP002', 'maria.garcia@selectshop.com, maria.g@selectshop.com', ''],
  ],
};
