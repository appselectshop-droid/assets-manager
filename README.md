# Assets Manager — SelectShop

Sistema interno de control de activos (laptops, equipos de escritorio, celulares, accesorios) del departamento de IT de **SelectShop MB SA DE CV**. Permite asignar equipo a empleados, llevar inventario/stock, generar la responsiva en PDF y auditar cambios.

## Stack

| Capa      | Tecnología                                            |
|-----------|--------------------------------------------------------|
| Frontend  | React 18 + Vite, React Router, CSS Modules, axios, xlsx |
| Backend   | Node.js + Express + Mongoose 8                          |
| Base de datos | MongoDB Atlas                                       |
| Auth      | JWT (`jsonwebtoken` + `bcryptjs`)                       |
| PDF       | `pdfkit` (responsiva de entrega de equipo)              |

### Despliegue

- **Frontend** → Vercel (`frontend/`, build con `vite build`, config en `frontend/vercel.json`).
- **Backend** → Render free tier (`backend/`, arranca con `node src/index.js`). El free tier "duerme"; el primer request tras inactividad tarda ~50s (cold start).
- **DB** → MongoDB Atlas, conexión vía variable `MONGO_URI`.

## Estructura del repo

```
assets-manager/
├── backend/
│   └── src/
│       ├── index.js            # entrypoint Express, monta rutas y conecta Mongo
│       ├── middleware/
│       │   ├── auth.js         # valida JWT, llena req.user = { id, name, role }
│       │   └── adminOnly.js    # exige req.user.role === 'admin'
│       ├── models/              # Asset, Assignment, Employee, User, AuditLog, GmailAccount, PlatformAccount
│       ├── routes/              # auth, employees, assets, assignments, users, audit, responsiva, gmailAccounts, platformAccounts
│       ├── utils/audit.js       # logAction() — nunca lanza error, registra en AuditLog
│       ├── utils/gmailVault.js  # cifrado AES-256-GCM y generador de contraseñas (usado por gmailAccounts y platformAccounts) + sugeridor de correo Gmail
│       └── assets/              # logo.png y logos/ (usados en el PDF de responsiva)
├── frontend/
│   └── src/
│       ├── App.jsx              # rutas (React Router), PrivateRoute / AdminRoute
│       ├── pages/                # Dashboard, Employees, EmployeeDetail, Assets, Assignments,
│       │                          Accessories, Stock, Users, Audit, GmailAccounts, PlatformAccounts, Login
│       ├── components/           # Layout, ImportModal
│       ├── config/                # assetFields.js, importCategories.js (catálogos de tipos/campos)
│       └── services/api.js       # instancia axios con baseURL + interceptor de token
├── responsiva_ref/               # plantilla Excel original (Responsiva_Unificada_v20.xlsm) y logos fuente
└── generar_manual.py             # script Python (python-docx) que genera el manual de usuario en Word
```

## Puesta en marcha en local

Requisitos: Node 18+, una base MongoDB (Atlas o local).

```bash
# Backend
cd backend
npm install
cp .env.example .env     # rellenar valores reales, ver tabla abajo
npm run dev               # nodemon, puerto definido en PORT (4000 por defecto)

# Frontend (otra terminal)
cd frontend
npm install
npm run dev                # Vite, proxy /api -> localhost:4000 en dev
```

Login inicial: no hay seed de usuario admin. Crear el primero con `POST /api/auth/register` (ver `backend/src/routes/auth.js`) y luego, si hace falta, subir su `role` a `admin` directamente en MongoDB.

### Variables de entorno

**`backend/.env`**
```
PORT=4000
MONGO_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/assets-manager
JWT_SECRET=cambia_esto_por_un_secreto_seguro
FRONTEND_URL=https://tu-app.vercel.app
GMAIL_VAULT_KEY=clave-larga-y-secreta-para-cifrar-contraseñas-de-gmail
```

**`frontend/.env`** (solo necesario en producción/preview; en local el proxy de Vite ya resuelve `/api`)
```
VITE_API_URL=https://tu-backend.onrender.com
```

## Modelo de datos (Mongoose)

- **Employee** — `employeeId` (único), `name`, `businessName`, `office`, `position`, `area`, `department`, `phone`, `corporateEmails[]`, `gmailAccounts[]`, `active`.
- **Asset** — `category` (`equipo`/`accesorio`), `type` (laptop, escritorio, all_in_one, monitor, mouse, teclado, celular, tablet, cargadores, etc.), `brand`, `model`, `serialNumber`, `inventoryTag`, `status` (`disponible`/`asignado`/`baja`), `purchaseDate`, `stockTotal`, `location`, `notes`, `specs` (Mixed — usar `markModified('specs')` + `.save()`, **no** `findByIdAndUpdate`).
- **Assignment** — relaciona `employee` ↔ `asset`, con `assignedDate`, `returnDate`, `quantity`, `active`.
- **User** — `name`, `email` (único), `password` (hash bcrypt), `role` (`admin`/`viewer`), `canManageGmailAccounts`, `canManagePlatformAccounts` (permisos independientes del rol; ver nota abajo).
- **GmailAccount** — `employee` (ref, obligatorio — no es reciclable por ahora), `email` (único, `@gmail.com`), `passwordEncrypted` (AES-256-GCM vía `backend/src/utils/gmailVault.js`, clave `GMAIL_VAULT_KEY`), `passwordManuallySet` (una corrección manual de contraseña por cuenta, luego se deshabilita), `status` (`activa`/`inactiva`), `notes`, `createdByName`. La contraseña se genera siempre en el servidor (nunca la captura el usuario, salvo en `POST /import` para cuentas que ya existían) para evitar reúso entre cuentas.
- **PlatformAccount** — igual que `GmailAccount` pero para cualquier plataforma (Microsoft, Amazon, Netflix, etc.): `employee` (ref, **opcional** — `null` significa disponible para reciclar; es la única de las dos que hoy soporta desasignar/reasignar), `platform` (texto libre), `username` (sin restricción de dominio), `passwordEncrypted`, `passwordManuallySet`, `status`, `notes`, `createdByName`. Índice único `platform+username`.
- **AuditLog** — `userId`, `userName`, `action` (`crear`/`editar`/`eliminar`/`asignar`/`devolver`), `entity` (`activo`/`empleado`/`usuario`/`cuenta_gmail`/`cuenta_plataforma`), `entityId`, `entityName`, `details`. Se escribe vía `logAction()` (`backend/src/utils/audit.js`), que nunca interrumpe el flujo si falla.

## API (todas bajo `/api`, requieren `Authorization: Bearer <token>` salvo donde se indica)

| Recurso          | Endpoints |
|-------------------|-----------|
| `auth`            | `POST /register` (sin auth), `POST /login` (sin auth) |
| `employees`       | `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id` |
| `assets`          | `GET /`, `POST /`, `GET /:id`, `PUT /:id`, `DELETE /:id` |
| `assignments`     | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` |
| `users`           | `GET /`, `POST /`, `PUT /:id`, `DELETE /:id` *(admin)* |
| `audit`           | `GET /`, `GET /users` |
| `responsiva`      | `GET /:employeeId` → genera y descarge el PDF de responsiva (pdfkit) |
| `gmail-accounts`  | `GET /`, `GET /suggest-email?employeeId=`, `GET /unregistered` (correos ya en `Employee.gmailAccounts[]` o en `Asset.specs.gmailAccount` de celulares/tablets asignados, sin contraseña guardada), `POST /` (alta con contraseña autogenerada), `POST /import` (alta capturando una contraseña ya existente), `PUT /:id` (`notes`/`status`/`regeneratePassword`/`manualPassword` una vez — Gmail no soporta `unassign`/reciclaje), `DELETE /:id` — requiere el permiso `canManageGmailAccounts` (no el rol admin), ver nota abajo |
| `platform-accounts` | `GET /`, `GET /:id/responsiva` (PDF de solicitud/responsiva de la cuenta, sin contraseña), `GET /unregistered-corporate` (correos ya en `Employee.corporateEmails[]` sin cuenta Microsoft 365 guardada), `POST /` (alta con contraseña autogenerada), `POST /import` (alta capturando una contraseña ya existente), `PUT /:id` (mismos campos que gmail-accounts), `DELETE /:id` — requiere el permiso `canManagePlatformAccounts` (independiente de `canManageGmailAccounts`), ver nota abajo |

`GET/HEAD /health` — healthcheck sin auth (usado por Render).

## Funcionalidad por página (frontend)

- **Dashboard** — resumen general.
- **Employees / EmployeeDetail** — alta/edición de empleados, equipo asignado, botón "Generar Responsiva" (descarga PDF vía `api.get('/responsiva/:id', { responseType: 'blob' })`). Si el usuario tiene `canManageGmailAccounts`/`canManagePlatformAccounts`, EmployeeDetail también muestra una sección "Cuentas" (separada de "Activos asignados") con **todas** las cuentas Gmail del empleado (solo lectura) y sus cuentas de Plataformas — desde ahí se asigna una cuenta disponible o se desasigna una existente (con la opción de reasignarla directo a otro empleado o mandarla a disponible); las páginas de Cuentas Gmail/Plataformas quedan para crear, editar y exportar.
- **Assets** — catálogo de equipos individuales (laptops, desktops, celulares…).
- **Accessories** — catálogo de accesorios por cantidad a granel (monitor, mouse, teclado…), rediseñado para tracking de stock total.
- **Stock** — vista de inventario filtrable por sucursal/ubicación, con modal de asignación (busca empleado por número o teléfono). Si el usuario tiene `canManagePlatformAccounts`, también muestra una sección "Cuentas de Plataformas" con las cuentas disponibles (sin empleado) agrupadas por plataforma, con su propio modal de asignación.
- **Assignments** — historial de asignaciones/devoluciones.
- **Users / Audit** — solo `role: admin` (protegidas por `AdminRoute` en `App.jsx`).
- **GmailAccounts** — gestor de contraseñas de cuentas Gmail: sugiere correo, genera contraseña única automáticamente (no editable a mano, salvo al importar cuentas ya existentes), permite ver/copiar/regenerar contraseña (con confirmación explícita) y exportar todo a Excel. Protegida por `GmailManagerRoute` (permiso `canManageGmailAccounts`), **independiente del rol admin**.
- **PlatformAccounts** — mismo gestor de contraseñas pero para Microsoft, Amazon, Netflix, etc. (plataforma de texto libre, sin restricción de dominio), con filtros (plataforma/empresa/oficina/estado/búsqueda) y exportación a Excel que respeta esos filtros, igual que Assignments. Protegida por `PlatformManagerRoute` (permiso `canManagePlatformAccounts`), **independiente tanto del rol admin como del permiso de Gmail**.
- Solo `sistemas.2@selectshop.com.mx` (constante `GMAIL_ROOT_EMAIL` en `backend/src/config/permissions.js`) puede otorgar/revocar `canManageGmailAccounts` y `canManagePlatformAccounts` a otras cuentas, cada uno por separado, desde controles exclusivos en la página de Usuarios.
- **Login** — JWT guardado en `localStorage` (`token`, `user`); interceptor de axios redirige a `/login` ante un 401.

## Responsiva (PDF)

`backend/src/routes/responsiva.js` genera con `pdfkit` un PDF tamaño carta listo para firma, basado en la plantilla original `responsiva_ref/Responsiva_Unificada_v20.xlsm`. Incluye: datos del empleado, equipo y accesorios asignados, cláusulas legales (LFT arts. 110/132/134/135) y bloque de firmas (Entrega IT / Recibe Empleado / Autoriza Jefe). El logo usado en el PDF vive en `backend/src/assets/logo.png` (copia de `responsiva_ref/logos/image1.png`); logos de empresas/marcas adicionales están en `backend/src/assets/logos/`.

Las funciones de layout/marca compartidas (color y logo por empresa, helpers de `pdfkit`) viven en `backend/src/utils/pdfBranding.js`, reutilizadas por dos generadores de PDF:
- `responsiva.js` — responsiva de equipo/activos, arriba.
- `platformAccounts.js` (`GET /:id/responsiva`) — "Solicitud y Carta Responsiva de Cuenta de Acceso a Plataformas Digitales", basada en la plantilla `Responsiva_Cuentas_Plataformas.docx` del usuario. Se llena con los datos del empleado y de la cuenta de plataforma (nunca la contraseña), y usa `[ ]`/`[X]` en vez de ☐/☒ para el checkbox de plataforma, porque esos caracteres Unicode no se renderizan con la fuente estándar de `pdfkit`.

## Branding

Naranja SelectShop `#E8431A` + negro `#1a1a1a` (usar estos valores exactos en cualquier UI o documento nuevo).

## Notas para el equipo que retoma el proyecto

1. El repo ya vive en GitHub: `https://github.com/appselectshop-droid/assets-manager`. Pedir acceso de colaborador al dueño actual de la cuenta `appselectshop-droid`.
2. Las credenciales reales (`MONGO_URI`, `JWT_SECRET`, accesos a Vercel/Render) **no están en el repo** (`.gitignore` excluye `.env`). Deben transferirse por un canal seguro aparte (no por chat/email plano).
3. `users.js` no tiene el middleware `auth` aplicado a sus rutas — a diferencia del resto de los recursos. Vale la pena revisarlo si se va a endurecer la seguridad.
4. No hay seed/migration scripts ni tests automatizados en este repo; el alta de datos se hizo manualmente desde la UI o importando Excel (`ImportModal.jsx` + `xlsx`).
5. `generar_manual.py` (raíz del repo) regenera el manual de usuario en Word con `python-docx`; requiere Python 3 y `pip install python-docx`.
