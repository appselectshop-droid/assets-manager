# Changelog — Assets Manager (SelectShop)

> **Propósito de este archivo:** este es el documento que debe leerse al inicio de cualquier sesión de trabajo (humana o con IA) sobre este repo. Junto con `README.md` (arquitectura, stack, modelo de datos, endpoints) da el contexto completo: **qué es el proyecto** y **qué cambios se han hecho y por qué**. Cada cambio nuevo (feature, fix, refactor) debe agregarse aquí como una entrada nueva arriba del todo, siguiendo el formato de la sección "Cómo agregar una entrada".

## Resumen rápido del proyecto

Sistema interno de control de activos IT (laptops, equipos de escritorio, celulares, accesorios) de **SelectShop MB SA DE CV**: alta/asignación de equipo a empleados, inventario/stock, generación de responsiva en PDF y auditoría de cambios.

- **Frontend**: React 18 + Vite → desplegado en Vercel.
- **Backend**: Node.js + Express + Mongoose 8 → desplegado en Render (free tier, cold start ~50s).
- **DB**: MongoDB Atlas.
- **Auth**: JWT (`jsonwebtoken` + `bcryptjs`).
- **Deploy**: push a `main` en GitHub (`appselectshop-droid/assets-manager`) dispara auto-deploy en Vercel y Render.

Detalle completo de estructura de carpetas, modelo de datos, variables de entorno y endpoints de la API: ver [`README.md`](./README.md).

## Cómo agregar una entrada

Cada vez que se haga un cambio relevante (feature, fix, refactor, cambio de infraestructura), agregar arriba de todo un bloque así:

```
### YYYY-MM-DD — Título corto del cambio
- **Qué cambió:** descripción concreta (archivos/módulos afectados).
- **Por qué:** el motivo de negocio o técnico (bug reportado, solicitud del equipo, deadline, etc.).
- **Commit(s):** hash(es) corto(s).
```

---

### 2026-07-20 — Confirmar antes de salir de un panel de editar con cambios sin guardar
- **Qué pasó:** el usuario reportó que, si seleccionaba algo "hacia la izquierda"
  (el menú/sidebar) mientras editaba un panel, este se cerraba solo y
  perdía todo lo escrito, sin avisar. Pidió protección general, en todas las
  páginas con panel de editar, con una confirmación antes de salir.
- **La causa real:** el fondo oscuro detrás de cada modal (`.overlay`, con
  `position: fixed; inset: 0`) cubre TODA la pantalla — así que un clic
  "hacia el menú" en realidad cae sobre ese fondo semi-transparente, no
  sobre el menú de verdad. El fondo ya tenía su propio `onClick={() =>
  setShowModal(false)}` de toda la vida, sin ningún aviso.
- **Qué hice:** `frontend/src/hooks/useConfirmDirtyNavigation.js` (nuevo) —
  un solo listener global (montado en `App.jsx`, junto a los otros 2 hooks
  de esta semana) que cubre los ~20 modales de edición del panel admin y del
  portal de empleado, todos con las mismas clases `overlay`/`modal`, sin
  tocar cada página una por una. Detecta "¿hay cambios sin guardar?"
  tomando una foto del valor real de cada campo apenas aparece en el DOM (vía
  `MutationObserver` + `WeakMap`) y comparándola contra el valor actual —
  **no** contra la propiedad nativa `defaultValue`, que en un primer intento
  resultó no servir: React la resincroniza sola en cada re-render para que
  coincida con el valor actual (para que un reset del navegador restaure al
  último valor, no al original), así que dejaba de detectar cambios en
  cuanto la persona tecleaba una letra.
- **Qué NO cambia:** clics dentro del contenido del modal (campos, Guardar,
  Cancelar, la X) siguen igual, sin ninguna confirmación de más — solo se
  protege la navegación hacia otro lado. Los `<select>` no cuentan para
  "¿está sucio?" (mismo problema del `defaultValue`, pero sin forma
  confiable de arreglarlo sin tocar cada página) — solo inputs, textareas,
  checkboxes y radios.
- **Verificación:** `npm run build`; Playwright — probé en el panel de
  Empleados (editar) y en la conversación de un ticket (Mis Tickets):
  confirmar cancela y conserva los datos; aceptar sí navega; un modal
  SIN tocar nada no muestra ningún aviso (antes daba falso positivo por los
  `<select>`, ya corregido); y sin ningún modal abierto, navegar funciona
  exactamente igual que siempre.
- **Commit(s):** (pendiente)

### 2026-07-20 — Tab rellena los ejemplos ("Ej. ...") de cualquier campo, en toda la app
- **Qué pasó:** el usuario pidió que, en cualquier página/pestaña, si un campo
  vacío muestra un ejemplo como placeholder (ej. "Ej. Héctor Ramírez"), poder
  usar Tab para rellenarlo con ese ejemplo en vez de escribirlo a mano.
- **Qué hice:** `frontend/src/hooks/useTabFillExamples.js` (nuevo) — un solo
  listener de teclado global, montado una vez en `App.jsx`, que cubre TODA
  la app sin tocar cada formulario uno por uno. Solo actúa cuando: el campo
  enfocado es un `<input>` de texto o un `<textarea>`, está vacío, y su
  placeholder empieza con "Ej."/"ej." (la única señal confiable de "esto es
  un valor literal para aceptar" — placeholders instructivos como "Escribe
  tu nombre..." o "¿Por qué se necesita?" no califican, a propósito). El
  primer Tab rellena el campo (sin mover el foco, para poder ver/editar lo
  que puso); como ya deja de estar vacío, el segundo Tab navega normal al
  siguiente campo — igual que aceptar un autocompletado.
- **Por qué:** para no tener que teclear a mano un ejemplo que de todos modos
  ya está escrito en el placeholder.
- **Verificación:** `npm run build`; Playwright — confirmé en el campo "¿Cuál
  impresora es?" de Reportar Ticket que el 1er Tab rellena con el ejemplo y
  el 2do mueve el foco al siguiente campo sin tocar lo que ya tenía texto;
  y confirmé que un buscador sin "Ej." (ej. el de Empleados) NO se rellena.
- **Commit(s):** (pendiente)

### 2026-07-20 — Quitado el checkbox "esto me impide trabajar" — ya lo deriva el SLA
- **Qué pasó:** el usuario recordó que ya se había acordado que la Categoría de
  Falla (SLA) del problema elegido debía ser la que determinara si algo
  impide trabajar o no — pero el checkbox manual "⚠️ Esto me impide trabajar"
  seguía en el formulario de Reportar Ticket, permitiendo que cualquiera lo
  marcara sin relación real con la prioridad de su problema.
- **Qué cambié:**
  - `backend/src/routes/tickets.js` — `applySlaCategory()` (ya compartida
    entre la clasificación automática al reportar y la reclasificación manual
    de un admin) ahora también fija `ticket.blocksWork` según la prioridad de
    la categoría: `alta`/`critica` → `true` (Hardware Local, Cuentas
    Críticas/ERP-SAE, Infraestructura Local, CCTV, Incidentes de Seguridad,
    Servidores y Core); `baja`/`media` → `false` (Cuentas y Accesos,
    Ofimática, Periféricos, Software, Red Local). `POST /tickets/mine` ya no
    acepta `blocksWork` de quien reporta.
  - `backend/src/models/Ticket.js` — comentario del campo actualizado para
    reflejar que ya no lo marca quien reporta.
  - `frontend/src/pages/ReportarTicket.jsx` — se quitó el checkbox del
    formulario y su envío en el `FormData`.
- **Por qué:** una autoevaluación libre ("¿esto te impide trabajar?") la
  marcaba cualquiera casi siempre que sí, sin relación con la urgencia real
  — la prioridad ya resuelta por el problema específico elegido es una señal
  mucho más consistente y ya existía de todos modos.
- **Verificación:** `node --check`; `npm run build`; probé la derivación
  contra las 11 categorías del SLA_CATALOG (mapeo correcto en todas);
  Playwright — confirmé que el checkbox ya no aparece en el formulario y que
  un ticket de Hardware ("No enciende o no prende") se envía sin
  `blocksWork` en el payload, quedando clasificado solo por `slaHint`.
- **Commit(s):** (pendiente)

### 2026-07-20 — FIX: ticket de Impresoras preguntaba por el equipo equivocado
- **Qué pasó:** el usuario notó que, al reportar un ticket de Impresoras, el
  formulario podía preguntar "¿Sobre cuál de tus equipos es esto?" — pero esa
  lista solo muestra el equipo PERSONAL asignado al empleado (laptop, celular),
  nunca una impresora (las impresoras no se asignan a una persona, son equipo
  compartido). La pregunta no tenía ninguna respuesta válida para este caso.
- **Qué cambié:**
  - `frontend/src/pages/ReportarTicket.jsx` — para la categoría "Impresoras":
    ya NO se muestra la pregunta "¿Sobre cuál de tus equipos es esto?"; en su
    lugar aparece un campo obligatorio "¿Cuál impresora es? *" (ej. "HP de
    Recepción, planta baja"), reusando el mismo campo `otherTypeDetail` que ya
    existía para la categoría "Otro" — no fue necesario un campo nuevo en el
    modelo, y ya se muestra sin más en la lista de tickets del admin
    (`Tickets.jsx` ya lo mostraba genéricamente, sin importar el tipo).
  - `backend/src/routes/tickets.js` — `POST /tickets/mine` ahora también
    exige `otherTypeDetail` cuando `ticketType === 'impresora'` (antes solo
    se exigía para `'otro'`).
- **Por qué:** para que Sistemas sepa DE VERDAD cuál impresora reportaron,
  en vez de una pregunta que nunca podía responderse bien.
- **Verificación:** `node --check`; `npm run build`; Playwright — simulé un
  empleado con 2 equipos personales asignados (para forzar que antes SÍ
  saliera la pregunta vieja) y confirmé que en Impresoras ya no aparece, que
  el campo nuevo es obligatorio (bloquea el envío vacío), y que el ticket se
  manda con el detalle de la impresora en `otherTypeDetail`.
- **Commit(s):** (pendiente)

### 2026-07-20 — Login de Mesa de Ayuda: autocompletar el dominio del correo
- **Qué pasó:** el usuario preguntó si se podía loguear por nombre en vez de
  correo — se le explicó que el riesgo es que dos empleados compartan nombre
  (ya nos pasó esta sesión con "Felipe Gómez"). También se descartó el no. de
  empleado como atajo porque, en palabras del usuario, "estas personas no se
  saben su número de empleado". La idea que sí adoptó: no pedir el correo
  completo, solo la parte de antes del "@" — mucho menos que teclear en un
  teclado de celular, sin perder nada de la unicidad del correo real.
- **Qué cambié:** `frontend/src/components/EmployeeLoginWidget.jsx` — nueva
  `resolveUsername()`: si lo que se escribió ya trae "@" (correo completo) o
  son puros dígitos (no. de empleado), se manda tal cual; cualquier otro caso
  se asume la parte local de un correo y se le agrega `@selectshop.com.mx`
  antes de mandarlo a `/employee-auth/lookup`. Sin cambios en el backend — ya
  aceptaba correo completo o no. de empleado indistintamente. Placeholder y
  un hint nuevo bajo el campo aclaran que no hace falta escribir el dominio.
- **Verificación:** `npm run build`; Playwright — confirmé que "felipe.gomez"
  se manda como "felipe.gomez@selectshop.com.mx", que "60378" (no. de
  empleado) se manda tal cual sin tocar, y que un correo completo tampoco se
  duplica.
- **Commit(s):** (pendiente)

### 2026-07-20 — Mesa de Ayuda como PWA (instalable en el celular, gratis)
- **Qué pasó:** después de arreglar la versión de teléfono (ver entrada de abajo),
  el usuario preguntó si se podía tener una app de Android/iOS reutilizando todo
  el código ya existente. Se le explicaron 2 caminos: PWA (gratis, instalable
  directo desde el navegador) o Capacitor (app real de tienda, con costo de
  cuentas de desarrollador Apple/Google). Eligió la ruta gratuita: PWA.
- **Qué cambié:**
  - `frontend/vite.config.js` — se agregó el plugin `vite-plugin-pwa`
    (`registerType: 'autoUpdate'`), con manifest apuntando a `start_url:
    '/mesa-de-ayuda'` (el portal de empleado, no el login de Sistemas) y
    `navigateFallbackDenylist` para que el service worker NUNCA cachee
    `/api/**` — son datos en vivo (tickets, activos), no algo que deba
    "verse offline" con información vieja.
  - `frontend/public/icons/` (nuevo) — 5 íconos PNG generados con Python/Pillow
    a partir del mismo logotipo (flecha blanca sobre naranja `#E8431A`) que ya
    usa el sidebar del portal (`PortalLayout.jsx`): `icon-192`, `icon-512`,
    `icon-maskable-512` (para el masking de Android), `apple-touch-icon` y
    `favicon-32`.
  - `frontend/index.html` — meta tags específicas de iOS (Apple no sigue el
    estándar de `manifest.json`): `apple-mobile-web-app-capable`,
    `apple-touch-icon`, `theme-color`, etc.
  - `README.md` — documentada la nueva pieza del stack y cómo instalar la app
    desde Android/iPhone.
- **Por qué:** dar de alta un ticket desde el celular (ej. "no prende mi compu")
  sin necesitar cuentas de desarrollador ni pasar por revisión de App
  Store/Play Store — el empleado instala directo desde el link que ya usan.
- **Verificación:** `npm run build` (genera `manifest.webmanifest`, `sw.js`,
  `registerSW.js` además del bundle normal); Playwright — confirmé que el
  manifest se sirve y es válido, que el service worker se registra y queda
  `active`, y que los 5 íconos responden 200.
- **Commit(s):** (pendiente)

### 2026-07-20 — Mesa de Ayuda: versión de teléfono (no una app, sino que la web se adapte)
- **Qué pasó:** el usuario quiere que un empleado pueda reportar un ticket desde su
  teléfono empresarial cuando, por ejemplo, su computadora no prende — no una app
  nueva, sino que la Mesa de Ayuda ya funcione bien en el navegador del celular.
- **Qué encontré:** al probar con Playwright en un viewport de teléfono (390px), el
  portal del empleado (`PortalLayout.jsx`, usado por Mesa de Ayuda, Reportar
  Ticket, Mis Tickets y Mis Solicitudes) se desbordaba horizontalmente y era
  inusable — el sidebar se veía correcto a simple vista, pero el contenido
  principal quedaba empujado fuera de la pantalla.
- **La causa real:** `PortalLayout.module.css` ya tenía una regla
  `@media (max-width: 900px)` que convertía el sidebar en una barra horizontal
  arriba (`position: static; width: 100%`), pero nunca cambiaba `.wrapper` de
  `display: flex` (fila) a columna — con el sidebar ahora ocupando el 100% de una
  fila, `.main` se renderizaba DESPUÉS de él (a la derecha, fuera de la pantalla)
  en vez de abajo. Agregar `.wrapper { flex-direction: column; }` dentro de ese
  mismo media query arregló el layout completo de un jalón (afecta a las 4
  páginas que usan `PortalLayout`, no solo Mesa de Ayuda).
- **Qué más ajusté:**
  - `MisTickets.module.css`/`MisSolicitudes.module.css`: la tabla de 4 columnas
    (Folio/Ticket/Estatus/Fecha) ya no cabía en una pantalla angosta y la columna
    "Fecha" quedaba invisible — agregué un `@media (max-width: 640px)` que
    convierte cada fila en una tarjeta apilada (mismo contenido, sin tabla).
- **Lo que ya estaba bien** (verificado, sin cambios): pantalla de login/bienvenida,
  el wizard completo de "Reportar un problema" (los 3 pasos), el modal de
  conversación de un ticket, y los formularios públicos Solicitar Cuenta/Recurso —
  todos ya eran responsive de antes.
- **Verificación:** `npm run build`; Playwright con viewport de 390×844 (iPhone) en
  las 5 páginas del portal + el modal de ticket — confirmé que ya no hay
  desbordamiento horizontal (`document.documentElement.scrollWidth === 390`) en
  ninguna, con capturas de pantalla revisadas una por una.
- **Commit(s):** (pendiente)

### 2026-07-17 — Revertido: SAE/COI/NOI en el catálogo de ERP (aún no se implementa)
- **Qué pasó:** el usuario aclaró, después de la entrada de abajo, que
  SAE/COI/NOI todavía no se van a implementar por ahora.
- **Qué cambié:** `frontend/src/config/ticketCategories.js` — quité de la
  categoría ERP las palabras clave `sae`/`coi`/`noi`, el problema "No puedo
  entrar al ERP (SAE, COI o NOI)" (regresó a su versión original "No puedo
  entrar al ERP") y el problema nuevo "Error al timbrar o generar un CFDI".
  El resto de lo agregado en la entrada de abajo (Software, Impresoras,
  Cuenta/Acceso) NO se tocó — solo aplicaba a lo relacionado con SAE/COI/NOI.
- **Verificación:** `npm run build` OK.
- **Commit(s):** (pendiente)

### 2026-07-17 — Mesa de Ayuda: catálogo de problemas ampliado con el histórico del sistema anterior
- **Qué pasó:** el usuario pidió sacar cada problema real que existía en el sistema
  de tickets anterior (`BD_Helpdesk.csv`, exportado del sistema viejo, 1,172
  tickets históricos) y agregarlos al catálogo actual donde correspondiera —
  para que el buscador de Mesa de Ayuda y el wizard "Reportar Ticket" ya cubran
  problemas reales que la gente reportaba, no solo los que se me ocurrieron al
  diseñar el catálogo original.
- **Qué hice:** parseé el CSV (Python, 1,172 filas, columna `Descripción_soporte`)
  y comparé cada descripción contra las palabras clave que ya existían en
  `ticketCategories.js` para medir qué tanto quedaba sin cubrir (61% cubierto
  antes). Con el 39% restante, agrupé por tema recurrente (frecuencia de
  palabras + lectura de muestras reales) para encontrar problemas genuinos que
  no tenían dónde caer.
- **Qué cambié** (`frontend/src/config/ticketCategories.js` — única fuente para
  ambos, wizard y buscador):
  - **ERP**: agregué `sae`/`coi`/`noi` como palabras clave — nadie le dice "ERP"
    al sistema, le dicen por su nombre real (SAE = ventas/facturación, COI =
    contabilidad, NOI = nómina/RH). Nuevo problema "Error al timbrar o generar
    un CFDI" (muy repetido en Contabilidad/Auditoría).
  - **Software**: 3 problemas nuevos — "Office pide activarse / licencia
    vencida" (el tema más repetido de todo el histórico y no tenía dónde
    caer), "No tengo acceso a una carpeta compartida", "Necesito configurar mi
    firma de correo". Y una nota (no falla, redirige a Solicitar Recurso, mismo
    patrón que "No encuentro Word/Excel..."): "Necesito instalar un programa
    nuevo (Zoom, AnyDesk, etc.)".
  - **Impresoras**: nuevo problema "El escáner no funciona o no puedo
    escanear" (mismo equipo multifunción, volumen propio en el histórico).
  - **Cuenta/Acceso**: "Mi cuenta está bloqueada" ahora también cubre "no
    puedo iniciar sesión"/"inicio de sesión".
  - Amplié los keywords de "Outlook no me manda o no me llegan correos" con
    variantes reales encontradas ("no me permite abrir mi correo", "recepción
    de correos", etc.).
- **Qué dejé fuera a propósito:** una parte grande del histórico eran
  solicitudes de alta de cuenta/correo nuevo ("crear correo para fulano", "dar
  de alta en el ERP a...") — eso ya tiene su propio flujo (Solicitar Cuenta),
  no es un ticket de "algo que ya tengo y no funciona", así que no lo agregué
  al catálogo de tickets.
- **Impacto medido:** de 61% a 74% de los 1,172 tickets históricos ahora
  coinciden con un problema específico del catálogo (antes muchos caían al
  "Otro problema de..." genérico de su categoría). El resto es cola larga de
  casos únicos, errores de dedo o solicitudes fuera de alcance de Tickets.
- **Verificación:** `npm run build`; Playwright contra Mesa de Ayuda con datos
  mockeados — confirmé que buscar "SAE", "escáner", "firma de correo", "no
  tengo licencia office", "CFDI" y "carpeta compartida" ya llegan al problema
  correcto (antes ninguno daba resultado).
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX: la coincidencia de "Felipe" era demasiado amplia (podía tomar a otro Felipe)
- **Qué pasó:** el usuario detectó que el criterio anterior ("felipe" como substring
  del nombre capturado) era demasiado permisivo: si hubiera otro empleado que
  también se llame Felipe, sus envíos también encenderían el botón y podrían
  terminar con la firma de Luis Felipe Gomez Gonzalez en un PDF que no es suyo.
  Pidió explícitamente: "solo debe ser Luis Felipe Gomez Gonzalez o
  sistemas.4@selectshop.com.mx, no ningún otro Felipe".
- **Qué cambió:**
  - `backend/src/routes/shipments.js` — `getFelipeIfRecipient` ya no acepta con
    que "felipe" aparezca en el texto; ahora exige que coincidan al menos 2
    palabras de su nombre real registrado (`namesLikelyMatch`), tomado de su
    ficha de Empleado (ligada a `sistemas.4@selectshop.com.mx`). Un simple
    "Felipe" suelto ya NO califica; "Felipe Gómez", "Luis Felipe Gomez" o su
    nombre completo sí.
  - `frontend/src/pages/Shipments.jsx` — el botón "🖊 Firma" usa el mismo
    criterio (exige "felipe" + "gomez" juntos, no "felipe" solo).
- **Por qué:** evitar que la firma de Felipe se guarde o se imprima en el PDF de
  recepción de una persona distinta que comparta el mismo nombre de pila.
- **Verificación:** `node --check`; probé `namesLikelyMatch` directo — "Felipe"
  solo y "Felipe Torres" ya NO coinciden con "Luis Felipe Gomez Gonzalez",
  pero "Felipe Gómez"/"LUIS FELIPE GOMEZ GONZALEZ" sí. Playwright confirmó que
  el botón solo aparece en envíos de él, no en uno de "Felipe Torres" ni en uno
  con solo "Felipe" sin apellido.
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos: subir la firma de Felipe directo desde el panel, sin depender de coincidencia de nombre
- **Qué pasó:** después del fix anterior, el usuario pidió algo mucho más simple y
  directo: poder habilitar la firma de Felipe UNA VEZ desde la página de Envíos
  (no desde el link público), en cualquiera de los envíos ya existentes, y que de
  ahí en adelante todos sus PDF de recepción salgan ya firmados — sin depender de
  que ningún texto libre coincida con nada.
- **Qué cambió:**
  - `backend/src/routes/shipments.js`: nueva ruta autenticada
    `POST /shipments/:id/signature` — sube la imagen directo a la ficha de
    Empleado de Felipe (por su correo corporativo), sin comparar nombres; el
    envío elegido en la tabla es solo el punto de entrada, no condiciona nada.
    Además, `getFelipeIfRecipient` (la que decide si un PDF de recepción debe
    llevar su firma) ahora compara por *substring* ("¿aparece 'felipe' en el
    texto?") en vez de exigir que el nombre completo coincida exactamente contra
    su ficha de Empleado — mucho más tolerante a como se haya escrito su nombre.
  - `frontend/src/pages/Shipments.jsx`: nuevo botón "🖊 Firma" en la tabla,
    visible solo en envíos cuyo destinatario/quien confirmó contiene "felipe" —
    abre el selector de archivo y sube directo, sin pasar por el link público.
- **Por qué:** la lógica anterior dependía de que el nombre tecleado en el envío
  coincidiera con el registrado en Empleados — fuente de bugs repetidos. Esta
  versión no depende de eso: es una acción manual, directa, desde el panel que
  ya usa el equipo de Sistemas.
- **Verificación:** `node --check`; `npm run build`; Playwright con rutas
  mockeadas — confirmé que el botón "🖊 Firma" aparece solo en los envíos de
  Felipe (no en uno de "Otra Persona"), y que subir un archivo llama al nuevo
  endpoint y muestra la confirmación.
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX real: la firma de Felipe se comparaba contra el nombre equivocado
- **Qué pasó:** el fix del acento (ver entrada de abajo) no resolvió el problema. El
  usuario mandó captura de un envío real ya confirmado, donde claramente decía
  "confirmado como recibido por LUIS FELIPE GOMEZ GONZALEZ" — un nombre que ni de
  cerca se parece a lo que normalmente se teclea como "Destinatario" al crear el
  envío (ej. solo "Felipe"). Ahí encontré el bug de fondo: `getFelipeIfRecipient` en
  los 4 lugares donde se usa comparaba contra `shipment.recipientName`, que es texto
  libre capturado al CREAR el envío (antes de saber quién lo recibiría) — no contra
  `shipment.receivedByName`, el nombre que la propia persona confirma/teclea al
  recibir, que es mucho más probable que coincida con su nombre real registrado en
  Empleados. No era un problema de acentos: eran dos campos distintos.
- **Qué cambió:** `backend/src/routes/shipments.js` — los 4 call sites de
  `getFelipeIfRecipient` (`GET /public/:token`, `POST /public/:token/confirm`,
  `POST /public/:token/signature`, `GET /:id/reception-pdf`) ahora priorizan
  `shipment.receivedByName || shipment.recipientName` (o la variable local
  `receivedByName` ya disponible en el handler de confirmación), en vez de comparar
  solo contra `recipientName`.
- **Por qué:** para que el sistema reconozca a Felipe usando el nombre que él mismo
  confirma al recibir el envío, que es el dato más confiable disponible, en vez del
  nombre casual/corto que se haya escrito al despachar el envío.
- **Verificación:** `node --check src/routes/shipments.js` OK.
- **Nota:** si tras este fix el link sigue sin mostrar la opción de subir firma, el
  único dato pendiente de confirmar en la base de datos real es que la ficha de
  Empleado de Felipe tenga `sistemas.4@selectshop.com.mx` en "Correos corporativos" —
  eso no lo puedo verificar yo desde aquí.
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX: la firma de Felipe no se reconocía por un acento
- **Qué pasó:** el usuario reportó que en un link de envío ya confirmado, no le
  aparecía la opción de subir la firma. Encontré el bug real: `getFelipeIfRecipient`
  comparaba `shipment.recipientName` contra `Employee.name` con `.toLowerCase()` pero
  SIN quitar acentos — "Felipe Gómez" (como puede estar en Empleados) y "Felipe
  Gomez" (como se haya escrito al crear el envío) nunca coincidían, así que el
  sistema nunca reconocía que ese envío era de Felipe.
- **Qué cambió:** `backend/src/routes/shipments.js` — nueva `normalizeName()`
  (mismo criterio que ya se usa en el buscador de Mesa de Ayuda: `.normalize('NFD')`
  + quitar diacríticos) usada en `getFelipeIfRecipient` en vez de la comparación
  simple anterior.
- **Si después de este fix sigue sin aparecer**, hay 2 datos en la base de datos
  reales que no puedo verificar yo desde aquí — pídele a quien tenga acceso que
  confirme: (1) que la ficha de Empleado de Felipe tenga
  `sistemas.4@selectshop.com.mx` en "Correos corporativos", y (2) que el
  "Destinatario" capturado en ese envío sea su nombre tal cual está en Empleados
  (ej. si en Empleados dice "Felipe Gómez Ramírez" pero el envío dice solo "Felipe",
  no va a coincidir).
- **Verificación:** `node --check`; probé `normalizeName()` directamente confirmando
  que "Felipe Gómez" y "Felipe Gomez" ahora sí coinciden.
- **Commit(s):** (pendiente)

### 2026-07-17 — Reportar ticket: nueva categoría "Impresoras"
- **Qué pasó:** el usuario pidió una categoría propia de "Impresoras" en Mesa de
  Ayuda — antes "La impresora no imprime" vivía escondida como un problema más
  dentro de "Red / Conectividad", sin su propio botón.
- **Qué cambió:** `frontend/src/config/ticketCategories.js` — nueva categoría
  `impresora` (🖨️) con 6 problemas curados (no imprime, se atora el papel, falta
  tóner/tinta, mala calidad de impresión, no conecta, otro), todos clasificados como
  SLA "Periféricos". Se quitó "La impresora no imprime" de Red/Conectividad (ya no
  vive ahí, para no duplicarla). `backend/src/models/Ticket.js`,
  `frontend/src/pages/Tickets.jsx`, `MisTickets.jsx` — nueva entrada `impresora` en
  los 3 catálogos de tipos/etiquetas. El buscador de Mesa de Ayuda no necesitó ningún
  cambio — se genera del mismo catálogo, así que ya apunta solo a la tarjeta nueva
  con las palabras clave que se le dieron.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando: la
  tarjeta "Impresoras" aparece y funciona de punta a punta (`ticketType=impresora`,
  `slaHint=Periféricos` en el envío real), buscar "no imprime la impresora" apunta a
  Impresoras, y buscar "wifi" sigue apuntando a Red/Conectividad (sin regresión).
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos: habilitar la subida de firma en un envío ya confirmado
- **Qué pasó:** la firma reutilizable de Felipe (ver entrada anterior) solo se podía
  subir DURANTE la confirmación de recepción de un envío en curso — pero el usuario
  necesitaba habilitarla en un envío que ya se había hecho y confirmado antes, sin
  esperar a que llegara uno nuevo. El link público de un envío ya "recibido" solo
  mostraba la pantalla de "ya confirmado", sin ninguna forma de subir la firma ahí.
- **Qué cambió:**
  - `backend/src/routes/shipments.js` — nueva ruta pública `POST
    /public/:token/signature`, independiente de `/confirm`: solo guarda la imagen en
    la ficha de Felipe, sin importar el estatus del envío ni tocar ningún otro dato
    (a diferencia de `/confirm`, que sí exige que el envío siga sin confirmarse).
  - `frontend/src/pages/ConfirmarEnvio.jsx` — la pantalla de "recepción confirmada"
    ahora también incluye el campo para subir la firma cuando
    `needsSignatureUpload` sigue siendo verdadero (no depende del estatus, solo de
    si Felipe ya tiene una guardada) — usa esta nueva ruta, no `/confirm`.
- **Cómo usarlo:** el mismo link que ya se le compartió a Felipe para ese envío (el
  que ya está "recibido") ahora sirve para esto — no hace falta generar uno nuevo.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando que la
  sección de subir firma aparece en un envío ya "recibido" (cuando hace falta),
  que el envío del formulario pega a `/signature` (no a `/confirm`) como
  `multipart/form-data`, y que desaparece cuando ya no hace falta.
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos: firma escaneada de Felipe, reutilizable en el PDF de Recepción
- **Qué pasó:** el usuario pidió que Felipe (ÚNICAMENTE para envíos donde él es el
  destinatario) pueda subir una foto de su hoja de recepción firmada, para que de
  ahí en adelante todos sus PDFs de "Formato de Recepción" salgan ya con su firma
  real en vez de solo el nombre impreso — sin volver a pedírsela en cada envío. También
  pidió que ese PDF de recepción solo se pueda generar una vez que de verdad se
  confirmó la recepción (hoy se podía descargar en cualquier momento, incluso antes
  de confirmarse, lo cual no tenía sentido — no hay nombre/firma real que mostrar
  todavía).
- **Cómo se resolvió (con el usuario):** Felipe se identifica por su correo
  `sistemas.4@selectshop.com.mx` (resuelto contra su ficha de Empleado, mismo patrón
  que ya existía para Gerente de Sistemas) — como `Shipment.recipientName` es texto
  libre (no hay referencia a Empleado), se compara por nombre. Subir la foto es
  opcional (con recordatorio en cada envío hasta que la suba una vez), no bloquea la
  confirmación de recepción si tiene problemas para subirla en el momento.
- **Qué cambió:**
  - `backend/src/models/Employee.js` — nuevos campos `signatureImageData` (Buffer),
    `signatureImageMimeType`, `signatureUploadedAt` — firma reutilizable, no atada a
    un envío en particular.
  - `backend/src/routes/shipments.js` — `GET /public/:token` ahora regresa
    `needsSignatureUpload` (true solo si el destinatario es Felipe y todavía no tiene
    firma guardada). `POST /public/:token/confirm` acepta un archivo opcional
    `signatureImage` (multer, solo JPG/PNG — son los únicos formatos que pdfkit
    puede dibujar directo sin conversión) y lo guarda en la ficha de Felipe si
    aplica. `GET /:id/reception-pdf` ahora exige `status === 'recibido'` (400 si
    no), y le pasa la firma guardada de Felipe al PDF cuando corresponde.
  - `backend/src/utils/shipmentPdf.js` — `signatureRow()` ahora puede dibujar una
    imagen (`doc.image()`) arriba de la línea de firma en vez del nombre impreso,
    cuando se le pasa una; si la imagen falla al dibujarse (formato corrupto), no
    truena el PDF completo, solo se omite. `buildShipmentReceptionPdf(shipment,
    recipientSignatureImage)` gana ese segundo parámetro opcional.
  - `frontend/src/pages/ConfirmarEnvio.jsx` — nuevo campo de archivo (opcional) en el
    paso de "Confirmar recepción", solo visible cuando el backend dice que hace
    falta; el envío del formulario pasa a `multipart/form-data` para poder incluirlo.
  - `frontend/src/pages/Shipments.jsx` — el botón "⬇ Recepción" ahora se deshabilita
    hasta que el envío esté en estatus "recibido", en vez de fallar con una alerta al
    intentarlo antes.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando que el
  campo de subida aparece/desaparece según `needsSignatureUpload` y que el envío del
  formulario manda el archivo como `multipart/form-data`. Generé ambos PDFs de
  recepción (con y sin imagen de firma) directamente con `buildShipmentReceptionPdf`
  y los revisé visualmente (vía miniatura de Quick Look) — la imagen se incrusta
  correctamente en la caja de firma cuando existe, y el nombre impreso sigue
  funcionando igual que antes cuando no hay firma guardada.
- **Commit(s):** (pendiente)

### 2026-07-17 — Empleados: columna AnyDesk en la tabla
- **Qué pasó:** el usuario pidió ver en la tabla de Empleados el AnyDesk ID de la(s)
  computadora(s) asignada(s), para tenerlo a la mano sin entrar a Activos.
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — `load()` arma un mapa
  `anydeskByEmployee` (laptop/escritorio/all-in-one asignado → su
  `specs.anydesk`) a partir de la misma llamada a `GET /assignments` que ya se
  hacía (mismo patrón que el mapa de teléfono agregado antes). Nueva columna
  "AnyDesk" en la tabla, entre "Departamento" y "Acciones" — si tiene más de un
  equipo con AnyDesk capturado, se muestran todos separados por coma.
- **Verificación:** `npm run build`; Playwright con 3 casos: un equipo con AnyDesk,
  dos equipos con AnyDesk (se unen con coma), y alguien sin computadora asignada
  (guión). Revisé la captura — se ve limpio, formato código para el ID.
- **Commit(s):** (pendiente)

### 2026-07-17 — Empleados: precargar "Teléfono" con el número del celular asignado
- **Qué pasó:** el usuario pidió que, al editar un empleado que tiene un celular
  como activo asignado, el campo "Teléfono" se llene solo con el número de línea de
  ese celular (`Asset.specs.lineNumber`, el mismo campo que ya se captura al dar de
  alta un celular en Activos).
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — `load()` ahora también arma
  un mapa `phoneByEmployee` (celular asignado → su `specs.lineNumber`) a partir de
  la misma llamada a `GET /assignments` que ya se hacía. `openEdit(emp)` usa ese
  mapa como respaldo SOLO si `emp.phone` está vacío — si ya hay un teléfono
  capturado a mano, no se toca.
- **Verificación:** `npm run build`; Playwright con 3 casos: empleado sin teléfono
  con celular asignado (se precarga), empleado con teléfono ya capturado y celular
  asignado (no se sobreescribe), empleado sin teléfono ni celular (queda vacío,
  igual que antes).
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX: "Solicitar Cuenta/Recurso/Ingreso" eran caminos sin regreso
- **Qué pasó:** el usuario reportó que al entrar a las tarjetas de Mesa de Ayuda como
  "Acceso a un sistema o correo", ya no podía regresar a Solicitudes. Causa: esas 3
  páginas (`SolicitarCuenta.jsx`, `SolicitarRecurso.jsx`, `SolicitarIngreso.jsx`) son
  públicas a propósito (no requieren sesión, para que RH pueda compartir el link a
  quien lo necesite) y por eso NUNCA usaron `PortalLayout` — es decir, nunca tuvieron
  el sidebar con el botón "Solicitudes". Quien llegaba ahí desde Mesa de Ayuda se
  quedaba sin ninguna forma de regresar dentro de la app.
- **Qué cambió:** `frontend/src/pages/SolicitarCuenta.jsx`, `SolicitarRecurso.jsx`,
  `SolicitarIngreso.jsx` — nuevo link "← Volver a Mesa de Ayuda" arriba del
  encabezado (en el formulario y en la pantalla de éxito tras enviar). Nueva clase
  `.backLink` en `SolicitarCuenta.module.css` (compartida por las 3).
- **Verificación:** `npm run build`; Playwright entrando a las 3 tarjetas desde Mesa
  de Ayuda y confirmando que el link "Volver a Mesa de Ayuda" aparece y de verdad
  regresa a `/mesa-de-ayuda`.
- **Commit(s):** (pendiente)

### 2026-07-17 — Correo de tickets: plantilla formal en vez del formato de Telegram
- **Qué pasó:** el usuario pidió mejorar el contenido del correo — el formato de
  texto plano (copiado del mensaje de Telegram) no era apropiado para un correo
  formal de empresa.
- **Qué cambió:**
  - `backend/src/utils/emailTemplates.js` (nuevo) — plantilla HTML profesional,
    hecha a prueba de Outlook de escritorio a propósito (layout de tablas +
    estilos inline únicamente, nada de flexbox/grid ni imágenes externas, ya que
    el motor de Outlook no las soporta bien y es justo el cliente que usa el
    equipo, según la captura que mostró el usuario). Incluye: encabezado con marca
    de SelectShop (`#E8431A`), aviso destacado en rojo si el ticket "impide
    trabajar", tabla de datos precisos (folio, fecha de reporte, reportado por,
    tipo de soporte, prioridad con color, Categoría de Falla SLA + fecha límite de
    resolución si ya se clasificó, equipo, aplicación), asunto y descripción en
    secciones separadas, botón "Ver ticket en el panel" (enlaza a
    `${FRONTEND_URL}/tickets`), y pie de página aclarando que es un aviso
    automático que no se debe responder.
  - `backend/src/routes/tickets.js` — `POST /mine` ahora arma el correo con
    `buildTicketNotificationEmail(...)` en vez del HTML ad-hoc anterior.
- **Verificación:** `node --check`; rendericé la plantilla con datos de ejemplo (un
  caso completo con SLA/prioridad alta/impide trabajar, y un caso mínimo sin nada
  de eso) y la revisé visualmente vía captura — se ve limpia y formal en ambos
  casos, sin secciones vacías cuando faltan datos opcionales.
- **Commit(s):** (pendiente)

### 2026-07-17 — Corrección: Seguridad va solo al Gerente de Sistemas, no a todos
- **Qué pasó:** al configurar las credenciales de Azure junto con el usuario, aclaró
  que los tickets de Seguridad deben llegarle SOLO a Bruno (Gerente de Sistemas) por
  el momento — mi implementación anterior se los mandaba a él ADEMÁS de todo el resto
  de Sistemas (interpretación aditiva de "que le lleguen a él los de seguridad").
- **Qué cambió:** `backend/src/routes/tickets.js` — `getTicketEmailRecipients` ahora
  regresa temprano `[GERENTE_SISTEMAS_EMAIL]` en exclusiva para `ticketType ===
  'seguridad'`, sin pasar por el enrutamiento de área ni juntarse con el resto de
  Sistemas. La regla de "Solicitud de Pagos" no cambió (sigue sumándose al resto de
  Sistemas, no se pidió cambiarla).
- **Verificación:** `node --check`.
- **Commit(s):** (pendiente)

### 2026-07-17 — Aviso de tickets por correo (Microsoft Graph), enrutado por área
- **Qué pasó:** el usuario mostró cómo el sistema de tickets ANTERIOR (Zoho o similar)
  mandaba cada ticket nuevo por correo a una lista fija de ~6 personas, sin importar
  de qué se tratara — y pidió que, al conectar la notificación por correo de este
  sistema (vía Microsoft Graph/Azure, además de Telegram que ya existe), NO se repita
  ese problema: que se reparta por área en vez de mandarse a todos. Aclaró 2 reglas
  fijas: Gerente de Sistemas debe recibir siempre los tickets de Seguridad y los de
  su aplicación "Solicitud de Pagos".
- **Decisiones tomadas con el usuario:** (1) las áreas se calculan reusando permisos
  que ya existen (lider.erp/analista.erp = área ERP, mismo criterio que la partición
  de tickets ERP; el resto de admins de Sistemas = área sistema-IT) — sin campos
  nuevos que alguien tenga que llenar a mano; (2) el correo se agrega COMO CANAL
  ADICIONAL, Telegram se queda igual; (3) la aplicación "Solicitud de Pagos" no
  existía en el catálogo — queda pendiente que el usuario la dé de alta en
  Aplicaciones Internas con ese nombre exacto para que el enrutamiento la reconozca.
- **Qué cambió:**
  - `backend/src/utils/graphMail.js` (nuevo) — envío de correo vía Microsoft Graph
    (flujo de credenciales de cliente, sin login de usuario), mismo patrón
    best-effort que `utils/telegram.js`: nunca rompe el flujo si Azure falla o si
    faltan las variables de entorno (queda inerte hasta configurarlas).
  - `backend/src/routes/tickets.js` — `getTicketEmailRecipients(ticket, appName)`
    calcula los destinatarios: tickets `erp` → equipo ERP; el resto → todo admin de
    Sistemas ("área sistema-IT"); tickets `seguridad` y los de la app "Solicitud de
    Pagos" agregan SIEMPRE al Gerente de Sistemas. Se dispara junto con la
    notificación de Telegram existente al crear un ticket (`POST /tickets/mine`),
    sin bloquear la respuesta al empleado si falla.
  - `README.md` — documentadas las variables de entorno nuevas (`AZURE_TENANT_ID`,
    `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `NOTIFICATIONS_FROM_EMAIL`) y, de paso,
    las de Telegram que ya existían pero nunca se habían documentado ahí.
- **Pendiente de acción manual (fuera de este repo):** el usuario todavía necesita
  crear un App Registration en Azure AD (permiso de aplicación `Mail.Send` con
  consentimiento de admin) y cargar esas 4 variables en Render — hasta entonces el
  código queda inerte (no manda nada, no rompe nada), igual que Telegram antes de
  tener su bot configurado. También falta dar de alta "Solicitud de Pagos" en
  Aplicaciones Internas.
- **Verificación:** `node --check` en los 2 archivos nuevos/modificados. No se pudo
  probar el envío real (requiere las credenciales de Azure, que todavía no existen)
  ni la consulta de usuarios por rol contra una base de datos real (sin acceso a
  Mongo desde este entorno) — la lógica de enrutamiento se verificó por revisión de
  código, replicando exactamente el mismo criterio ya probado de `isErpOnlyUser`.
- **Commit(s):** (pendiente)

### 2026-07-17 — El checkbox de RH solo se ofrece a quien de verdad es de RH
- **Qué pasó:** el usuario vio que el checkbox nuevo de "Alta de un nuevo ingreso"
  aparecía en el formulario de edición de TODOS los empleados, y no le gustó — pidió
  que solo se ofrezca a quien tenga "Recursos Humanos" en su Área.
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — nuevo helper `isRHArea(area)`
  (compara sin distinguir mayúsculas/espacios, ya que "Área" es texto libre, no un
  catálogo fijo). El checkbox ahora solo se muestra en el modal cuando
  `form.area` es "Recursos Humanos" — para cualquier otro empleado, ese campo del
  formulario ni aparece.
- **Para activarlo en Nicolás:** su campo "Área" tiene que decir exactamente
  "Recursos Humanos" (sin importar mayúsculas) para que el checkbox aparezca al
  editarlo — si su área dice otra cosa (ej. "RH" a secas), hay que corregirla primero.
- **Verificación:** `npm run build`; Playwright confirmando que el checkbox está
  oculto para un empleado con área "Ventas" y visible para uno con área
  "Recursos Humanos".
- **Commit(s):** (pendiente)

### 2026-07-17 — "Alta de un nuevo ingreso" restringido a RH (Nicolás)
- **Qué pasó:** el usuario pidió que el login de Mesa de Ayuda jale los datos del
  empleado desde su correo corporativo — al investigar, esto YA funcionaba (el
  campo de login acepta correo corporativo o no. de empleado indistintamente,
  contra `Employee.corporateEmails`, y desde ahí ya se jalan los activos
  asignados). Lo que sí faltaba era su segundo pedido: que solo Nicolás (RH,
  `reclutamiento.1@selectshop.com.mx`) pueda ver/enviar "Alta de un nuevo
  ingreso" — hoy esa página es 100% pública (sin sesión) y la tarjeta aparece
  en el menú de Mesa de Ayuda para cualquier empleado logueado, así que
  cualquiera podía mandar un ingreso sin querer.
- **Qué cambió:**
  - `backend/src/models/Employee.js` — nuevo campo `canManageOnboarding`
    (booleano, default `false`).
  - `backend/src/routes/employeeAuth.js` — el login/activación del portal ahora
    incluye este flag en la respuesta y en el JWT.
  - `frontend/src/components/EmployeeLoginWidget.jsx` — lo guarda en
    `localStorage.employeeUser`.
  - `frontend/src/pages/MesaDeAyuda.jsx` — la tarjeta "Alta de un nuevo ingreso"
    y la sugerencia del buscador para ese mismo tema solo aparecen si
    `canManageOnboarding` es verdadero. El link público (`/solicitar-ingreso`)
    sigue funcionando sin login — a propósito, según lo decidido: por si
    Nicolás lo comparte para que alguien más lo llene en su nombre.
  - `frontend/src/pages/Employees.jsx` — nuevo checkbox "Puede ver y enviar
    'Alta de un nuevo ingreso' en Mesa de Ayuda (RH)" en el modal de edición,
    mismo patrón que los permisos de Users.jsx.
- **Pendiente de acción manual:** no tengo acceso directo a la base de datos de
  producción desde aquí — después de que esto despliegue, hay que entrar a
  Empleados, buscar a Nicolás (reclutamiento.1@selectshop.com.mx) y marcar la
  casilla nueva para que el permiso quede activo de verdad.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando: (1)
  un empleado sin el permiso no ve la tarjeta ni la sugerencia del buscador; (2)
  alguien con el permiso sí las ve; (3) el login real (lookup→login) guarda el
  flag correctamente en `localStorage`; (4) el checkbox en Employees.jsx se
  guarda vía `PUT /employees/:id`.
- **Commit(s):** (pendiente)

### 2026-07-17 — FIX: nadie podía editar tickets/envíos asignados a sí mismo
- **Qué pasó:** el usuario reportó que ya no podía hacer nada en un ticket, ni
  siquiera asignándoselo a sí misma — los campos aparecían deshabilitados. Descarté
  primero que fuera algo de los cambios de esta noche (SLA, notas internas, ERP):
  reproduje su escenario exacto con Playwright contra el build en producción y el
  candado NO debía dispararse, así que el bug estaba en otro lado. Encontrado: el
  login (`POST /auth/login`) nunca mandaba el `id`/`_id` del usuario en la
  respuesta, y `Login.jsx` tampoco lo guardaba en `localStorage.user` — así que
  `currentUser.id` siempre fue `undefined` en el frontend. La regla "un ticket/envío
  asignado sigue siendo de quien lo atiende" (`ticket.assignedTo._id ===
  currentUser.id` en Tickets.jsx, `s.sentBy === currentUser.id` en Shipments.jsx)
  comparaba contra ese `undefined` — nunca coincidía con nadie, excepto el Gerente
  de Sistemas (que se valida por email, no por id). Esto llevaba roto desde que se
  construyó esa función (antes de esta noche), no es una regresión de hoy — solo
  ahora alguien lo notó al probar exactamente ese caso.
- **Qué cambió:** `backend/src/routes/auth.js` — `POST /login` ahora incluye `id:
  user._id` en la respuesta. `frontend/src/pages/Login.jsx` — lo guarda en
  `localStorage.user.id`.
- **Importante — acción para quien ya tenía sesión iniciada:** este fix aplica en el
  próximo login. Quien ya estaba con sesión abierta (como Lilly) sigue con el
  `localStorage.user` viejo (sin `id`) hasta que cierre sesión y vuelva a entrar, o
  hasta que el token expire solo (8h). **Cerrar sesión y volver a entrar arregla el
  problema de inmediato.**
- **Verificación:** `node --check`; `npm run build`; Playwright simulando el flujo
  real de login (no solo inyectando localStorage a mano, para no repetir el mismo
  punto ciego) y confirmando que, tras loguearse, un ticket asignado a uno mismo ya
  no aparece bloqueado.
- **Commit(s):** (pendiente)

### 2026-07-17 — Tickets: SLA automático desde el problema específico elegido
- **Qué pasó:** el usuario preguntó si el SLA ya existente (10 Categorías de Falla con
  nivel/prioridad/tiempos de respuesta y resolución, `Ticket.SLA_CATALOG`) debía
  aplicarse también a lo que se acaba de agregar (el wizard de problemas
  específicos), en vez de depender del checkbox "¿esto me impide trabajar?" —
  argumentando que todo mundo lo va a marcar aunque no sea cierto. Estuve de acuerdo:
  el propio código ya tenía un comentario reconociendo justo este problema
  ("blocksWork... no una escala de prioridad que nadie llena bien"), y hoy el SLA
  solo se asignaba a mano por un admin después de reportado, nunca automático.
  Mapeé los problemas específicos contra las 10 categorías del SLA oficial; 2 no
  tenían un cajón que les quedara bien (Seguridad, Aplicaciones) y se resolvieron
  con el usuario: Seguridad gana una categoría nueva en el catálogo
  ("Incidentes de Seguridad", prioridad crítica); Aplicaciones se queda sin SLA
  automático porque cada app interna puede tener un responsable distinto.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nueva fila `Incidentes de Seguridad` en
    `SLA_CATALOG` (nivel 3, prioridad crítica, respuesta 15 min, resolución 120 min
    — mismo nivel de urgencia que "Servidores y Core").
  - `backend/src/routes/tickets.js` — se extrajo `applySlaCategory(ticket,
    slaCategory)`, compartida entre `PUT /:id/sla-category` (clasificación manual,
    sin cambios de comportamiento) y la nueva lógica en `POST /mine`: si el
    problema específico elegido trae un `slaHint` reconocido, el ticket queda
    clasificado (nivel/prioridad/fechas límite) desde que se crea. Un valor
    desconocido o manipulado simplemente se ignora, sin tronar el envío.
  - `frontend/src/config/ticketCategories.js` — cada problema específico ganó un
    campo opcional `sla` con la Categoría de Falla que le corresponde (ej. "No
    enciende" → Hardware Local; "El teclado o el mouse no funciona" → Periféricos,
    NO Hardware Local — el SLA oficial ya los separaba; Outlook/OneDrive/Teams/
    Excel → Ofimática y Archivos, no "Software y Sistema Operativo" en general).
    Las categorías Seguridad y ERP quedaron mapeadas por completo (incluido su
    "Otro" respectivo) porque toda la categoría ES esencialmente un solo nivel de
    urgencia; Aplicaciones se dejó sin `sla` a propósito.
  - `frontend/src/pages/ReportarTicket.jsx` — captura el `sla` del problema elegido
    y lo manda como `slaHint` al crear el ticket.
  - `frontend/src/pages/Tickets.jsx` — se agregó "Incidentes de Seguridad" a la
    copia del catálogo que ya tenía (duplicada del backend solo para pintar el
    selector, como ya se documentaba ahí).
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando el
  `slaHint` correcto para 9 problemas específicos de distintas categorías,
  confirmando que Aplicaciones y Otro NO mandan `slaHint` (se quedan sin
  clasificar, como antes).
- **Commit(s):** (pendiente)

### 2026-07-17 — Selector de equipo en tickets: solo el tipo genérico, sin marca/modelo/serie
- **Qué pasó:** el usuario pidió que el selector "¿sobre cuál de tus equipos es
  esto?" (Reportar Ticket) no le muestre a quien reporta la marca/modelo/serie del
  equipo — solo el tipo genérico: "Celular" si es celular, "Laptop" o "Escritorio"
  si es de cómputo.
- **Qué cambió:** `frontend/src/pages/ReportarTicket.jsx` — `assetLabel()` ahora
  regresa solo `ASSET_TYPE_LABELS[a.type]` (ej. "Laptop", "Celular", "Escritorio"),
  sin concatenar `brand`/`model`/`serialNumber` como antes.
- **Nota:** si alguna vez alguien tiene 2 equipos del MISMO tipo asignados (ej. 2
  laptops), el selector los mostraría igual dos veces ("Laptop"/"Laptop") — sigue
  funcionando (cada opción liga al equipo correcto por su _id interno), solo que no
  se distinguirían a simple vista entre sí. No lo resolví porque no se pidió y es un
  caso raro (la mayoría tiene un equipo por tipo) — avisar si se quiere un
  desempate visual para ese caso.
- **Verificación:** `npm run build`; Playwright confirmando que el selector muestra
  "Laptop"/"Celular" en vez del detalle de marca/modelo/serie.
- **Commit(s):** (pendiente)

### 2026-07-17 — Quitar el botón "Volver al panel" del portal de empleado
- **Qué pasó:** el usuario pidió quitar el botón "Volver al panel" de la Mesa de
  Ayuda — los empleados no deben tener acceso al panel de administración en
  absoluto. Ya existía una condición (`hasAdminSession`, solo se mostraba si el
  navegador también tenía un `token` de admin en `localStorage`, pensado para
  cuando alguien de Sistemas usa ambas sesiones a la vez), pero el usuario prefirió
  quitarlo del todo en vez de depender de esa condición.
- **Qué cambió:** `frontend/src/components/PortalLayout.jsx` — se eliminó el
  `NavLink` "Volver al panel" y la variable `hasAdminSession` que lo controlaba.
- **Verificación:** `npm run build`; Playwright confirmando que el botón no
  aparece ni siquiera con un `token` de admin presente en `localStorage`.
- **Commit(s):** (pendiente)

### 2026-07-17 — Buscador de Mesa de Ayuda: también de lo general a lo particular
- **Qué pasó:** el usuario preguntó si el buscador debía seguir el mismo criterio de
  "general a particular" que ya tiene el wizard de Reportar Ticket. Al revisar el
  código encontré 2 problemas reales: (1) el buscador (`SEARCH_TOPICS` en
  `MesaDeAyuda.jsx`) era un catálogo de palabras clave SEPARADO del wizard
  (`CATEGORIES` en `ReportarTicket.jsx`) — ya se había desincronizado una vez (faltó
  "Aplicaciones" cuando se agregó) y le iba a volver a pasar; (2) aunque el texto
  buscado fuera muy específico (ej. "no me llegan correos de outlook"), el resultado
  solo llevaba a la categoría general (Software), todavía a un clic de lo particular.
- **Qué cambió:**
  - `frontend/src/config/ticketCategories.js` (nuevo) — única fuente de verdad para
    ambos archivos: exporta `CATEGORIES` (antes vivía solo en `ReportarTicket.jsx`),
    ahora con `keywords` por categoría Y por cada problema específico dentro de ella.
    `ReportarTicket.jsx` importa de aquí en vez de definir su propia copia.
  - `frontend/src/pages/ReportarTicket.jsx` — nuevo soporte para `?problema=<texto
    exacto>` (y `?app=<id>` para la categoría Aplicaciones, resuelto una vez que el
    catálogo de apps carga): si el buscador ya resolvió el problema específico, el
    formulario llega directo precargado, saltándose TAMBIÉN el paso 2 (no solo la
    categoría) — de lo general a lo particular sin pasos de más.
  - `frontend/src/pages/MesaDeAyuda.jsx` — el buscador ahora arma sus resultados de
    ticket dinámicamente desde `CATEGORIES`: por cada categoría se queda con el MEJOR
    match posible (un problema específico si alguno coincidió — más particular, gana
    siempre —, si no la categoría en general como respaldo), nunca ambos a la vez.
    También se agregó el catálogo de Aplicaciones Internas al buscador, para llegar
    directo a una app específica (ej. "no funciona Cuentas por Pagar"). Las
    solicitudes (pedir algo nuevo) se quedaron en su propio catálogo aparte, sin este
    nivel de detalle porque no lo necesitan.
  - Se encontró y corrigió un bug real de scoring durante las pruebas: el matching
    "flojo" (por palabra suelta) se aplicaba también a frases completas, así que una
    palabra genérica compartida (ej. "necesito") hacía ganar a la categoría con MÁS
    frases que empezaban igual, no a la más relevante ("necesito una cuenta de gmail
    nueva" apuntaba a "Equipo o accesorio" en vez de "Correo Gmail"). Se limitó el
    matching flojo a keywords de una sola palabra.
- **Verificación:** `npm run build`; Playwright con 6 búsquedas confirmando que una
  consulta genérica lleva a la categoría, una específica salta directo al formulario
  precargado (o a la nota interactiva de licencia, cuando aplica), una que nombra una
  aplicación específica llega directo con `appRef` resuelto, y que las solicitudes
  (no-tickets) siguen funcionando. Reconfirmé también el wizard completo y la
  navegación de Mesa de Ayuda sin regresiones.
- **Commit(s):** (pendiente)

### 2026-07-17 — Reportar ticket: categoría Seguridad, síntomas reales de M365, aviso de licencia y pantalla completa
- **Qué pasó:** se investigó en internet cómo categorizan tickets las mesas de ayuda
  reales (ITIL/ITSM, Freshservice/Zendesk/ServiceNow, ERPs tipo Odoo) y las diferencias
  entre licencias de Microsoft 365 Básica/Estándar, para enriquecer el catálogo de
  "problemas específicos" con ejemplos reales en vez de inventados. Hallazgo clave: casi
  toda referencia tiene una categoría de "Seguridad" (correo sospechoso/phishing) que a
  nosotros nos faltaba por completo, y M365 Básico NO incluye las apps de escritorio de
  Office (solo la versión web) — una causa real y común de tickets que en realidad son
  de licencia, no de falla. El usuario pidió implementar 3 puntos de esa investigación
  (Seguridad, síntomas de M365, aviso de licencia), insistiendo en que como los
  empleados no saben nada de Sistemas, todo debe quedar fácil/didáctico/interactivo, y
  además ajustar la pantalla para usar todo el ancho disponible (antes el panel tenía
  un tope de 700px con mucho espacio vacío al lado).
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nuevo tipo `seguridad` en `TICKET_TYPES`/
    `TICKET_TYPE_LABELS`.
  - `frontend/src/pages/ReportarTicket.jsx` — nueva categoría "🛡️ Seguridad" (correo
    sospechoso, cuenta posiblemente vulnerada, enlace raro pidiendo contraseña).
    "Software" ganó problemas específicos reales de M365 en lenguaje simple ("Outlook
    no me manda o no me llegan correos", "OneDrive no guarda o no sincroniza mis
    archivos", "Teams no tiene audio o video"). Nuevo problema interactivo "No
    encuentro Word, Excel o PowerPoint en mi computadora": en vez de ir directo al
    formulario, muestra una nota explicando que eso suele ser el plan de licencia
    (versión web, no de escritorio) y da a elegir entre "Ir a Solicitar Recurso" (pedir
    el upgrade) o "Aún así, reportarlo como ticket" (por si de verdad es una falla).
  - `frontend/src/pages/ReportarTicket.module.css` — se quitó el `max-width: 700px` del
    panel (ahora usa todo el ancho disponible, pedido explícito); las tarjetas de
    categoría pasan a `auto-fill` para aprovechar el espacio con más columnas en
    pantallas anchas. El paso final (datos del ticket) se limita a 640px con una nueva
    clase `.formWrap` — un input de texto de 1300px se lee peor, no mejor.
  - `frontend/src/pages/Tickets.jsx`, `MisTickets.jsx`, `MesaDeAyuda.jsx` — nueva
    entrada "Seguridad" en catálogos de etiquetas y un tema nuevo en el buscador de
    Mesa de Ayuda (phishing, correo sospechoso, "me hackearon"...).
- **Verificación:** `node --check`; `npm run build`; Playwright: categoría Seguridad
  completa de punta a punta, lista de Software con los nuevos síntomas de M365, la nota
  de licencia se muestra en vez del formulario y ambos botones (ir a Solicitudes /
  reportar de todos modos) funcionan, medición real del ancho del panel a 1600px de
  viewport (1288px, ya no 700px) con el formulario final limitado a 640px, envío
  end-to-end con `ticketType=seguridad`. Reconfirmé el buscador de Mesa de Ayuda sin
  regresiones.
- **Commit(s):** (pendiente)

### 2026-07-17 — Reportar ticket: wizard de 2 pasos (categoría → problema específico)
- **Qué pasó:** el usuario vio el formulario de "Reportar un problema" (radio buttons
  planos: Hardware/Software/Red/Cuenta/ERP/Otro) y no le gustó — lo sintió
  desordenado. Pidió volver a la idea de tarjetas independientes por categoría, pero
  con contenido curado y específico por cada una (ej. bajo "Software": problemas con
  Office 365, lentitud, etc.), no la misma lista genérica repetida. Aclaró además que
  "Software" y "Aplicaciones" NO son lo mismo: un programa instalado en tu equipo vs.
  una página o sistema interno de la empresa — deben ser botones separados. Pidió que
  el flujo siempre vaya de lo general a lo particular.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nuevo tipo `aplicacion` en `TICKET_TYPES`/
    `TICKET_TYPE_LABELS`, separado de `software`.
  - `frontend/src/pages/ReportarTicket.jsx` — reescrito como wizard de 2 pasos: 1)
    7 tarjetas de categoría (Hardware, Software, Aplicaciones, Red/Conectividad,
    Cuenta/Acceso, ERP, Otro), cada una con su propia descripción; 2) lista de
    problemas específicos SOLO de esa categoría (ej. Hardware: "No enciende",
    "Pantalla no da imagen"...; Software: "Windows lento", "Microsoft 365", "Macros o
    plantillas de Excel"...). La categoría "Aplicaciones" arma su lista del paso 2
    dinámicamente desde el catálogo de Aplicaciones Internas (antes ese selector vivía
    escondido dentro de "Software" — ya se quitó de ahí). Elegir un problema
    específico precarga el Asunto (editable) y salta al formulario final
    (equipo/descripción/adjuntar, sin repetir la categorización). "Otro" salta directo
    al formulario pidiendo su propio detalle libre, sin paso 2 (no aplica una lista
    curada para "no encaja en las anteriores"). El buscador de Mesa de Ayuda
    (`?tipo=X`) sigue funcionando: ahora salta directo al paso 2 de la categoría ya
    resuelta por la búsqueda.
  - `frontend/src/pages/Tickets.jsx`, `MisTickets.jsx` — nueva entrada "Aplicaciones"
    en los catálogos de etiquetas (los tabs/desgloses ya eran dinámicos, no
    requirieron más cambios).
  - `frontend/src/pages/MesaDeAyuda.jsx` — el buscador tenía "aplicacion" como palabra
    clave de Software por error (quedó así desde la sesión anterior); se corrigió y se
    agregó un tema propio "Aplicaciones — reportar ticket".
- **Verificación:** `node --check`; `npm run build`; Playwright con 7 escenarios
  (categoría→problema→asunto precargado, Software sin selector de app, Aplicaciones
  con catálogo dinámico, Otro sin paso 2, `?tipo=` saltando directo al paso 2,
  navegación "Cambiar categoría", envío end-to-end confirmando `ticketType=aplicacion`
  en el POST) — todos pasaron. Reconfirmé el buscador de Mesa de Ayuda sin
  regresiones tras el cambio de keywords.
- **Commit(s):** (pendiente)

### 2026-07-17 — Mesa de Ayuda: buscador interactivo tipo centro de ayuda
- **Qué pasó:** el usuario pidió un buscador como el de Google/un centro de ayuda,
  donde la persona escriba su problema en sus propias palabras (ej. "no me funciona
  la macros") y se le sugiera a dónde ir, en vez de tener que adivinar en cuál de las
  4 tarjetas encaja.
- **Qué cambió:** `frontend/src/pages/MesaDeAyuda.jsx` — nuevo campo de búsqueda
  arriba de las 4 tarjetas (que se quedan igual, como respaldo para navegar a mano).
  Trae un catálogo curado de 13 "temas" (5 tipos de ticket + 3 tipos de solicitud de
  cuenta + 3 tipos de solicitud de recurso + alta de ingreso), cada uno con su propia
  lista de palabras/frases clave y su ruta real de destino (reutilizando las mismas
  rutas `?tipo=...` que ya existían). Conforme se escribe, se compara el texto contra
  esas palabras clave (frase completa = coincidencia fuerte; palabra suelta de 4+
  letras parecida = coincidencia débil) y se muestran hasta 5 sugerencias ordenadas
  por relevancia; cada una navega directo al formulario correcto en un clic. Sin
  coincidencias, se avisa explícitamente para que la persona use las tarjetas de
  abajo. Todo el matching es local (sin IA ni servicio externo) — un catálogo chico y
  controlado como este no lo necesita.
- **Verificación:** `npm run build`; Playwright probando 7 búsquedas distintas (incluida
  la del ejemplo del usuario, "no me funciona la macros" → Software) confirmando que
  cada una sugiere el destino correcto y navega bien al hacer clic. Se encontró y
  corrigió un falso positivo real durante la prueba (una palabra de 3 letras como
  "que" calzaba por accidente dentro de "bloqueada") subiendo el umbral de coincidencia
  débil a 4+ letras.
- **Commit(s):** (pendiente)

### 2026-07-17 — Mesa de Ayuda: quitar la pantalla intermedia redundante
- **Qué pasó:** el usuario reportó (con capturas) que "Tengo un problema o algo no
  funciona" llevaba a una pantalla intermedia (Hardware/Software/Red/Cuenta/Otro como
  tarjetas) que luego, al elegir una, mandaba al formulario real de reportar ticket —
  el cual vuelve a mostrar EXACTAMENTE la misma lista, ahora como radio buttons. Dos
  pasos preguntando lo mismo. Al revisar el código encontré que el mismo patrón
  (pantalla intermedia que solo repite la lista del formulario de destino) también
  existía en "Acceso a un sistema o correo" (`SolicitarCuenta.jsx`) y "Equipo,
  accesorio o servicio" (`SolicitarRecurso.jsx`); el usuario pidió corregir los 3.
  Bono: la pantalla intermedia de tickets ni siquiera tenía la opción "ERP" (quedó
  desactualizada cuando se agregó ese tipo), así que además de redundante estaba
  desincronizada.
- **Qué cambió:** `frontend/src/pages/MesaDeAyuda.jsx` — se eliminó por completo la
  capa `STEPS` (la segunda pregunta con su propio card-grid) y el estado `step` que la
  controlaba. Las 4 tarjetas raíz ("Acceso a un sistema o correo", "Equipo, accesorio o
  servicio", "Alta de un nuevo ingreso", "Tengo un problema o algo no funciona") ahora
  navegan DIRECTO al formulario real (`/solicitar-cuenta`, `/solicitar-recurso`,
  `/solicitar-ingreso`, `/reportar-ticket` respectivamente) en un solo clic — la
  clasificación real (tipo de soporte, tipo de cuenta, tipo de recurso) se sigue
  preguntando una sola vez, dentro de esos formularios, que ya la tenían y que
  siguieron sin cambios. Las descripciones de las tarjetas se actualizaron para seguir
  dando una vista previa de las opciones (ej. "Hardware, software, red, cuenta/acceso,
  ERP...") sin necesidad de una pantalla extra.
- **Verificación:** `npm run build`; Playwright confirmando que las 4 tarjetas
  navegan cada una a su ruta esperada en un solo clic (sin pantalla intermedia).
- **Commit(s):** (pendiente)

### 2026-07-17 — Corrección: la etiqueta de tickets ERP mencionaba SAE por error
- **Qué pasó:** al agregar el tipo de ticket "ERP" (partición para lider.erp/
  analista.erp), la etiqueta que ve el empleado decía "🏭 ERP (SAE, módulos,
  reportes...)". El usuario aclaró que SAE, COI y NOI son OTRAS aplicaciones que aún
  no se quieren incluir en esta partición — mencionar SAE ahí era engañoso: alguien
  con un problema de SAE podría marcar "ERP" por error (llegando a quien no debe), o
  alguien con un problema real del ERP no reconocerlo si asocia la etiqueta con SAE.
  Los empleados sí conocen el sistema simplemente como "ERP", así que el nombre en sí
  no era el problema — el paréntesis con el ejemplo equivocado sí.
- **Qué cambió:** `frontend/src/pages/ReportarTicket.jsx` — la etiqueta pasa a
  "🏭 ERP (módulos, reportes, accesos...)", sin mencionar SAE/COI/NOI. `Tickets.jsx` y
  `MisTickets.jsx` ya decían solo "ERP" sin ese paréntesis, no requirieron cambio.
- **Verificación:** `npm run build`.
- **Commit(s):** (pendiente)

### 2026-07-17 — Reportar ticket: preguntar sobre cuál equipo, si tiene más de uno
- **Qué pasó:** el usuario notó que los tickets de alguien con celular Y laptop
  asignados arrastraban ambos equipos en el registro, aunque la falla solo fuera de
  uno. Pidió que Mesa de Ayuda pregunte sobre cuál equipo es el problema cuando aplique
  (más de un activo asignado); si solo tiene uno, que se siga ligando automático sin
  preguntar nada.
- **Qué cambió:**
  - `backend/src/routes/tickets.js` — nueva ruta `GET /tickets/mine/assets`
    (`employeeAuth`) que regresa los equipos activos asignados a quien reporta (vía
    `Assignment`, igual criterio que ya usaba `POST /mine`). En `POST /mine`: si la
    persona tiene más de un equipo asignado, ahora se exige un `assetId` (validado
    contra sus propios activos asignados) y el ticket solo queda ligado a ese uno; con
    0 o 1 equipo el comportamiento no cambió (se sigue ligando automático).
  - `frontend/src/pages/ReportarTicket.jsx` — nuevo selector "¿Sobre cuál de tus
    equipos es esto?" que solo aparece cuando `GET /tickets/mine/assets` regresa 2 o
    más equipos, con la opción explícita "No es sobre un equipo en particular" para
    fallas que no son de un dispositivo específico (red, cuenta, etc.). Obligatorio
    elegir algo antes de poder enviar el ticket cuando aplica.
- **Verificación:** `node --check`; `npm run build`; Playwright con 0/1/2 equipos
  asignados confirmando que el selector solo aparece con 2+, y que intentar enviar sin
  elegir muestra el error de validación esperado.
- **Commit(s):** (pendiente)

### 2026-07-17 — Notas internas: solo lectura una vez que el ticket se cierra
- **Qué pasó:** el usuario preguntó si las notas internas se pueden seguir agregando
  mientras el ticket está abierto y si quedan como solo lectura al cerrarse — al
  revisar el código de la feature recién agregada, encontré que no había ningún
  bloqueo: se podían seguir agregando notas incluso con el ticket ya `cerrado`.
- **Qué cambió:**
  - `backend/src/routes/tickets.js` — `POST /:id/internal-notes` ahora rechaza
    (400) si `ticket.status === 'cerrado'`, mismo criterio que ya usaba
    `POST /:id/messages` del lado del empleado.
  - `frontend/src/pages/Tickets.jsx` — nuevo `notesLocked` (= ticket cerrado); con el
    ticket cerrado se oculta la caja de texto y el botón de "Agregar nota interna",
    mostrando en su lugar el aviso "🔒 Ticket cerrado — las notas internas quedan
    como solo lectura." Las notas ya escritas se siguen viendo siempre. Si el ticket
    se reabre (botón "Reabrir" ya existente), se desbloquea solo.
- **Verificación:** `node --check`; `npm run build`; Playwright con un ticket abierto
  y uno cerrado (ambos con una nota interna previa) confirmando que el textarea/botón
  solo aparecen en el abierto y que el mensaje de solo-lectura solo aparece en el
  cerrado.
- **Commit(s):** (pendiente)

### 2026-07-17 — Tickets ERP: aislados, solo lider.erp y analista.erp los ven
- **Qué pasó:** el usuario pidió que los tickets de tipo ERP únicamente lleguen a
  `lider.erp@selectshop.com.mx` y `analista.erp@selectshop.com.mx`, y que el resto del
  equipo de Sistemas no los vea en absoluto (no solo "de solo lectura" — invisibles).
  Al investigar encontré que lider.erp/analista.erp hoy no tienen NINGÚN acceso al
  módulo de Tickets (no son rol admin, bloqueados por el middleware `adminOnly`), así
  que además de filtrar qué ve cada quien hubo que abrirles el acceso al tablero.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nuevo tipo `erp` en `TICKET_TYPES`/`TICKET_TYPE_LABELS`,
    seleccionable por el empleado al reportar (partición limpia y explícita, en vez de
    inferirlo de la app referenciada o de la categoría de SLA).
  - `backend/src/routes/tickets.js` — `isErpOnlyUser(user)` (rol no-admin +
    `canManagePlatformAccountsErp` sin Gmail/Plataformas generales) y
    `canViewTicket(req, ticket)` (ERP-only ve solo `ticketType==='erp'`; todos los demás
    ven todo MENOS erp). Se reemplazó el gate `router.use(auth, adminOnly)` por un
    middleware inline que deja pasar `role==='admin' O isErpOnlyUser`. `GET /` y
    `GET /counts-by-asset` filtran por tipo en la query de Mongo; `GET /:id` y
    `GET /:id/attachment` regresan 404 (no 403, para no revelar que el ticket existe) si
    no puedes verlo; las 7 rutas de escritura admin (asignar, prioridad, SLA, estatus,
    responder, notas internas, eliminar) validan lo mismo antes de `canManageTicket`.
  - `frontend/src/App.jsx` — nueva `TicketsRoute` (reemplaza `AdminRoute` en `/tickets`):
    deja entrar a admin o a un usuario ERP-only.
  - `frontend/src/components/Layout.jsx` — `erpOnlyPages` gana "🎫 Tickets ERP".
  - `frontend/src/pages/Tickets.jsx`, `ReportarTicket.jsx`, `MisTickets.jsx` — agregado
    el tipo "🏭 ERP" a los catálogos/labels correspondientes (las demás vistas ya
    derivaban tabs/desgloses dinámicamente, sin listas hardcodeadas que tocar).
- **Verificación:** `node --check` en modelo y rutas backend; `npm run build`;
  Playwright con 3 escenarios contra `/tickets` (admin normal, usuario ERP-only, viewer
  sin permiso) confirmando que el ruteo/redirect del frontend se comporta como se
  espera en cada caso.
- **Commit(s):** (pendiente)

### 2026-07-17 — Tickets: notas internas (bitácora técnica, invisible para quien reportó)
- **Qué pasó:** el usuario propuso, basado en un trabajo anterior, separar los tickets
  en dos canales: "notas públicas" (la conversación con quien reportó, para cerrar el
  ticket) y "notas privadas" (detalle técnico interno — qué se tocó, cómo se
  solucionó — para que el equipo pueda buscar después soluciones ya probadas). Las
  "notas públicas" ya existían como la conversación (`ticket.messages`); faltaba la
  parte privada.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — nuevo campo `internalNotes` (arreglo de
    `{authorName, text, createdAt}`), separado de `messages`.
  - `backend/src/routes/tickets.js` — nueva ruta `POST /:id/internal-notes` (gateada
    por `canManageTicket`, igual que responder/resolver). **Crítico:** se agregó
    `stripInternal()` y se aplicó a las 4 rutas del lado EMPLEADO (`GET /mine`,
    `POST /:id/messages`, `/close`, `/satisfaction`) para que `internalNotes` nunca
    llegue a quien reportó — por default Mongoose regresa todos los campos del
    documento, así que sin esto se habría filtrado solo.
  - `frontend/src/pages/Tickets.jsx` — nueva sección "🔒 Notas internas" en el modal de
    detalle (fondo ámbar, claramente distinta de "Responder"), con su propio hilo y
    caja de texto, deshabilitada si no eres quien tiene el ticket asignado.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando que la
  sección aparece, muestra notas existentes y que agregar una nueva llama al endpoint
  correcto. Revisé a mano las 4 rutas del lado empleado para confirmar que ninguna
  expone `internalNotes`.
- **Commit(s):** (pendiente)

### 2026-07-17 — sistemas.3 pasa a ser superadministrador, igual que sistemas.2
- **Qué cambió:** `GMAIL_ROOT_EMAIL` (un solo correo protegido) pasa a ser
  `GMAIL_ROOT_EMAILS` (arreglo) en `backend/src/config/permissions.js`, ahora con
  `sistemas.2@selectshop.com.mx` y `sistemas.3@selectshop.com.mx`. Se actualizaron
  todos los usos: `backend/src/routes/auth.js` (fuerza los 3 permisos de
  Gmail/Plataformas/ERP + rol admin en cada login, sin importar la DB),
  `backend/src/routes/users.js` (solo estas cuentas pueden otorgar/revocar esos
  permisos a otros usuarios) y `frontend/src/pages/Users.jsx` (mismo arreglo
  duplicado, casilla "Siempre activo" sin poder apagarse desde la UI).
- **Por qué:** pedido explícito — sistemas.3 debe tener el mismo nivel
  "superadministrador" protegido que ya tenía sistemas.2 (no apagable por ningún
  admin, ni siquiera por error).
- **Verificación:** `node --check` en los 3 archivos backend; `npm run build`;
  Playwright con sistemas.3 logueado confirmando que ve las columnas de permisos
  (antes solo visibles para sistemas.2), que su propia casilla aparece protegida
  ("Siempre activo", deshabilitada), y que la de un usuario normal (Felipe) sigue
  editable.
- **Commit(s):** (pendiente)

### 2026-07-17 — Se quita "Marcar en tránsito" del panel — solo lo marca el mensajero
- **Qué pasó:** el usuario reportó que sistemas.2 le dio sin querer al botón interno
  "Marcar en tránsito" del panel de admin, cuando ese paso debe hacerlo únicamente el
  mensajero (escaneando el link público desde su teléfono). Ese botón interno además
  nunca capturó quién lo presionó (a diferencia del flujo público, que sí guarda
  `transitByName`), así que era un mecanismo incompleto desde el principio.
- **Qué cambió:** se quitó por completo — `backend/src/routes/shipments.js` ya no
  tiene la ruta `PUT /:id/transit` (la interna, de admin), y
  `frontend/src/pages/Shipments.jsx` ya no tiene el botón "Marcar en tránsito" ni la
  función que lo llamaba. El único camino para pasar a "en tránsito" ahora es que el
  mensajero confirme desde el link público (`POST /shipments/public/:token/transit`,
  sin tocar).
- **Aclaración sobre acceso de Felipe (sistemas.4):** la confirmación de RECEPCIÓN
  nunca pasó por una ruta de admin restringida por dueño — siempre fue, y sigue
  siendo, el link público (`/confirmar-envio/:token`, sin login) el que la persona que
  recibe usa para confirmar, sin importar si tiene o no cuenta de Sistemas. La
  restricción de dueño de la entrada anterior del changelog solo aplica a
  `DELETE /:id` (borrar el envío desde el panel) — ver/descargar PDFs sigue abierto a
  cualquier admin.
- **Verificación:** `node --check`; `npm run build`; Playwright confirmando que el
  botón ya no aparece para nadie (ni para quien creó el envío ni para otros).
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos y Tickets ahora respetan al dueño, aunque todos sean admin
- **Qué pasó:** el usuario (sistemas.3) pidió que, aunque todos en Sistemas sean
  admin, un envío o ticket siga siendo "de quien lo creó/atiende" — no quería que
  sistemas.2/sistemas.4 pudieran modificar algo que él está haciendo. Se acordó:
  visible para todos (solo lectura), pero solo el dueño (o el Gerente de Sistemas,
  con visibilidad total) puede modificar/eliminar.
- **Qué cambió:**
  - `backend/src/routes/shipments.js` — nuevo `canManageShipment(req, shipment)`:
    dueño = `shipment.sentBy` (quien lo creó). Aplica a `PUT /:id/transit` y
    `DELETE /:id` (403 si no eres el dueño ni el Gerente). `GET /` y las descargas de
    PDF siguen abiertas a cualquier admin.
  - `backend/src/routes/tickets.js` — nuevo `canManageTicket(req, ticket)`: un ticket
    SIN asignar sigue abierto a cualquiera (alguien tiene que poder tomarlo); ya
    asignado, solo `ticket.assignedTo` (o el Gerente) puede modificarlo. Aplica a
    `PUT /:id/assign`, `/priority`, `/sla-category`, `/status`, `POST /:id/reply` y
    `DELETE /:id`.
  - `frontend/src/pages/Shipments.jsx` — se ocultan "Marcar en tránsito"/"Eliminar"
    para quien no es dueño (se muestra "🔒 De {nombre}" en su lugar); las descargas de
    PDF y "Ver" se quedan visibles para todos.
  - `frontend/src/pages/Tickets.jsx` — el modal de detalle deshabilita
    prioridad/categoría SLA/asignación/responder/resolver/cerrar/reabrir/eliminar si
    el ticket ya está asignado a alguien más, con un aviso "🔒 Asignado a X".
- **Por qué:** aunque el rol sea el mismo (admin) para todo el equipo de Sistemas,
  cada quien debe poder trabajar lo suyo sin que otro lo modifique por encima —
  excepto el Gerente de Sistemas, que sí necesita visibilidad/control total.
- **Verificación:** `node --check` en ambas rutas backend; Playwright simulando dos
  envíos (uno propio, uno ajeno) confirmando que los botones de acción correctos
  aparecen/desaparecen según el dueño.
- **Commit(s):** (pendiente)

### 2026-07-17 — El PDF de Envíos ahora muestra quién marcó "en tránsito" y cuándo
- **Qué cambió:** `backend/src/utils/shipmentPdf.js` — se agregó una línea
  "En tránsito por: {nombre} — {fecha/hora}" justo debajo del estatus, usando
  `transitByName`/`transitAt` (se llenan cuando el mensajero confirma desde el link
  público en su teléfono). Antes esa confirmación solo se veía en la caja de firma
  (sin fecha); ahora aparece igual de visible que "Recibido por", en ambos formatos
  (Salida y Recepción, ya que comparten el mismo cuerpo).
- **Por qué:** pedido explícito — que se vea claro el nombre del mensajero que
  escanea/confirma el tránsito desde su teléfono.
- **Verificación:** `node --check`; PDF de prueba generado con estatus "en_transito"
  confirmando que la línea aparece correctamente.
- **Commit(s):** (pendiente)

### 2026-07-17 — Bug real encontrado: filas de tablas encimadas en PDF de Envíos y Responsivas
- **Qué pasó:** el usuario mandó una captura real (Recepción de un envío con 3 laptops)
  mostrando la descripción del equipo invadiendo la fila de abajo. El cambio a Carta no
  lo arregló porque no era el problema real.
- **Causa encontrada:** dos tablas armadas a mano (no con `kvRow`, que sí mide la altura
  del texto) usaban una altura de fila **fija**: la tabla de equipos en
  `backend/src/utils/shipmentPdf.js` (15pt fijos) y "ACCESORIOS ENTREGADOS" en
  `backend/src/routes/responsiva.js` (16pt fijos). Cuando una descripción/modelo era
  larga, el texto envolvía a una segunda línea pero la fila NO crecía — esa segunda
  línea se dibujaba encima de la fila siguiente. Confirmé además con una prueba directa
  de pdfkit que `lineBreak: false` (que ambas tablas usaban, asumiendo que evitaba el
  ajuste de línea) **no** evita el ajuste — solo desactiva la separación silábica: el
  texto igual envuelve si excede el ancho dado, así que la altura fija era la única
  causa real.
- **Qué cambió:** ambas tablas ahora miden la altura real de cada fila con
  `doc.heightOfString(...)` (mismo criterio que ya usa `measureKvHeight` para las
  secciones de datos) antes de dibujarla, y ya no usan `lineBreak: false`.
- **Verificación:** regeneré el PDF de Recepción con los MISMOS datos de la captura del
  usuario (3 laptops con la descripción larga que causaba el problema) y confirmé
  visualmente que ya no hay superposición; también probé la tabla de accesorios con
  nombres largos. `node --check` en ambos archivos.
- **Commit(s):** (pendiente)

### 2026-07-17 — Todos los PDF pasan de A4 a Carta (Letter)
- **Qué pasó:** el usuario reportó que los PDF de Envíos y Responsivas se ven con
  información "encimada" al imprimirlos, y sospechó que era porque no estaban en
  tamaño Carta (México usa Carta, no A4).
- **Investigación:** revisé a fondo el código compartido de armado de PDF
  (`pdfBranding.js`: `kvRow`/`measureKvHeight`/`clauseBlock`/`sectionBand`) y generé
  PDFs de prueba con datos realistas (nombres largos, justificaciones largas, varias
  plataformas) — no encontré texto encimado en el contenido en sí; el cálculo de
  alturas (`measureKvHeight`) ya contempla valores de varias líneas correctamente.
  Lo que sí confirmé: **todos** los generadores de PDF (Responsivas de Gmail/Plataforma/
  ERP/Activos, Solicitudes de Cuenta, Envíos) usaban `size: 'A4'` mientras que en
  México se imprime en Carta — un tamaño de página distinto al de la hoja física
  real puede causar que el driver de impresión no escale bien y el contenido se vea
  mal alineado o cortado al imprimir.
- **Qué cambió:** `backend/src/utils/pdfBranding.js` — `PAGE_W`/`PAGE_H` pasan de las
  dimensiones de A4 (595.28×841.89pt) a las de Carta (612×792pt). Se cambió
  `size: 'A4'` → `size: 'LETTER'` en los 7 archivos que generan PDF: `gmailAccounts.js`,
  `platformAccounts.js`, `platformAccountsErp.js`, `responsiva.js`,
  `utils/shipmentPdf.js`, `utils/responsivaLegacyPdf.js`, `utils/accountRequestPdf.js`.
- **Nota:** si después de este cambio TODAVÍA se ve algo encimado en un PDF
  específico, hace falta una captura de pantalla de ESE documento en concreto — con
  datos de prueba variados no logré reproducir un encimado real en el contenido, solo
  el tamaño de página incorrecto.
- **Verificación:** `node --check` en los 8 archivos tocados (incluye `pdfBranding.js`);
  se regeneraron localmente Salida/Recepción de Envíos y una Responsiva de Gmail con
  datos de prueba largos, confirmando vía el MediaBox del PDF que ya miden 612×792pt
  y que no hay superposición visual.
- **Commit(s):** (pendiente)

### 2026-07-17 — Ajuste de firmas: Salida = Mensajero + Gerente de Sistemas, Recepción = solo Destinatario
- **Qué cambió:** `backend/src/utils/shipmentPdf.js` — el formato de Salida ahora firma
  "Mensajero" (con `transitByName`) y "Gerente de Sistemas" (nombre real vía
  `GERENTE_SISTEMAS_EMAIL`, mismo patrón que ya usan las responsivas de cuentas). El
  formato de Recepción se redujo a una sola firma centrada: "Destinatario — recibí de
  conformidad" (con `receivedByName`, o `recipientName` si aún no se ha confirmado).
  `signatureRow()` ahora soporta una sola caja sin estirarse a todo el ancho de la hoja.
  `backend/src/routes/shipments.js` — la ruta `GET /:id/pdf` busca al Gerente de
  Sistemas (`Employee.findOne({ corporateEmails: GERENTE_SISTEMAS_EMAIL })`) y se lo
  pasa al PDF.
- **Por qué:** pedido explícito de corrección tras la versión anterior (esta misma
  sesión) — el usuario aclaró que la salida la firman mensajero + gerente, y la
  recepción solo el destinatario.
- **Verificación:** `node --check` en ambos backend; PDFs de prueba generados
  localmente y revisados visualmente vía Quick Look.
- **Commit(s):** (pendiente)

### 2026-07-17 — Envíos: dos formatos separados (Salida para el mensajero, Recepción para el destinatario)
- **Qué pasó:** un mensajero insistió en que él tenía que firmar la "hoja de salida", cuando en
  realidad esa confusión venía de que solo existía UN formato para todo el flujo. El usuario pidió
  separar en dos documentos: uno de salida (que ya existía) con la firma del mensajero, y uno nuevo
  de recepción para quien recibe en destino.
- **Qué cambió:**
  - `backend/src/utils/shipmentPdf.js` — se extrajo el cuerpo común (folio, datos del
    solicitante, tabla de equipos, motivo, estatus) a `renderShipmentBody()`, y las cajas de firma a
    `signatureRow()` (ahora imprime el nombre ya capturado digitalmente arriba de la línea, si
    existe, en vez de firmas en blanco). `buildShipmentPdf` (FORMATO DE SALIDA) firma "Entrega
    (Sistemas/Almacén)" + "Mensajero — recibe para transportar" (con `transitByName`).
    `buildShipmentReceptionPdf` (nuevo, FORMATO DE RECEPCIÓN) firma "Mensajero — hace la entrega" +
    "Recibí de conformidad" (con `receivedByName`).
  - `backend/src/routes/shipments.js` — nueva ruta `GET /:id/reception-pdf`.
  - `frontend/src/pages/Shipments.jsx` — el botón único "⬇ PDF" se separó en "⬇ Salida" y
    "⬇ Recepción", cada uno con su tooltip explicando quién firma cuál.
- **Verificación:** `node --check` en ambos backend; generación local de ambos PDFs con datos de
  prueba (revisados visualmente vía Quick Look) confirmando que cada uno trae la sección de firma
  correcta con el nombre digital ya impreso; Playwright confirmando que los dos botones nuevos
  llaman a su endpoint correspondiente.
- **Commit(s):** (pendiente)

### 2026-07-16 — Planos de Red: bug de conexiones "imborrables", quitar import, reemplazar imagen, iconos más chicos
- **Qué pasó:** Felipe reportó que no podía borrar/editar las conexiones (cables) entre
  dispositivos de un plano — las creó por error y se quedaron ahí, "se ven feas".
  También pidió quitar "Importar dispositivos descubiertos" (ya no se usa), poder
  actualizar la imagen de un plano ya existente sin perder los dispositivos ya
  colocados (ejemplo: Tepoz 4 ya tenía una foto más nueva), y reducir el tamaño de
  los íconos un 50% porque se amontonan.
- **Bug real encontrado (no solo "la línea es delgada"):** en
  `frontend/src/pages/NetworkLayoutDetail.module.css`, `.pinsLayer` (el contenedor
  transparente que envuelve los pines, encima del SVG de conexiones) no tenía
  `pointer-events: none` — su área vacía se robaba TODOS los clics sobre el plano
  salvo que cayeran justo encima de un pin, así que un clic sobre una línea de
  conexión casi nunca llegaba realmente al SVG. Esa es la causa real de "no las pude
  quitar". Se corrigió (`pointer-events:none` en la capa, `pointer-events:auto` en
  cada pin) y además se agregó una línea invisible mucho más ancha por debajo de cada
  conexión (la visible seguía siendo de solo 2.5px, muy difícil de acertar incluso sin
  el bug de la capa) para que el área de clic real sea generosa.
- **Qué más cambió:**
  - `backend/src/routes/networkLayouts.js` — nueva ruta `PUT /:id/image` que
    reemplaza `imageData`/`imageMimeType`/`imageFileName` de un plano YA existente
    sin tocar sus dispositivos/conexiones (viven en colecciones aparte, ligadas por
    el id del plano, que no cambia).
  - `frontend/src/pages/NetworkLayoutDetail.jsx` — nuevo modal "🖼️ Reemplazar plano"
    en la barra de herramientas que sube la imagen nueva y la recarga sin recargar
    la página; se quitó por completo el botón/modal "Importar dispositivos
    descubiertos" (y su código: `ImportDiscoveredModal`, `extractDiscoveredRow`, el
    import de `xlsx`) — se deja intacto el catálogo de dispositivos ya importados
    antes y su picker "completar con un dispositivo descubierto", solo se quitó la
    forma de agregar MÁS por archivo.
  - `.pin` pasa de 30px a 15px (icono/borde reducidos a la par) para que no se
    amontonen con varios dispositivos cerca uno del otro.
- **Verificación:** `node --check` en la ruta backend; `npm run build`; Playwright
  simulando un plano con una conexión y confirmando que un clic CERCA (no exacto)
  de la línea ahora sí dispara el borrado, que el botón de importar ya no aparece,
  que el de reemplazar sí, que el pin mide 15×15px, y que el flujo de reemplazar
  imagen manda el archivo correctamente al backend.
- **Commit(s):** (pendiente)

### 2026-07-16 — Fix defensivo: fallas silenciosas en el Inicio ahora se ven en consola
- **Qué pasó:** el usuario reportó que en producción el Inicio se veía "vacío" —
  solo el saludo, accesos directos y (tras refrescar) Pendientes de revisión, pero
  ninguna de las secciones nuevas (Catálogos y Activos, Cuentas y Plataformas,
  Operación, Recursos Humanos). Revisando el código se encontró que el fetch de
  Catálogos y Activos (`/employees` + `/assets` + `/assignments`) no tenía manejo de
  error — si cualquiera de esas 3 llamadas fallaba, esa sección se quedaba vacía
  para siempre sin ningún aviso ni en pantalla ni en consola.
- **Qué cambió:** `frontend/src/pages/Dashboard.jsx` — se agregó `.catch()` a ese
  fetch (cae a listas vacías + `console.error` en vez de quedarse muda), y se
  agregó `console.error` por cada llamada individual que falle dentro de los
  `Promise.allSettled` de Cuentas/Operación/RH (antes fallaban en silencio total,
  cayendo a `[]` sin dejar ningún rastro).
- **Por qué:** esto NO explica por completo por qué las otras 3 secciones nuevas
  tampoco aparecían (esas se alimentan del mismo estado que si mostró "Pendientes"
  correctamente) — se le pidió al usuario la consola del navegador (F12) para
  encontrar la causa real; este cambio es defensivo/de diagnóstico, no se marca como
  el fix final hasta confirmar con la consola.
- **Verificación:** `npm run build`.
- **Commit(s):** (pendiente)

### 2026-07-16 — El Inicio ahora es un feed visual de toda la app (no solo accesos directos)
- **Qué cambió:** `frontend/src/pages/Dashboard.jsx` se amplió para aplicar la misma
  lógica visual de Indicadores (tarjetas KPI con color/ícono, barras de desglose,
  listas tipo feed) a TODA la app, no solo a inventario. Se agregaron 3 secciones
  nuevas — **Cuentas y Plataformas** (conteo de cuentas Gmail/Plataformas/ERP +
  desglose por plataforma), **Operación** (envíos en curso/recibidos por estatus,
  tickets abiertos/bloqueantes por tipo, feed de actividad reciente de Auditoría) y
  **Recursos Humanos** (Ingresos RH y Solicitudes de Recursos por estatus + últimos
  registros) — más un resumen condensado de **Catálogos y Activos** con link directo
  a Indicadores para el detalle a fondo (no se duplica esa página completa). También
  se agregó un filtro global de sucursal/departamento (mismo patrón de chips que
  Indicadores) que afecta todas las secciones donde el dato lo permite: Cuentas
  (vía `employee.office/department`), Ingresos RH (tiene oficina/depto directos),
  Solicitudes de Recursos (solo depto, no guarda oficina) y Envíos (solo sucursal
  origen/destino, no depto) — Tickets y Pendientes de revisión se dejan sin filtrar
  a propósito (Tickets no guarda oficina del empleado hoy; Pendientes son acciones
  por hacer, no analítica, filtrarlas podría esconder algo urgente).
- **Por qué:** pedido explícito — "que fuera un dashboard como el de indicadores pero
  de absolutamente toda la página, como el inicio de FB o LinkedIn... que aplique la
  misma lógica que el de Indicadores." Se confirmó con el usuario que era "todos los
  módulos de un jalón" (no por fases) y que el filtro fuera global.
- **Verificación:** `npm run build`; Playwright con datos simulados de todos los
  módulos (empleados, activos, cuentas, envíos, tickets, ingresos, recursos,
  auditoría) confirmando que las 4 secciones nuevas renderizan bien, que el filtro de
  sucursal actualiza los números correctamente en las secciones donde aplica, y que
  no hay overflow horizontal en móvil (390px).
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: la app se "atoraba" varios minutos en wifi (nunca en cable)
- **Qué pasó:** el usuario reportó que con Ethernet todo funciona bien, pero conectado
  a CUALQUIER wifi (no es cuestión de ancho de banda ni señal débil), acciones como
  seleccionar un empleado en Solicitud de Recursos, Ingresos RH o un Envío se quedan
  pensando hasta 5 minutos.
- **Causa:** ninguna de las dos instancias de axios del frontend
  (`frontend/src/services/api.js`, `frontend/src/services/employeeApi.js`) tenía
  `timeout` configurado (el default de axios es "nunca"). Wifi tiene, por naturaleza
  de la radio (roaming entre puntos de acceso, ahorro de energía), momentos donde una
  conexión queda "en agujero negro" — la petición sale pero nunca llega respuesta ni
  error — y sin timeout, el navegador se queda esperando hasta el timeout de TCP del
  sistema operativo (varios minutos), aunque el ancho de banda esté perfecto. Esto no
  pasa en Ethernet porque ahí esas caídas momentáneas de la conexión prácticamente no
  ocurren.
- **Qué cambió:** ambas instancias de axios ahora tienen `timeout: 90000` (90s — con
  margen de sobra sobre el cold start de Render de ~50s) y un interceptor que
  reintenta UNA vez, automáticamente, cualquier petición GET (son idempotentes, no
  duplican nada) que falle por timeout o sin respuesta del servidor — cubre el blip
  típico de wifi sin que la persona note nada. Si el reintento también falla, ahora sí
  se muestra un error en vez de quedarse pensando indefinidamente.
- **Verificación:** `npm run build`; Playwright simulando una conexión que falla en el
  primer intento y responde bien en el segundo — confirmado que la app se recupera
  sola y sin que el usuario tenga que hacer nada.
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: el modal de Responsiva (Gmail/Plataforma) mostraba un correo/usuario viejo
- **Qué pasó:** el usuario reportó un caso concreto — Felipe (sistemas.4) dio de alta
  una cuenta Gmail, otra persona (sistemas.3) la vio en pantalla, la registró en Google
  real y luego Felipe corrigió el correo en la app. Al generar la responsiva después,
  el título del modal en pantalla seguía mostrando el correo VIEJO, pero el PDF
  descargado ya mostraba el correo corregido — dos personas viendo la misma cuenta
  con datos desincronizados en sus respectivas pestañas.
- **Qué cambió:** `GmailAccounts.jsx`/`PlatformAccounts.jsx` — antes de abrir el modal
  de "Generar responsiva" ahora se pide un dato fresco de esa cuenta al backend
  (`GET /gmail-accounts/:id` y `GET /platform-accounts/:id`, endpoints nuevos) en vez
  de usar el objeto ya cargado en la lista de la pantalla (que puede llevar horas sin
  refrescarse). Además, ambas páginas ahora recargan su lista solas cuando la pestaña
  vuelve a tener foco, para no quedarse viendo datos de hace rato cuando dos personas
  editan las mismas cuentas casi al mismo tiempo.
- **Por qué:** el PDF siempre se generó con datos frescos de la base de datos (eso
  nunca estuvo mal); lo desactualizado era solo lo que mostraba la pantalla — de ahí
  la confusión de "la página dice una cosa y el PDF dice otra".
- **Nota aparte (no era bug):** que existan dos responsivas archivadas (una con cada
  correo) es esperado — cada clic en "Generar responsiva" archiva un PDF nuevo como
  historial; y que el correo viejo ya no aparezca en "Cuentas Gmail" también es
  correcto, porque fue una corrección del mismo registro, no una cuenta duplicada.
- **Verificación:** `node --check` en ambas rutas backend; Playwright simulando lista
  desactualizada + endpoint individual con el dato corregido — confirmado que el
  modal ahora muestra el correo correcto aunque la lista siga vieja.
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: casi todas las páginas se veían angostas en monitores grandes
- **Qué pasó:** el usuario reportó (con capturas de su laptop y su monitor) que todas
  las páginas se veían "angostas, con espacio vacío de más" en pantallas grandes,
  excepto Empleados, que sí llenaba todo el ancho. Causa: cada página tenía su propio
  tope de ancho (`.page { max-width: 1000–1400px }` en su CSS module) menos Empleados
  (`Page.module.css`, sin tope) — en un monitor ancho eso dejaba una franja gris vacía
  a la derecha en Activos, Cuentas de Plataformas, Gmail, Usuarios, Auditoría,
  Tickets, Planos de Red, Stock, Solicitudes, Responsivas e Indicadores/Dashboard.
- **Qué cambió:** se quitó el `max-width` de `.page` en los 13 CSS modules de esas
  páginas para que se comporten igual que Empleados (llenan todo el ancho disponible
  del `<main>`). Se dejaron intactas las páginas públicas fuera del panel (Solicitar
  Cuenta/Ingreso, Mesa de Ayuda, portal de empleado), cuyo formulario angosto y
  centrado sí es intencional.
- **Por qué:** se descartó primero que fuera zoom del navegador (el usuario confirmó
  que ya estaba en 100%); comparando el CSS de Empleados contra el de las demás
  páginas, el `max-width` en `.page` fue la única diferencia real y sistemática.
- **Verificación:** `npm run build` + Playwright a 1920×1040 confirmando que Activos
  y Empleados ahora miden el mismo ancho de contenido (antes: Activos topado en
  1400px con franja vacía; ahora: llena el mismo ancho que Empleados).
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: la responsiva de Gmail/Plataforma quedaba desactualizada tras editar la cuenta
- **Qué pasó:** Felipe reportó que al corregir una cuenta de Gmail (la última que se
  creó, de Javier) el cambio se veía bien en el listado de Gmail, pero la responsiva
  generada seguía mostrando los datos de antes. Causa: cada responsiva se archiva como
  PDF congelado en `ResponsivaArchive` (para tener historial), pero nada volvía a
  generarla cuando la cuenta se editaba después — el archivo se quedaba con los datos
  del momento en que se generó por primera vez.
- **Qué cambió:** `backend/src/models/ResponsivaArchive.js` — se agregó `sourceId`
  (referencia a la cuenta de origen) y `requestData` (los datos puntuales del
  formulario — tienda, jefe directo, vigencia — que antes no se guardaban). En
  `backend/src/routes/gmailAccounts.js` y `backend/src/routes/platformAccounts.js`, el
  dibujo del PDF se movió a una función reutilizable (`renderGmailResponsivaPdf` /
  `renderPlatformResponsivaPdf`), y el `PUT /:id` de cada cuenta ahora, después de
  guardar la edición, busca las responsivas ya archivadas de esa cuenta que **todavía
  no se hayan firmado/subido** (`signedFileData` vacío) y las regenera con los datos
  actuales. Las que ya tienen una copia firmada subida nunca se tocan, para no alterar
  un documento que ya se firmó en papel.
- **Por qué:** decisión explícita del usuario — "si el gmail se modificó, también la
  responsiva" — al preguntarle si prefería regeneración automática o solo un aviso,
  eligió regeneración automática (respetando las ya firmadas).
- **Verificación:** `node --check` en los 3 archivos + `require()` de ambas rutas para
  confirmar que cargan sin errores. No se pudo probar contra Mongo real en este entorno
  (sin acceso a DB/red desde el sandbox) — falta confirmar en producción con una
  edición real de cuenta.
- **Commit(s):** (pendiente)

### 2026-07-16 — Bug: la página de Activos se veía "cortada" en pantallas chicas
- **Qué cambió:** `frontend/src/pages/Assets.module.css` — la fila de filtros por tipo de
  activo (💻📱🖨️🌐🔬...) forzaba `flex-wrap: nowrap` + `overflow-x: auto` en móvil,
  metiendo todos los íconos en una sola fila con scroll horizontal oculto (sin indicador
  visual de que había más íconos a la derecha) en vez de simplemente pasar a una segunda
  fila como ya hacían el resto de las páginas (Empleados, Envíos, Indicadores). Se quitó
  ese scroll forzado y ahora la fila se envuelve (`flex-wrap: wrap`) igual que las demás.
- **Por qué:** reporte del usuario — "todas las pantallas se ven cortadas, en empleados
  es la única que sí se acopla con respecto al ancho." Se comparó el CSS de Empleados
  (que sí se adapta bien) contra el de Activos y esta fue la única regla fuera de patrón
  encontrada; se confirmó con Playwright a 390px y 820px de ancho antes/después del fix.
- **Commit(s):** `c7ea2a0`

### 2026-07-16 — Bug: los colores de las tarjetas se veían grises (color-mix sin soporte)
- **Qué pasó:** el usuario reportó que las tarjetas del Menú y de las categorías se
  veían "muy grises", cuando antes tenían color. La causa: los fondos suaves de cada
  categoría se calculaban con la función CSS `color-mix()`, que no está soportada en
  todos los navegadores — donde no lo está, el navegador ignora esa línea y el fondo
  se queda transparente/gris en vez del color pastel esperado (en Chromium, usado para
  probar, sí funcionaba, por eso no se detectó antes).
- **Qué cambió:** `frontend/src/components/Layout.jsx`/`.module.css` — se quitó
  `color-mix()` por completo. Cada categoría ahora trae su color de fondo ya calculado
  a mano (`bg`, ej. `#eff6ff` para azul, `#f5f3ff` para morado), pasado como variable
  CSS (`--accent-bg`) igual que `--accent` — sin depender de que el navegador calcule
  nada. De paso, los botones de categoría en la barra ahora también se pintan del
  color de su categoría al pasar el mouse/tocar (antes se quedaban en gris genérico).
- **Verificación:** `npm run build`; Playwright headless — se confirmó por código
  (`getComputedStyle`) que el color de fondo de las tarjetas ya no depende de una
  función sin soporte garantizado, y visualmente que el hover de categoría en la barra
  ahora se pinta de su color.

### 2026-07-16 — Ajuste de distribución de la barra superior + "Inicio" en el Menú
- **Qué pasó:** segunda vuelta de feedback visual sobre la barra recién reorganizada:
  el botón "Menú" debía quedar pegado al logo (no después de las categorías), las
  categorías debían repartirse a lo ancho de toda la barra (no amontonadas a la
  izquierda), y el engranaje debía quedar pegado al bloque de usuario a la derecha —
  con espacio visible separando los 3 grupos (logo+Menú / categorías / engranaje+
  usuario). También pidió que "Inicio" (la página de aterrizaje) apareciera como su
  propio apartado dentro del Menú, no solo alcanzable picando el logo.
- **Qué cambió:** `frontend/src/components/Layout.jsx`/`.module.css` — la barra se
  reorganizó en 3 grupos flex (`topbarLeft`: logo+Menú: `topbarCats`: categorías con
  `flex:1` y `justify-content: space-evenly`, con margen a los lados para el espacio
  visible; `topbarRight`: engranaje+usuario, empujado a la derecha). El overlay "Menú"
  (vista de todo junto) ahora incluye una primera sección "Inicio" con una tarjeta que
  lleva a `/`.
- **Verificación:** `npm run build`; Playwright headless — se confirmó la distribución
  de los 3 grupos en la barra y la nueva sección "Inicio" al abrir "Menú".

### 2026-07-16 — Navegación tipo Facebook: categorías como botones directos + engranaje de Configuración
- **Qué pasó:** feedback visual del usuario sobre la barra superior/menú (Fase 1 de
  navegación): quería que se sintiera "visual, interactivo, intuitivo, como el home de
  FB que muestra de todo" — sin números (eso es trabajo de Indicadores) — y que las
  categorías que antes eran sub-encabezados dentro de un solo bloque "Administración"
  fueran botones directos en la barra, con el nombre en vez de un ícono (como los
  íconos del home de FB, pero con texto). También pidió un ícono de engranaje aparte,
  solo para Configuración/Usuarios — Auditoría, Planos de Red y Aplicaciones Internas
  NO son configuración.
- **Qué cambió:**
  - `frontend/src/components/Layout.jsx` — reescrito: las categorías
    ("Catálogos y Activos", "Cuentas y Plataformas", "Operación") ya no viven dentro de
    un solo bloque "Administración de Usuarios y Activos" — son botones de texto
    directos en la barra superior, cada uno con su color. Clic en una categoría abre el
    overlay directo en esa categoría (con "← Volver" para ver todo). El botón "Menú" se
    conserva y ahora muestra TODAS las categorías juntas, una tras otra, en una sola
    pantalla visual (como el home de FB) — sin ningún número/estadística. Nuevo botón
    ⚙️ aparte, admin-only, va directo a `/users` (Configuración = solo Usuarios).
    Auditoría, Planos de Red y Aplicaciones Internas se movieron a "Operación".
  - `frontend/src/components/Layout.module.css` — tarjetas rediseñadas tipo
    "dashboard": ícono en burbuja de color, franja de color arriba, descripción corta
    debajo del nombre — cada categoría con su propio color (azul/morado/verde), en vez
    de tarjetas planas de solo ícono+texto.
  - `frontend/src/pages/Dashboard.jsx`/`.module.css` — los accesos directos de la
    página de inicio se actualizaron para reflejar las mismas categorías/colores que la
    barra superior (antes decían "Administración de Usuarios y Activos" genérico).
- **Por qué:** pedido explícito de dirección sobre cómo debía sentirse/verse la
  navegación, con Facebook como referencia concreta.
- **Verificación:** `npm run build`; Playwright headless (rutas mockeadas) — se
  confirmaron los botones de categoría en la barra, el "Menú" mostrando todo junto con
  colores/descripciones, el salto directo a una categoría con "Volver", y el engranaje
  yendo directo a Usuarios.

### 2026-07-16 — División de Naucalpan (última pendiente de sucursales)
- **Qué pasó:** el usuario ya sabe quién queda en NAUCALPAN (TLB) y quién en NAUCALPAN
  (CRISTALERIA) — la única división de sucursales que había quedado pendiente. Como la
  página de Sucursales ya se había quitado (a petición del usuario, una vez usada), se
  reconstruyó un panel puntual, mismo patrón que GOLDEN/Torre Polanco.
- **Qué cambió:**
  - `backend/src/routes/employees.js` — nueva ruta `POST /employees/split-naucalpan`
    (`{ tlbIds }`): los marcados pasan a `NAUCALPAN (TLB)`, el resto de
    `SUC.6 CEDI Naucalpan` pasa a `NAUCALPAN (CRISTALERIA)`; los activos con esa
    ubicación (no distinguen persona) se van todos a Cristalería por default.
  - `frontend/src/pages/Employees.jsx` — nuevo panel temporal "Dividir Naucalpan" arriba
    de la tabla: checklist real de quienes siguen con `SUC.6 CEDI Naucalpan`, botón para
    aplicar. Se oculta solo cuando ya no queda nadie pendiente.
- **Por qué:** cerrar la única división de sucursales que faltaba.
- **Verificación:** `node --check`; `npm run build`; Playwright headless — el checklist
  solo muestra a los empleados de Naucalpan (no a los de otras sucursales), y el flujo
  de confirmar/aplicar corre sin errores. **Pendiente del usuario:** entrar a
  `/employees` y correr la división; una vez aplicada, este panel (y "SUC.6 CEDI
  Naucalpan" de los 3 catálogos de oficina) se puede volver a quitar.

### 2026-07-16 — "KOSHER" se agrega al catálogo de razón social
- **Qué pasó:** aunque ya se quitó la herramienta de reasignación masiva, "KOSHER" sigue
  siendo una razón social real que se va a seguir usando al dar de alta gente nueva — el
  usuario pidió que ya no haya que escribirla a mano cada vez (quedaba solo alcanzable
  vía "Otro").
- **Qué cambió:** `frontend/src/pages/Employees.jsx` y
  `frontend/src/pages/SolicitarIngreso.jsx` — se agregó `'KOSHER'` a `BUSINESS_NAMES` en
  ambos (alta de empleado y Solicitud de Ingreso), como una opción más del selector.
- **Verificación:** `npm run build`; Playwright headless — se confirmó que "KOSHER"
  aparece como opción seleccionable en el desplegable de razón social al crear un
  empleado.

### 2026-07-16 — Se quitan las herramientas de corrección (Sucursales y KOSHER), ya cumplieron su función
- **Qué pasó:** el usuario terminó de aplicar las correcciones de nomenclatura de
  sucursales (renombres 1 a 1, división de GOLDEN, división de Torre Polanco) y de
  razón social (reasignación a "KOSHER"), y pidió quitar ambas herramientas porque ya
  no las necesita. Al preguntarle el alcance sobre Sucursales, confirmó quitar la
  página completa (no solo el panel de corrección), incluyendo el catálogo — Empleados
  y Activos vuelven a usar sus listas de oficina fijas (ya con los nombres correctos).
- **Qué se quitó:**
  - `backend/src/models/Branch.js`, `backend/src/routes/branches.js` — eliminados. Se
    quitó también su montaje (`/api/branches`) de `backend/src/index.js`.
  - `frontend/src/pages/Branches.jsx` — eliminado, junto con su ruta (`/branches`) en
    `App.jsx` y su tarjeta "Sucursales" en el menú (`Layout.jsx`).
  - `backend/src/routes/employees.js` — se quitó `POST /set-business-name` (el
    endpoint de la herramienta KOSHER).
  - `frontend/src/pages/Employees.jsx` — se quitó `BusinessNameToolPanel` y su uso en
    la página.
  - Los 3 `OFFICES` (`assetFields.js`, `Employees.jsx`, `SolicitarIngreso.jsx`) ya no
    incluyen "GOLDEN" (su división ya se aplicó) — sí siguen incluyendo "SUC.6 CEDI
    Naucalpan", porque esa división quedó pendiente (el usuario pidió resolverla
    después) y ya no hay una herramienta de checklist para completarla; de necesitarse,
    tocaría reasignar esos empleados uno por uno desde su ficha, o pedir que se
    reconstruya la herramienta.
- **Verificación:** `node --check` en todo el backend; `npm run build`; Playwright
  headless — se confirmó que el menú ya no muestra "Sucursales" (solo el ya existente
  "Envíos entre Sucursales", que es otra función) y que Empleados ya no muestra el
  panel de KOSHER.

### 2026-07-16 — La herramienta KOSHER ya no muestra a quien ya esté marcado
- **Qué pasó:** el usuario reportó que se le estaba pasando gente en el checklist —
  como el filtro se queda fijo en "direcci", cada vez que volvía a la página veía otra
  vez a los que ya había reasignado y los volvía a marcar por accidente.
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — `BusinessNameToolPanel` excluye
  del filtro a cualquiera cuya razón social ya sea "KOSHER" (comparación sin importar
  mayúsculas/minúsculas), sin importar si su sucursal/área siguen haciendo match con la
  búsqueda.
- **Verificación:** Playwright headless — un empleado con razón social ya "KOSHER" y
  oficina "Dirección General" no aparece en el checklist, aunque los demás con esa
  misma oficina sí.

### 2026-07-16 — "KOSHER" en mayúsculas
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — el valor de razón social que
  asigna la herramienta (y todos los textos del panel que lo mencionan) pasan de
  "Kosher" a "KOSHER", a petición del usuario.

### 2026-07-16 — Ajuste de la herramienta Kosher: el filtro busca en Sucursal/Área, no en razón social
- **Qué pasó:** el usuario corrigió el criterio de búsqueda del panel recién agregado —
  el texto ("dirección", "familia", etc.) no vive en la razón social actual de estos
  empleados, sino en su Sucursal/Oficina o en su Área. La razón social destino sigue
  siendo "Kosher", solo cambió dónde se busca a los candidatos.
- **Qué cambió:** `frontend/src/pages/Employees.jsx` — `BusinessNameToolPanel` ahora
  filtra por `office`/`area` en vez de `businessName`, y el checklist muestra ambos
  campos más la razón social actual de cada quién, para verificar de un vistazo antes
  de marcar.
- **Verificación:** Playwright headless — se confirmó que un empleado con "Dirección
  General" en Oficina y otro con "Familia Dirección" en Área aparecen en el filtro,
  mientras uno sin ninguno de los dos queda fuera.

### 2026-07-16 — Corrección de razón social: reasignar empleados a "Kosher"
- **Qué pasó:** mismo tipo de corrección que las sucursales, pero sobre la razón social
  (`Employee.businessName`). El director de Finanzas indicó que un grupo específico de
  empleados (pagados en efectivo) debe quedar con "Kosher" como razón social. El usuario
  pidió poder filtrar candidatos por texto (ej. "dirección", "dirección general",
  "familia dirección") y elegir a mano quiénes aplican de verdad.
- **Qué cambió:**
  - `backend/src/routes/employees.js` — nueva ruta `POST /employees/set-business-name`
    (`{ employeeIds, businessName }`, `Employee.updateMany` sobre los IDs dados).
    Genérica a propósito (no hardcodeada a "Kosher") para poder reusarse en
    correcciones similares más adelante. A diferencia de la división de sucursales, no
    hay un "resto" que mover a otro valor — quien no se marca se queda como está.
  - `frontend/src/pages/Employees.jsx` — nuevo panel "Corrección de razón social —
    Kosher" arriba de la tabla: input de búsqueda (precargado con "direcci") que filtra
    en vivo sobre los empleados ya cargados en la página (sin pedir nada nuevo al
    backend), checklist de coincidencias, botón para reasignar los marcados.
- **Por qué:** dato real de la empresa (forma de pago), no del documento de Finanzas.
- **Verificación:** `node --check`; `npm run build`; Playwright headless (rutas
  mockeadas) — se confirmó que el filtro encuentra "Dirección General"/"Familia
  Dirección" pero no otras razones sociales, y que el botón aplica el cambio y muestra
  cuántos se actualizaron.

### 2026-07-16 — Segunda excepción de sucursales: Torre Polanco también se divide
- **Qué pasó:** al pedirle al usuario la lista de gente de Polanco Piso 16 para dividir
  GOLDEN, resultó que 6 de esas 7 personas en realidad tienen hoy "SUC.1 Corporativo
  Torre Polanco" como oficina (no GOLDEN) — que el renombre 1 a 1 iba a mandar a
  POLANCO PISO 13. Físicamente están en Piso 16, así que ese renombre tampoco era 1 a 1
  sin excepciones. Se saca "Torre Polanco → Piso 13" del mapa de renombres simples y se
  maneja igual que GOLDEN: como una división con checklist.
- **Qué cambió:**
  - `backend/src/routes/branches.js` — `OFFICE_RENAME_MAP` ya no incluye Torre Polanco
    (queda en 8 renombres, antes 9). Nuevas rutas `GET /torre-polanco-employees` y
    `POST /split-torre-polanco` (mismo patrón que `/split-golden`: los marcados en el
    checklist van a POLANCO PISO 16, el resto a POLANCO PISO 13; los activos, al no
    tener esta ambigüedad, se van todos a Piso 13 de un jalón). Cubre tanto si la
    persona sigue con el nombre viejo como si ya se renombró a Piso 13 por el botón
    anterior.
  - `frontend/src/pages/Branches.jsx` — se extrajo la lógica de "dividir con checklist"
    a un componente compartido (`SplitSection`), usado ahora dos veces (GOLDEN y Torre
    Polanco) en vez de tener el código de GOLDEN duplicado a mano para el segundo caso.
- **Por qué:** dato real de la empresa que el usuario fue descubriendo al revisar el
  checklist de GOLDEN — Xochitl sí quedó correcta ahí (es la única excepción real de
  GOLDEN), pero el resto de su lista pertenecía a otra sucursal con su propia excepción.
- **Verificación:** `node --check`; `npm run build`; Playwright headless (rutas
  mockeadas) — se confirmaron ambas secciones de división funcionando de forma
  independiente (una no afecta a la otra). **Pendiente del usuario:** entrar a
  `/branches`, correr "Aplicar corrección de nombres" si no lo ha hecho, marcar en el
  checklist de GOLDEN solo a Xochitl, y en el checklist de Torre Polanco a Francisco
  Aldana Flores, Jose Angel Guerrero Torres, Jose Joel Castilla Gutierrez, Noemi Sanchez
  Maldonado, Renata Gabriela De Leon Ramirez y Moises Marcovich Goldberg.

### 2026-07-16 — Corrección de nomenclatura de sucursales (Empleados y Activos reales)
- **Qué pasó:** el usuario aclaró que la Fase 2 malinterpretó el catálogo de sucursales —
  la lista vieja de 11 nombres (usada hoy en el desplegable "oficina/sucursal" de
  Empleados) estaba **desactualizada**; la lista de 16 nombres es la correcta. Dio la
  correspondencia exacta 1 a 1 entre ambas, con dos casos especiales: "GOLDEN" se divide
  en CISNES y POLANCO PISO 16 (según quién esté en cada una), y "SUC.6 CEDI Naucalpan" se
  divide en NAUCALPAN (CRISTALERIA) y NAUCALPAN (TLB) — esta segunda división se deja
  pendiente a petición del usuario ("resuelve lo demás primero").
- **Qué cambió:**
  - `backend/src/routes/branches.js` — `DEFAULT_BRANCHES` ahora tiene los 16 nombres
    correctos con su estatus de levantamiento real (de la tabla del documento original).
    Nuevo `OFFICE_RENAME_MAP` (9 renombres 1 a 1, sin ambigüedad) y 3 rutas nuevas:
    `POST /migrate-office-names` (aplica esos 9 renombres sobre `Employee.office`,
    `Asset.location` y el catálogo mismo, de un jalón), `GET /golden-employees` (lista a
    quién le falta dividir de GOLDEN, para armar un checklist real en vez de que alguien
    tenga que teclear nombres), y `POST /split-golden` (divide GOLDEN: los marcados en el
    checklist van a POLANCO PISO 16, el resto a CISNES).
  - `frontend/src/pages/Branches.jsx` — nuevo panel "Corrección de nomenclatura" con el
    botón para aplicar los 9 renombres (muestra cuántos empleados/activos cambiaron por
    cada uno) y el checklist para dividir GOLDEN.
  - `frontend/src/config/assetFields.js`, `frontend/src/pages/Employees.jsx`,
    `frontend/src/pages/SolicitarIngreso.jsx` — los 3 `OFFICES` hardcodeados actualizados
    a los nombres correctos; "GOLDEN" y "SUC.6 CEDI Naucalpan" se dejan temporalmente
    hasta correr/confirmar su división (quitarlos ahora dejaría sin opción visible a
    quien todavía no se ha migrado).
  - `backend/src/models/AuditLog.js` — se agregó `'sucursal'` al enum de `entity`; sin
    esto, los logs de auditoría del catálogo de Sucursales (Fase 2) fallaban en
    silencio (bug encontrado al revisar este cambio).
- **Por qué:** dato real de la empresa, no del documento de Finanzas — el usuario ya
  tenía la sucursal correcta y hacía falta corregir el sistema para reflejarla.
- **Verificación:** `node --check` en los archivos backend tocados; `npm run build`;
  Playwright headless (rutas mockeadas) — se confirmó el panel de migración completo:
  aplicar los 9 renombres (con el resumen de cuántos registros cambiaron) y dividir
  GOLDEN vía checklist (con confirmación antes de aplicar, y el checklist desaparece
  una vez que ya no quedan empleados en GOLDEN). **Pendiente de que el usuario:**
  (1) entre a `/branches` y presione "Aplicar corrección de nombres" y "Aplicar división
  de GOLDEN" en producción (esto no se puede correr desde aquí, no hay acceso directo a
  la base de datos), y (2) confirme cómo dividir Naucalpan Cristalería/TLB para
  completar esa migración después.

### 2026-07-16 — Fase 2 de requerimientos de Finanzas: sucursales, familias de activos, propiedad y telemetría
- **Qué pasó:** continuación del cierre de brechas de `AssetsManager_Requerimientos_2.docx`
  (Fase 1 fue la navegación). Esta fase cubre las secciones 3-4 del documento: catálogo de
  sucursales con estatus de levantamiento físico, familias de activos (incluyendo el
  "equipo especial" de ciertas sucursales), equipo propiedad del empleado (no de la
  empresa), y el gate de acceso a equipos de telemetría.
- **Qué cambió:**
  - **Catálogo de sucursales** — nuevo modelo `backend/src/models/Branch.js`
    (`name`, `inventoryStatus` levantado/pendiente, `equipmentScope`
    solo_telefonico/computo_completo, `notes`) + rutas `backend/src/routes/branches.js`
    (`GET /public` sin auth para formularios públicos, CRUD admin-only) + página nueva
    `frontend/src/pages/Branches.jsx` (ruta `/branches`, tabla editable). Se siembra la
    primera vez que se pide el catálogo con los mismos 11 nombres ya usados hoy como
    `office`/`location` — la tabla de 14 sucursales con estatus que dio la sesión usa
    otros nombres (Cisnes, Horacio, Tepotzotlán II/III/IV, etc.) que no se pudieron
    reconciliar con certeza contra los existentes; queda pendiente que Sistemas
    confirme la correspondencia y renombre/agregue desde esta misma página. **Nota:**
    los 3 selectores de sucursal hardcodeados en el frontend (`assetFields.js`,
    `Employees.jsx`, `SolicitarIngreso.jsx`) todavía NO se conectaron a este catálogo —
    queda para un siguiente ajuste, sin urgencia porque ya tienen los mismos valores.
  - **Familias de activos** — `backend/src/models/Asset.js`: 3 tipos nuevos
    (`microscopio`, `equipo_fiscal`, `escaner_diagnostico`) para el "equipo especial"
    mencionado en la sesión (tienda "Fantástico"). `frontend/src/config/assetFields.js`
    y `frontend/src/pages/Assets.jsx`: labels/iconos/specs + nueva pestaña "Equipo
    especial" en Activos.
  - **Equipo propiedad del empleado** — `Asset.companyOwned` (default `true`). Se
    muestra en el resguardo (badge "👤 empleado" en Activos) pero se excluye de los
    conteos de inventario en `frontend/src/pages/Indicadores.jsx` (Total/Disponibles/
    categorías/donut) cuando es `false`.
  - **Telemetría restringida** — `Asset.isTelemetry` + `User.canViewTelemetryAssets`
    (mismo patrón que los permisos de Gmail/Plataformas/ERP ya existentes — ni admin lo
    trae implícito). `backend/src/routes/assets.js` oculta activos marcados como
    telemetría de listados/detalle para quien no tenga el permiso. Checkbox nuevo en
    `Users.jsx` (solo visible/otorgable por la cuenta raíz de Gmail, mismo criterio que
    los demás). La carta de confidencialidad firmada sigue siendo un proceso de RH/legal
    fuera del sistema — esto solo aplica el gate técnico.
- **Por qué:** pedido explícito del documento de la junta de Finanzas del 10 de julio.
- **Verificación:** `node --check` en todos los archivos backend tocados; `npm run
  build` en frontend; Playwright headless (rutas mockeadas) — se confirmó la página de
  Sucursales (listar/crear), los checkboxes y badges nuevos en Activos (incluyendo la
  pestaña "Equipo especial"), y el checkbox de telemetría en Usuarios.

### 2026-07-16 — Se quita el sidebar fijo: barra superior + menú de selección (tipo Facebook)
- **Qué pasó:** el usuario reportó feedback directo del director tras ver la Fase 1 (sidebar
  reagrupado en 3 secciones): seguía viéndose desordenado, y "el de Mesa de Ayuda" no
  debía estar ahí (es el portal del EMPLEADO, Sistemas no navega hacia allá desde su
  propio panel). Lo que pide el director es no tener un "recuadro lateral enlistando las
  cosas" en absoluto — una página principal desde la que se van seleccionando las demás
  páginas, "tipo Facebook". Se confirmaron 2 decisiones con el usuario antes de
  reconstruir: (1) barra superior fija con botón "Menú" que abre una pantalla de
  selección de bloque → página (no un menú desplegable tradicional ni una página sin
  barra), y (2) una vez dentro de una página, ese mismo botón "Menú" siempre disponible
  para saltar a cualquier otra (no pestañas de páginas hermanas).
- **Qué cambió:**
  - `frontend/src/components/Layout.jsx` — reescrito por completo: ya no hay
    `<aside>` con lista de enlaces. Ahora es una barra superior delgada (logo — que
    lleva al inicio —, botón "Menú", usuario/cerrar sesión) + un overlay de menú de
    dos pasos: primero elegir bloque (Administración de Usuarios y Activos /
    Indicadores — Mesa de Ayuda ya NO aparece aquí), y al elegir "Administración" se
    ve una sola pantalla con todas sus páginas como tarjetas, agrupadas solo
    visualmente (Catálogos y Activos / Cuentas y Plataformas / Operación / Sistema).
    Un usuario ERP-only ve sus 3 páginas directo, sin el paso de bloque. Se
    conservaron exactamente los mismos permisos/condiciones que ya existían por rol
    y por permiso de cuentas (Gmail/Plataformas/ERP) — nada de visibilidad cambió,
    solo cómo se navega hacia ello.
  - `frontend/src/components/Layout.module.css` — reescrito (fuera todo el CSS de
    sidebar/colapsar/mobile-hamburger; nuevo CSS de barra superior + overlay).
  - `frontend/src/pages/Dashboard.jsx` — se quitó la tarjeta de acceso directo a
    "Mesa de Ayuda" (mismo motivo: no es una página a la que Sistemas navegue).
  - Se verificó que quitar el sub-enlace "Empleados → Bajas" del menú no rompe nada:
    `Employees.jsx` ya tiene sus propias pestañas internas (Activos/Bajas) que leen y
    escriben el query param solas, independientes del menú.
- **Por qué:** pedido explícito del director, con ejemplo concreto (Facebook) de cómo
  debía sentirse la navegación — prioridad alta por la revisión de avance del 17 de
  julio.
- **Verificación:** `npm run build`; Playwright headless (rutas mockeadas) — se
  confirmó la barra superior sin sidebar, el overlay de selección de bloque, la
  pantalla de páginas agrupadas dentro de "Administración", y que elegir una tarjeta
  navega y cierra el menú solo, aterrizando en la página correcta con sus propios
  controles intactos (ej. las pestañas Activos/Bajas de Empleados).

### 2026-07-16 — Navegación en 3 bloques + página Indicadores (Fase 1 de requerimientos de Finanzas)
- **Qué pasó:** el usuario compartió `AssetsManager_Requerimientos_2.docx`, resumen de la
  junta de revisión con dirección/Finanzas del 10 de julio (cubre toda la app excepto
  Tickets/Mesa de Ayuda, documentados aparte). Dirección aprobó el fondo ("~80% ya está
  hecho") pero pidió explícitamente reordenar la navegación en 3 bloques claros
  (Mesa de Ayuda / Administración de Usuarios y Activos / Indicadores) antes de la
  siguiente revisión — la app "se ve desordenada" aunque funcionalmente esté bien.
  Se auditó el código completo contra el documento (8 agentes de exploración) para
  separar lo que ya existe de lo que falta; esta es la Fase 1 (navegación), la más
  visible para la revisión del 17 de julio. El resto de fases (catálogo de sucursales,
  familias de activos, alias de marca, responsiva de área, envíos, permisos de
  usuarios internos, catálogo de conceptos) se agregan en los días siguientes.
- **Qué cambió:**
  - `frontend/src/components/Layout.jsx` — sidebar reagrupado en 3 secciones visuales:
    "Mesa de Ayuda" (link directo al portal), "Administración de Usuarios y Activos"
    (Disponibilidad, Empleados, Activos, Asignaciones, Responsivas, Cuentas, Envíos,
    Tickets, Ingresos RH, Solicitudes de Recursos, Usuarios, Auditoría, Planos de Red,
    Aplicaciones Internas) e "Indicadores" (nuevo).
  - `frontend/src/pages/Dashboard.jsx` — se deja como landing simple: saludo, accesos
    directos a los 3 bloques y "Pendientes de revisión". Todo el detalle analítico que
    tenía antes (KPIs de inventario, categorías, donut, top empleados, propiedad de
    cómputo, actividad del equipo, resumen de tickets) se mudó a la nueva página.
  - `frontend/src/pages/Indicadores.jsx` (nuevo, ruta `/indicadores`) — contiene todo
    ese detalle analítico movido de Dashboard.jsx (reutiliza `Dashboard.module.css`),
    incluyendo el leaderboard de actividad por persona/sucursal que ya existía.
  - `frontend/src/components/PortalLayout.jsx` — nuevo link "Volver al panel" en el
    sidebar del portal de empleado, visible solo si el navegador también tiene una
    sesión de Sistemas abierta (`localStorage.token`), para cruzar de un clic entre
    Mesa de Ayuda y el panel admin.
- **Por qué:** pedido explícito y repetido de dirección ("ahora luzcan", estructura de
  3 bloques) — es la brecha de mayor visibilidad para la revisión de avance de mañana.
- **Verificación:** `npm run build`; sin acceso a la base de datos real, se probó con
  `vite preview` + Playwright headless (rutas mockeadas) — se confirmó el sidebar con
  los 3 bloques, que `/indicadores` carga y muestra KPIs/categorías/actividad/tickets
  sin errores de consola, que el Dashboard trimmed muestra los accesos directos y
  pendientes, y que el portal de empleado muestra "Volver al panel" cuando hay sesión
  de Sistemas simultánea.

### 2026-07-15 — Tickets: adjuntar imágenes en la conversación (ambos lados)
- **Qué pasó:** el usuario pidió poder adjuntar imágenes en la conversación de un ticket
  ("para ver los errores y eso") — hasta ahora solo se podía adjuntar UNA evidencia al
  reportar el ticket (`Ticket.attachmentData`), pero no en los mensajes de ida y vuelta.
- **Qué cambió:**
  - `backend/src/models/Ticket.js` — `ticketMessageSchema` ahora acepta
    `attachmentData`/`attachmentMimeType`/`attachmentFileName` por mensaje (mismo patrón
    Buffer-en-Mongo que el adjunto del reporte inicial); `text` pasa a ser opcional
    (puede ser solo una imagen).
  - `backend/src/routes/tickets.js` — `POST /:id/messages` (empleado) y `POST /:id/reply`
    (Sistemas) ahora aceptan `multipart/form-data` con un campo `attachment` opcional
    (reutilizan el `upload`/`ALLOWED_ATTACHMENT_MIME` de 15MB que ya existía). Nueva ruta
    `GET /:id/messages/:messageId/attachment` para servir la imagen — como la puede pedir
    cualquiera de los dos lados de la conversación, valida el JWT a mano (no puede colgarse
    de `employeeAuth` ni `adminOnly` a secas, cualquiera de los dos bloquearía al otro lado).
  - `frontend/src/components/MessageAttachmentImage.jsx` (nuevo, compartido) — pide la
    imagen como blob con el axios que sí manda el Bearer token (no puede ser un
    `<img src>` directo) y la muestra como miniatura clicheable (abre el original).
  - `frontend/src/pages/MisTickets.jsx` y `frontend/src/pages/Tickets.jsx` — el composer
    de ambos lados ahora tiene un botón para adjuntar imagen (con chip de "archivo
    seleccionado" y opción de quitarlo antes de enviar), y las burbujas de la conversación
    muestran la miniatura si el mensaje trae una.
- **Por qué:** para poder mostrar capturas de pantalla de un error a media conversación
  (no solo al reportar el ticket), tanto el empleado como Sistemas.
- **Verificación:** `node --check` en Ticket.js/tickets.js; `npm run build` en frontend;
  sin acceso a la BD real, se probó con `vite preview` + Playwright headless (rutas de
  API mockeadas) en ambos lados — se confirmó que la miniatura se ve al abrir un ticket
  con un mensaje con imagen, que se puede adjuntar un archivo desde el composer (aparece
  el chip, se puede quitar) y que tras enviar la nueva burbuja también muestra la imagen.

### 2026-07-15 — Mis Tickets: los mensajes del empleado ahora quedan a la derecha
- **Qué pasó:** en la conversación del empleado, sus propios mensajes ("Tú") se veían a
  la izquierda y los de Sistemas a la derecha — al revés de la convención normal de chat
  (WhatsApp/iMessage), donde "mis mensajes" van a la derecha. El usuario pidió invertirlo.
- **Qué cambió:** `frontend/src/pages/MisTickets.jsx` — se intercambiaron las clases de
  alineación (`bubbleRowRight`/`bubbleGroupRight`) entre los mensajes del empleado y los
  de Sistemas/la resolución final, en las 3 burbujas del hilo (reporte inicial, mensajes
  de ida y vuelta, resolución). Del lado del admin (`Tickets.jsx`) no cambia nada — ahí
  la respuesta del propio admin ya estaba a la derecha, que es lo correcto desde su
  perspectiva.
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `npx vite build` sin errores. Verificado con `vite preview` +
  Playwright headless con una conversación de ida y vuelta: los mensajes de "Tú" aparecen
  a la derecha y los de Sistemas a la izquierda.

### 2026-07-15 — Tickets: clasificación por SLA (reemplaza Severidad)
- **Qué pasó:** el usuario compartió la matriz oficial de Niveles de Servicio (SLA) de
  Grupo Select Shop — 10 categorías de falla, cada una con exactamente un Nivel (1/2/3),
  una Prioridad (P4 Baja/P3 Media/P2 Alta/P1 Crítica) y tiempos objetivo de
  Respuesta/Resolución — y pidió que la app clasifique el ticket automáticamente
  (Prioridad + Nivel) en cuanto Sistemas elige la categoría, reemplazando el campo
  `severity` (Consulta/Baja/Media/Alta/Urgente) agregado unos días antes.
- **Qué cambió:**
  - `backend/src/models/Ticket.js`: nuevo `SLA_CATALOG` (las 10 filas de la matriz,
    exportado como `Ticket.SLA_CATALOG`). Se quita `severity`; se agregan `slaCategory`,
    `slaLevel` (1/2/3), `responseDueAt`/`resolutionDueAt` (calculados desde `createdAt` —
    el reloj del SLA corre desde que se reportó, no desde que se clasificó). `priority`
    pasa de 3 a 4 valores (se agrega `critica`/P1).
  - `backend/src/routes/tickets.js`: `PUT /:id/severity` → `PUT /:id/sla-category` — al
    elegir la categoría, en un solo guardado fija `slaLevel` + `priority` + fechas límite
    según la matriz; Sistemas puede seguir ajustando la prioridad a mano después.
  - `frontend/src/pages/Tickets.jsx` (admin): select "Categoría de Falla (SLA)" en vez de
    "Severidad"; al elegirla se reflejan de inmediato el nuevo Nivel de Servicio, la
    Prioridad (ahora con "Crítica" disponible) y la fecha límite de resolución.
    `isOverdue()` ahora usa la fecha límite real cuando ya se clasificó (antes solo
    heurística de días abierto).
  - `frontend/src/pages/MisTickets.jsx` (empleado, solo lectura): "Severidad Asignada" →
    "Nivel de Servicio" en el detalle y el badge de la lista.
- **Por qué:** pedido explícito del usuario, con la matriz SLA como referencia.
- **Verificación:** `node --check` sobre `Ticket.js`/`tickets.js`; `npx vite build` sin
  errores. Verificado con `vite preview` + Playwright headless: al clasificar un ticket
  como "Servidores y Core" en el admin, Prioridad pasa a "Crítica" y Nivel de Servicio a
  "Nivel 3" solos, con la fecha límite de resolución calculada; el empleado ve "Nivel de
  Servicio: Nivel 3" sin poder editarlo.

### 2026-07-15 — La encuesta CSAT ya no se puede cambiar una vez calificada
- **Qué pasó:** la entrega anterior (mismo día) dejaba volver a calificar/cambiar la
  respuesta en cualquier momento; el usuario pidió que, una vez calificado, solo se vea
  la respuesta elegida, sin poder editarla.
- **Qué cambió:**
  - `frontend/src/pages/MisTickets.jsx` (`CsatSurvey`): si `ticket.satisfactionRating` ya
    tiene valor, se muestra un recuadro fijo con esa respuesta (sin botones); las 5
    opciones solo aparecen mientras no se ha calificado.
  - `backend/src/routes/tickets.js` (`POST /:id/satisfaction`): rechaza con 400 si el
    ticket ya tiene `satisfactionRating` — refuerza en el servidor lo mismo que ya no deja
    hacer la interfaz. Al reabrirse un ticket (mensaje nuevo del empleado sobre uno
    resuelto), se limpia `satisfactionRating` junto con la resolución anterior, para poder
    calificar de nuevo cuando se resuelva esa nueva vuelta.
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `node --check` sobre `tickets.js`; `npx vite build` sin errores.
  Verificado con `vite preview` + Playwright headless: un ticket ya calificado muestra
  solo la respuesta elegida en un recuadro fijo, sin las demás opciones ni forma de
  cambiarla.

### 2026-07-15 — La ventana flotante se cierra sola al calificar la encuesta CSAT
- **Qué cambió:** `frontend/src/pages/MisTickets.jsx` — `CsatSurvey` ahora recibe un
  `onClose` (encadenado desde `MisTickets` → `TicketThread`) y lo llama medio segundo
  después de guardar la calificación — tiempo suficiente para ver la opción marcada antes
  de que la ventana de la conversación se cierre sola.
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `npx vite build` sin errores. Verificado con `vite preview` +
  Playwright headless: al elegir una opción de la encuesta se ve resaltada brevemente y
  luego la ventana flotante se cierra, volviendo a la lista de "Mis tickets".

### 2026-07-15 — Cierre de tickets: manual (Sistemas y empleado) + automático a los 5 días
- **Qué pasó:** el usuario preguntó en qué momento se cierra un ticket — la respuesta era
  que "cerrado" existía como estatus en el modelo/tablero pero ningún botón lo disparaba
  todavía. Pidió que se pudiera cerrar a mano (tanto Sistemas como el propio empleado) y
  que además se cierre solo si nadie responde después de resuelto.
- **Qué cambió:**
  - `backend/src/routes/tickets.js`: nuevo `POST /:id/close` (empleado dueño del ticket,
    solo si está `resuelto`). Nuevo `autoCloseStaleResolved()` — cierra en automático
    cualquier ticket `resuelto` con `resolvedAt` de hace 5+ días; se ejecuta de forma
    perezosa (sin cron real, que no aplicaría en Render free tier) cada vez que se pide la
    lista de tickets, del lado admin (`GET /`) o del empleado (`GET /mine`). Un mensaje
    nuevo del empleado ya reabre el ticket antes de que esto aplique, así que nunca cierra
    uno que sigue en curso.
  - `frontend/src/pages/Tickets.jsx` (admin): botón "Cerrar ticket" junto al ya existente
    "Reabrir", visible cuando el ticket está `resuelto` (reusa `PUT /:id/status`, que ya
    aceptaba `cerrado`).
  - `frontend/src/pages/MisTickets.jsx` (empleado): botón "Cerrar ticket" dentro de la
    conversación, visible cuando está `resuelto` — "¿Ya quedó resuelto y no necesitas
    seguir la conversación?".
- **Por qué:** pedido explícito del usuario — manual para ambos lados, más el cierre
  automático a los 5 días como respaldo.
- **Verificación:** `node --check` sobre `tickets.js`; `npx vite build` sin errores.
  Verificado con `vite preview` + Playwright headless en ambos lados: el botón "Cerrar
  ticket" del empleado cambia el estatus a "Cerrado" en la lista y el modal (composer
  desaparece, queda el aviso de cerrado); el del admin aparece junto a "Reabrir" con un
  ticket resuelto de prueba.

### 2026-07-15 — Rediseño: alias de Microsoft 365 como cuentas independientes + Tienda para Mercado Libre
- **Qué pasó:** el usuario probó el `aliases[]` embebido de la entrega anterior (dentro de
  la cuenta de Microsoft 365, un aviso "🔗 N alias" en la tabla) y pidió algo distinto —
  confirmado explícitamente: cada alias debe verse como **su propio renglón independiente**
  en Cuentas de Plataformas (con su propia contraseña), no escondido dentro de la cuenta
  de 365. También pidió que, al elegir **Mercado Libre**, se pueda capturar la **Tienda**
  a la que pertenece, con un desplegable que se va llenando solo con las tiendas ya
  capturadas antes.
- **Qué cambió (revierte el `aliases[]` embebido de la entrega anterior):**
  - `backend/src/models/PlatformAccount.js`: se quita `aliases[]`; se agregan `store`
    (texto, Tienda) y `aliasOf` (ObjectId → otra `PlatformAccount` de Microsoft 365,
    puramente informativo — no cambia que la cuenta sea 100% independiente: su propia
    contraseña, estado, etc.).
  - `backend/src/utils/createAccount.js` / `backend/src/routes/platformAccounts.js`:
    `POST /`, `POST /import` y `PUT /:id` ahora aceptan/guardan `store`/`aliasOf` en vez
    de `aliases`; `GET /` puebla `aliasOf` para mostrar la etiqueta en la tabla.
    `GET /:id/request-defaults` ahora prefiere `account.store` (si ya se corrigió ahí)
    sobre la tienda que traía la Solicitud original.
  - `frontend/src/pages/PlatformAccounts.jsx`: **Mercado Libre** se agrega a la lista de
    plataformas (no estaba). En "Nueva cuenta"/"Editar cuenta": campo "Tienda" (solo
    Mercado Libre) con `<datalist>` que sugiere las tiendas ya usadas en otras cuentas de
    Mercado Libre (crece solo, sin catálogo aparte); selector "¿Es alias de una cuenta de
    Microsoft 365?" (cualquier plataforma) con las cuentas de 365 existentes. Tabla: nueva
    columna "Tienda"; etiqueta "🔗 alias de {correo}" bajo el usuario cuando aplica.
- **Por qué:** pedido explícito del usuario, aclarado con una pregunta directa sobre qué
  significaba "de forma independiente".
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite build`
  sin errores. Verificado con `vite preview` + Playwright headless: una cuenta de
  Microsoft 365 y una de Mercado Libre (con Tienda y `aliasOf` apuntando a la de 365) se
  ven como renglones independientes en la tabla, cada una con su propia contraseña; al
  abrir "Nueva cuenta" y elegir Mercado Libre aparecen los campos "Tienda" y "¿Es alias
  de...?" correctamente.

### 2026-07-15 — Alias de Microsoft 365 también al crear la cuenta (no solo al editar)
- **Qué cambió:** la entrega anterior (mismo día) solo dejaba agregar/editar alias desde
  "Editar cuenta"; el usuario pidió que también se pudiera desde "Nueva cuenta". Se movió
  la sección de alias a una función compartida (`renderAliasSection`) que usan ambos
  modales, y `POST /platform-accounts` / `POST /platform-accounts/import` (alta nueva y
  registro de cuenta ya existente) ahora también aceptan y guardan `aliases` — mismo
  saneo (`sanitizeAliases`, extraído a `utils/createAccount.js` para no duplicarlo entre
  las 3 rutas que ahora lo usan).
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite build`
  sin errores. Verificado con `vite preview` + Playwright headless: al abrir "Nueva
  cuenta" con Microsoft 365 seleccionado (es la opción por default), aparece la misma
  sección "Alias de este correo" con agregar/quitar filas.

### 2026-07-15 — Cuentas de Plataformas: alias de Microsoft 365 + a qué plataforma se usan
- **Qué pasó:** el usuario explicó que en Microsoft 365 se pueden crear varios alias de
  correo sobre un mismo buzón, y que ya usa esos alias como usuario de login en distintas
  plataformas de venta (Mercado Libre, Amazon...) — preguntó si se podía llevar el
  registro de esos alias dentro de la cuenta de 365 y anotar en cuál plataforma se usa
  cada uno.
- **Contexto encontrado:** no existía una sección aparte de "cuentas de 365" — un buzón de
  Microsoft 365 ya es, hoy, un renglón más de "Cuentas de Plataformas"
  (`PlatformAccount` con `platform: 'Microsoft 365'`, junto con Amazon/Netflix/Adobe/etc.
  como cuentas de software). Se optó por agregar los alias como una lista embebida dentro
  de ese mismo registro, en vez de crear un modelo/página nueva — es la misma cuenta física
  de correo, solo con direcciones adicionales.
- **Qué cambió:**
  - `backend/src/models/PlatformAccount.js`: nuevo campo `aliases: [{ address, usedForPlatform }]`.
  - `backend/src/routes/platformAccounts.js`: `PUT /:id` ahora acepta `aliases` (se manda
    la lista completa cada vez, mismo patrón que `platforms[]` en Solicitar Cuenta).
  - `frontend/src/pages/PlatformAccounts.jsx`: en "Editar cuenta", cuando la plataforma es
    Microsoft 365, aparece "Alias de este correo" — lista editable (agregar/quitar) de
    pares dirección + plataforma en la que se usa. En la tabla, la celda de
    Usuario/Correo muestra "🔗 N alias" con un tooltip listando cada uno.
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite build`
  sin errores. Sin acceso a la base de datos real en este entorno, se verificó con `vite
  preview` + Playwright headless interceptando `GET /platform-accounts` con una cuenta de
  Microsoft 365 con 2 alias de prueba — se confirmó el aviso "2 alias" en la tabla y la
  sección completa (con ambos alias precargados) en el modal de edición.

### 2026-07-14 — Mesa Ayuda: Responsable de Soporte + Severidad + encuesta CSAT
- **Qué pasó:** el usuario pidió dos mejoras al detalle de ticket en Mis Tickets: (1) ver
  quién lo atiende y qué tan severo es, con el nombre real del agente en el hilo en vez
  de "Sistemas" genérico; (2) una encuesta de satisfacción de 5 opciones cuando el ticket
  queda resuelto.
- **Hallazgo antes de programar:** buena parte de (1) ya existía y no hacía falta
  duplicar — `Ticket.assignedByName` ya guarda el nombre del agente asignado (texto
  plano, lo llena `PUT /tickets/:id/assign`), y cada mensaje ya guarda `authorName` real
  (igual `ticket.resolvedByName` para la resolución). El "Sistemas" genérico estaba
  hardcodeado en el frontend, no era una limitación de datos — así que no se agregó un
  campo `assignedAgent` nuevo (habría duplicado `assignedByName` y creado dos fuentes de
  verdad en el mismo modal del admin), solo se dejó de hardcodear.
- **Qué cambió:**
  - `backend/src/models/Ticket.js`: 2 campos nuevos genuinos —
    `severity` (Consulta/Baja/Media/Alta/Urgente, distinto de `priority` que ya existía y
    no se toca) y `satisfactionRating` (las 5 opciones de la encuesta).
  - `backend/src/routes/tickets.js`: `PUT /:id/severity` (admin, mismo patrón que
    `PUT /:id/priority`) y `POST /:id/satisfaction` (empleado dueño del ticket, solo si
    `resuelto`/`cerrado`).
  - `frontend/src/pages/MisTickets.jsx` (portal oscuro): sección "Detalles del ticket"
    (Responsable de Soporte, Severidad Asignada) arriba del hilo; nombre real del agente
    en las burbujas (`m.authorName`/`ticket.resolvedByName`) en vez de "Sistemas"; badge
    de severidad junto al estatus en la lista; encuesta CSAT (5 opciones, un clic,
    se puede volver a cambiar) debajo del hilo, solo si el ticket ya está resuelto/cerrado.
  - `frontend/src/pages/Tickets.jsx` (admin, tema claro sin cambios): nuevo select
    "Severidad" junto al de "Prioridad" que ya existía; línea de solo lectura
    "Satisfacción del usuario"; badge de severidad en la tarjeta del tablero (mismo lugar
    que el badge de prioridad).
- **Por qué:** pedido explícito del usuario, con la aclaración de no tocar el resto del
  diseño/flujo — de ahí la decisión de reusar `assignedByName`/`authorName` en vez de
  agregar un campo redundante.
- **Verificación:** `node --check` sobre `Ticket.js`/`tickets.js`; `npx vite build` sin
  errores. Sin acceso a la base de datos real en este entorno, se verificó con `vite
  preview` + Playwright headless interceptando `GET /tickets/mine` (un ticket en proceso
  con agente/severidad/mensaje de un agente real, otro resuelto sin calificar) y
  `GET /tickets`/`GET /tickets/:id` del lado admin — se confirmó el panel de detalles,
  los nombres reales en las burbujas, el badge de severidad en la lista y el tablero, el
  select de Severidad y la encuesta CSAT completa con sus 5 opciones y colores.

### 2026-07-14 — Mercado Libre: roles fijos en vez de permisos genéricos (Solicitar Cuenta + PDF)
- **Qué pasó:** el usuario compartió la definición oficial de roles de Mercado Libre (KAM/
  Comercial, Atención al Cliente, Operación/Almacén, Business Intelligence, Crédito y
  Cobranza/Finanzas, Marketing/Contenido, Auditoría, Back Office) y pidió que, para esa
  plataforma específicamente, el formulario pida esos roles en vez de la lista genérica de
  permisos (Ventas/Publicaciones/Inventarios/Envío/Pagos/Facturas/Admin) que comparten las
  demás plataformas (Amazon, Walmart, etc.) — y que el PDF de la solicitud refleje lo mismo.
- **Qué cambió:**
  - `frontend/src/pages/SolicitarCuenta.jsx`: nueva constante `ML_ROLE_FIELDS` (los 8
    roles); cuando la plataforma marcada es "Mercado Libre" se muestra un checklist de
    roles (`togglePlatformRole`, campo `roles: []` nuevo por plataforma) en vez del
    checklist de permisos — las demás plataformas no cambian.
  - `backend/src/models/AccountRequest.js`: nuevo campo `roles: [String]` dentro de cada
    entrada de `platforms[]` (junto a `permissions`, sin tocarlo).
  - `backend/src/routes/accountRequests.js`: valida `roles` contra la lista fija
    (`ML_ROLE_KEYS`) antes de guardar, para que nadie mande claves arbitrarias llamando la
    ruta pública directo.
  - `backend/src/utils/accountRequestPdf.js`: la sección de plataformas del PDF muestra
    "ROLES" (con el checklist `[X]/[ ]` de los 8 roles) en vez de "PERMISOS" cuando la fila
    es Mercado Libre — el resto de plataformas se ve exactamente igual que antes.
  - `backend/src/routes/platformAccounts.js`: el "Rol o tipo de acceso" que se precarga al
    generar la Responsiva (una vez aprobada la cuenta) ahora también lee `roles` cuando la
    plataforma es Mercado Libre, en vez de solo derivarlo de `permissions`.
- **Por qué:** pedido explícito del usuario, con la tabla de roles de Mercado Libre como
  referencia.
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite build`
  sin errores. Se generó un PDF de prueba localmente (llamando `buildAccountRequestPdf`
  directo, sin necesidad de la base de datos) con una fila Mercado Libre (roles KAM + BI
  marcados) y una fila Amazon (permisos de siempre) — el PDF muestra "ROLES" con el
  checklist correcto en la primera y "PERMISOS" sin cambios en la segunda. También se
  verificó el formulario en vivo con Playwright: al marcar Mercado Libre aparece el
  checklist de roles; al marcar Amazon aparece el checklist de permisos de siempre.

### 2026-07-14 — Nuevo apartado "Mis Solicitudes" (Cuenta/Recurso/Ingreso)
- **Qué pasó:** el usuario ya tenía "Mis Tickets"; pidió lo mismo para las otras 3
  solicitudes que se llenan desde el wizard de Mesa de Ayuda (Solicitar Cuenta, Solicitar
  Recurso, Solicitar Ingreso) — ver en qué van (pendiente/aprobada/rechazada).
- **Problema encontrado:** ninguno de los 3 modelos (`AccountRequest`/`ResourceRequest`/
  `OnboardingRequest`) guardaba de forma confiable quién, logueado, llenó el formulario —
  `AccountRequest` solo valida el nombre contra un Employee real pero no lo guarda (y ese
  nombre es el beneficiario, no necesariamente quien solicita); `ResourceRequest.employeeRef`
  existe pero lo llena el autocompletado del formulario y el admin YA lo usa para
  auto-asignar el recurso al aprobar (`frontend/src/pages/ResourceRequests.jsx`) — no se
  podía reusar sin arriesgar romper esa asignación.
- **Qué cambió:**
  - Nuevo `backend/src/middleware/optionalEmployeeAuth.js` — decodifica el JWT de
    empleado si viene, pero nunca bloquea la petición (las 3 rutas `/public` se quedan
    públicas, ej. RH puede seguir llenando Solicitar Ingreso a nombre de alguien más).
  - Nuevo campo `submitterRef` (ObjectId → Employee) en los 3 modelos — separado de
    cualquier campo que ya usa el flujo de aprobación, se llena solo con quien esté
    logueado al enviar.
  - Nuevo `GET /account-requests/mine`, `GET /resource-requests/mine`,
    `GET /onboarding-requests/mine` (gated por `employeeAuth`, mismo patrón que
    `GET /tickets/mine`).
  - `SolicitarCuenta.jsx`/`SolicitarRecurso.jsx`/`SolicitarIngreso.jsx`: cambian de la
    instancia de `api` (admin) a `employeeApi`, así el JWT de empleado se manda solo si
    hay sesión — sin JWT, siguen funcionando igual de público que antes.
  - Nueva página `frontend/src/pages/MisSolicitudes.jsx` (ruta `/mis-solicitudes`,
    `EmployeeRoute`) — junta las 3 en una sola lista ordenada por fecha, mismo lenguaje
    visual (tabla + pills) que Mis Tickets/Mesa de Ayuda. Tercer ítem "Mis solicitudes" en
    el sidebar del portal (`components/PortalLayout.jsx`).
- **Por qué:** pedido explícito del usuario.
- **Verificación:** `node --check` sobre los archivos de backend tocados; `npx vite
  build` sin errores. Sin acceso a la base de datos real en este entorno, se verificó con
  `vite preview` + Playwright headless interceptando los 3 `GET .../mine` con una
  solicitud de cada tipo y estatus distinto — la lista combinada, los pills de color y el
  nuevo ítem de nav se ven correctos.

### 2026-07-14 — Mensajes de tickets "en vivo" (empleado ↔ Sistemas)
- **Qué pasó:** al conversar en un ticket (empleado en Mis Tickets, Sistemas en el
  admin), había que cerrar y volver a abrir para ver la respuesta de la otra parte.
- **Qué cambió:** mientras una conversación está abierta, ambos lados refrescan solos
  cada 5 segundos:
  - `backend/src/routes/tickets.js`: nuevo `GET /tickets/:id` (admin) — ticket individual
    con sus mismos populates (`assetRefs`/`assignedTo`/`appRef`), para no tener que volver
    a pedir el tablero completo en cada refresco.
  - `frontend/src/pages/Tickets.jsx` (`DetailModal`): `setInterval` cada 5s mientras el
    modal está abierto, llama al nuevo endpoint y actualiza `liveMessages`.
  - `frontend/src/pages/MisTickets.jsx`: mismo patrón del lado del empleado, pero
    reaprovechando `GET /tickets/mine` (ya trae los mensajes embebidos) — solo cuando hay
    una ventana de conversación abierta (`selectedId`).
- **Por qué se eligió polling y no WebSockets:** pedido explícito del usuario tras
  comparar ambas opciones — WebSockets da instantaneidad real pero el backend vive en
  Render free tier (se duerme por inactividad), lo que hace poco confiables las
  conexiones largas ahí; polling cada 5s no necesita infraestructura nueva y ya resuelve
  el problema real (ver mensajes sin cerrar/reabrir).
- **Verificación:** `npx vite build` sin errores; `node --check` sobre el backend
  modificado. Sin acceso a la base de datos real en este entorno, se verificó con `vite
  preview` + Playwright headless interceptando las respuestas de la API en ambos lados
  (empleado y admin): un mensaje "nuevo" simulado en la segunda respuesta del servidor
  aparece solo en pantalla ~5-10s después, sin ninguna interacción del usuario.

### 2026-07-14 — Quitar botón "Reportar un problema nuevo" duplicado + Reportar Ticket ya no se ve como ventana aparte
- **Qué cambió:**
  - Se quitó el botón "+ Reportar un problema nuevo" del panel de tickets en el dashboard
    de Mesa de Ayuda y de la parte de arriba de Mis Tickets — quedaba duplicado con la
    tarjeta "Tengo un problema o algo no funciona" del wizard, que ya lleva al mismo lado.
  - `ReportarTicket.jsx` usaba `.card`/`.header` de `SolicitarCuenta.module.css` (la misma
    tarjeta centrada con sombra que usan los formularios públicos sin sidebar), lo que la
    hacía sentir como una ventana flotante aparte del resto del portal. Ahora usa un
    cascarón propio (`ReportarTicket.module.css`: `.mainHead` + `.panel`, mismo patrón
    plano sin sombra que Mesa de Ayuda/Mis Tickets) — el título vive afuera como
    encabezado de página y el formulario en un panel plano, igual que las otras dos.
- **Por qué:** pedido explícito del usuario — ya no usa esos botones porque el wizard
  cubre lo mismo, y quería que Reportar Ticket combinara visualmente con el resto.
- **Verificación:** `npx vite build` sin errores. Capturas con `vite preview` + Playwright
  headless de las 3 pantallas (dashboard, Mis Tickets, Reportar un problema) confirmando
  que ya no aparece el botón duplicado y que Reportar Ticket luce igual de "plano" que las
  otras dos.

### 2026-07-14 — Fix: encabezado/✕/composer de la ventana flotante se escondían al scrollear
- **Qué pasó:** en la ventana flotante de la conversación (ver entrada anterior), todo el
  contenido — encabezado del ticket, burbujas y composer — vivía dentro del mismo
  contenedor con scroll, así que al scrollear la conversación el folio/título/estatus y el
  botón de cerrar (✕) se iban con el scroll, igual que el cuadro para responder.
- **Qué cambió:** el encabezado del ticket y el composer ahora son `position: sticky`
  (arriba y abajo respectivamente) dentro de una franja interna con su propio scroll
  (`.modalScroll`) — solo las burbujas se desplazan; encabezado, ✕ y composer se quedan
  fijos siempre visibles. (Nota técnica: el padding vertical del contenedor se movió al
  header/composer sticky en vez de quedarse en el contenedor — dejarlo en el contenedor
  abría una rendija por la que se asomaba una burbuja al hacer scroll.)
- **Por qué:** pedido explícito del usuario tras probar la ventana flotante.
- **Verificación:** `npx vite build` sin errores. Verificado con `vite preview` +
  Playwright headless con una conversación de 14 mensajes de prueba — capturas antes y
  después de scrollear al fondo confirman que encabezado/✕/composer no se mueven y no hay
  burbujas asomándose por detrás.

### 2026-07-14 — Mis Tickets: lista + ventana flotante para la conversación
- **Qué cambió:** `MisTickets.jsx` mostraba cada ticket como una tarjeta de conversación
  completa apilada una tras otra. Ahora muestra una lista/tabla (folio, tipo + asunto,
  pill de estatus, fecha — mismo lenguaje visual que el panel de tickets de Mesa de
  Ayuda) y, al hacer clic en un renglón, la conversación completa (`TicketThread`: reporte
  inicial, mensajes de ida y vuelta, resolución, composer para responder) se abre en una
  ventana flotante (overlay + modal) sobre la lista, con botón de cerrar.
- **Por qué:** pedido explícito del usuario tras ver el rediseño del portal.
- **Verificación:** `npx vite build` sin errores. Verificado con `vite preview` +
  Playwright headless interceptando `GET /tickets/mine` con tickets de prueba (sin acceso
  a la DB real en este entorno) — se confirmó la lista con los 3 estatus (abierto/en
  proceso/resuelto) y la apertura de la ventana flotante con la conversación al hacer clic.

### 2026-07-14 — Rediseño visual del portal de empleado (Mesa de Ayuda → Mis Tickets)
- **Qué pasó:** el usuario compartió un mockup (`mesa_de_ayuda_v2.html`) con un look oscuro
  tipo "app premium" — sidebar con logo/nav/usuario, dashboard "¿Qué necesitas?" con 4
  tarjetas, panel de tickets con tabla y pills de estatus — y pidió que todo el flujo de
  empleado (desde el login hasta los tickets) adoptara esa identidad visual. Aclaró que no
  debía verse como la tarjeta centrada/flotante del mockup, sino a pantalla completa, igual
  que el sidebar del panel admin (`components/Layout.jsx`).
- **Qué cambió:**
  - Nuevo `components/PortalLayout.jsx`/`.module.css`: sidebar fijo a pantalla completa
    (logo "Mesa Ayuda", nav Solicitudes/Mis tickets con ruta activa, bloque de usuario con
    iniciales + cerrar sesión), calcado del patrón full-viewport de `Layout.jsx` pero con
    el look oscuro del mockup.
  - Nuevo `styles/portal-theme.css` (importado una vez en `main.jsx`): paleta oscura fija
    del portal bajo la clase `.portalDark`, aislada del `:root` para no tocar el modo
    claro/oscuro conmutable del panel admin. Reusa el naranja de marca ya existente
    (`#E8431A`) en vez del de mockup, para que se sienta parte del mismo producto. Se
    agregó Manrope + IBM Plex Mono a `index.html` (junto a Inter, que ya estaba).
  - `MesaDeAyuda.jsx`: el dashboard ya logueado ahora vive dentro de `PortalLayout` y
    reconstruye la vista raíz igual al mockup — encabezado "¿Qué necesitas?", 4 tarjetas
    con íconos SVG de línea (antes emoji), y el panel "Sistema de tickets" con tabla +
    pills conectado a los mismos datos de siempre (`GET /tickets/mine`). El wizard de
    sub-pasos (acceso/recurso/tipo de ticket) sigue funcionando igual, solo restilizado.
  - `MisTickets.jsx` y `ReportarTicket.jsx`: envueltos en `PortalLayout` (se quitó su
    propia barra superior de saludo/logout, ya la resuelve el sidebar); conversación con
    burbujas y formulario restilizados con los mismos tokens.
  - `SolicitarCuenta.module.css` (compartido por Solicitar Cuenta/Ingreso/Recurso,
    Confirmar Envío, Login de empleado) y `EmployeeLoginWidget.module.css`: reescritos con
    la paleta oscura fija — quedan como tarjetas independientes (sin sidebar, siguen
    públicos/sin guard, ej. Alta de Ingreso lo usa RH para gente que aún no es empleada).
- **Por qué:** pedido explícito del usuario, con mockup de referencia adjunto.
- **Verificación:** `npx vite build` sin errores. Sin acceso a red/DB real en este entorno,
  se verificó visualmente con `vite preview` + Playwright headless (sesión de empleado
  simulada en `localStorage`, ya que no hay backend disponible aquí): capturas del login,
  el dashboard con sidebar y las 4 tarjetas, Mis Tickets, Reportar Ticket y Solicitar
  Ingreso — todas con buen contraste y layout a pantalla completa como se pidió.

### 2026-07-14 — Fix: dropdown de búsqueda de activo/solicitante en "Nueva salida de equipo" sin estilos
- **Qué pasó:** tras la auditoría general de contraste en modo oscuro (ver entrada siguiente), se pidió revisar puntualmente dropdowns personalizados (no `<select>` nativos) por si quedó alguno fuera. Se encontró uno real en `CreateShipmentModal.jsx` (modal de Asignaciones para registrar una salida de equipo): el buscador de "activo existente" dentro de cada renglón de equipo y el buscador de "solicitante" usaban las clases `styles.nameDropdown`/`styles.nameOption`/`styles.hint`, pero el componente importa sus estilos de `AccountRequests.module.css`, archivo que nunca definió esas clases (existen en `SolicitarCuenta.module.css`, un archivo distinto). Las clases resolvían a `undefined`, así que ambos dropdowns se renderizaban sin `position: absolute`, sin fondo ni color propio — no solo se veían mal en modo oscuro, no tenían estilo en ningún tema.
- **Qué cambió:** se reemplazaron esas referencias por las clases equivalentes que sí existen y ya tienen su par claro/oscuro correcto en `AccountRequests.module.css`: `.empDropdown`/`.empOption` (mismo patrón usado en el resto del archivo) y `.matchedTag` para el texto de confirmación "vinculado a un activo existente".
- **Por qué:** pedido explícito de continuar la revisión de modo oscuro con foco en listas desplegables, tras confirmar que los `<select>` nativos ya estaban cubiertos casi en su totalidad.
- **Commit(s):** ver `git log` (push inmediato tras el fix).
- **Verificación:** `npx vite build` sin errores; se descartaron como falsos positivos el resto de dropdowns de la app (Solicitar Cuenta/Ingreso/Recurso, Confirmar Envío, Stock, NetworkLayoutDetail, Accessories, Layout) — todos ya tenían su override de modo oscuro correcto.

### 2026-07-14 — Auditoría y corrección de contraste en modo oscuro en toda la app
- **Qué pasó:** el usuario reportó (con capturas) el detalle de un ticket en modo oscuro donde los labels ("Asunto", "Descripción", "Evidencia", "Conversación") y el texto de las burbujas de la conversación eran casi invisibles — texto oscuro sobre fondo oscuro. Se corrigió ese caso puntual y, a petición explícita, se auditó el resto de la aplicación por el mismo tipo de bug: un color de texto pensado para fondo claro que el bloque `@media (prefers-color-scheme: dark)` de ese archivo nunca sobrescribe, aunque el fondo detrás sí se oscureció.
- **Causa raíz típica:** casi todos los módulos de la app declaran su propio bloque de modo oscuro por archivo — cuando se agregaba un elemento nuevo (o una burbuja de chat con estilos en línea) sin acordarse de tocar ese bloque, el fondo se oscurecía pero el texto se quedaba con su color original oscuro.
- **Corregido (13 archivos):**
  - `Tickets.module.css`/`.jsx`: labels y texto del detalle (`.field label`/`.field p`/`.modalHint`), inputs/selects del modal, y las burbujas de conversación (ahora con clases propias `.bubbleText`/`.bubbleMine`/`.bubbleTheirs` en vez de estilos en línea sin color).
  - `AccountRequests.module.css` y `Page.module.css` (compartidos por Empleados/Solicitudes/Asignaciones): pestañas (`.tab`) y botón de cerrar del modal al pasar el mouse.
  - `Assets.module.css`: checkbox de asignación, botón de quitar selección, botón de editar duplicado.
  - `EmployeeDetail.module.css`: la tarjeta de activo seleccionada fuerza un fondo claro en ambos temas — el nombre de marca/modelo se quedaba en blanco sobre ese fondo claro en modo oscuro.
  - `NetworkLayoutDetail.module.css` y `NetworkLayouts.module.css`: leyenda del plano, texto monoespaciado, botón de cerrar.
  - `GmailAccounts.module.css`, `PlatformAccounts(Erp).module.css`, `ImportModal.module.css`: avisos ámbar/naranja (contraseña pendiente, tipo por defecto, alertas de importación) — el fondo del aviso se oscurecía pero el texto de advertencia no.
  - `SolicitarCuenta.module.css` (compartido por Solicitar Cuenta/Ingreso/Recurso, Reportar Ticket, Confirmar Envío, Mesa de Ayuda): checkboxes, bloque de texto legal, tarjetas de folio, fila de aceptación, texto de éxito.
  - `Assignments.jsx`/`Stock.jsx`/`ConfirmarEnvio.jsx`: colores de texto en línea sin variante oscura (chip de no. de empleado, columnas "Puesto"/"Notas"/"Detalle", botón "✕ Ver todas", bloque "Qué se está enviando") — se convirtieron a clases CSS con su propio par claro/oscuro.
  - **2 regresiones encontradas y revertidas:** `Stock.module.css` (`.numDispZero`) y `MesaDeAyuda.module.css` (`.dividerText`) tenían un override de modo oscuro que en realidad oscurecía más el texto en vez de aclararlo — quedaban peor que si no hubiera override.
- **Por qué:** pedido explícito del usuario tras ver el bug — "revisa toda la app y corrige esos detalles, porque no se ve".
- **Verificación:** `npx vite build` sin errores. Se usó un agente de exploración para mapear cada archivo `.module.css` con bloque dark contra los colores de texto oscuro definidos fuera de ese bloque, y para buscar estilos en línea con fondo claro fijo sin `color` explícito — se descartaron los falsos positivos (badges con su propio par fondo+color ya autoconsistente en ambos temas, ej. `.statusBadge`, y el sidebar, que es oscuro a propósito en ambos temas). Se probó en Chromium real con tema oscuro forzado: el detalle de un ticket real con conversación (antes ilegible, ver capturas del reporte), la tabla de Asignaciones, el filtro de Disponibilidad, y el formulario de Solicitar Cuenta — todos con buen contraste ahora. Sin datos de prueba que limpiar (todas las verificaciones fueron de solo lectura contra datos reales).

### 2026-07-14 — Mesa de Ayuda ahora exige login para entrar (no solo para Tickets) + pantalla de bienvenida rediseñada
- **Qué cambió:** la entrega anterior (mismo día) dejaba ver el wizard completo sin sesión y solo pedía login al llegar a Tickets. El usuario probó eso y no le gustó — pidió que **toda la Mesa de Ayuda** requiera sesión desde la entrada. Ahora:
  - **Sin sesión:** solo se ve una pantalla de bienvenida dedicada — logo, una vitrina de 3 iconos de lo que hay adentro (Cuentas y accesos / Equipo y recursos / Tickets) y el formulario de login/activación. Nada del wizard ni de las opciones se muestra hasta iniciar sesión.
  - **Con sesión:** la pantalla se transforma en un home real — encabezado con saludo y "Cerrar sesión" siempre visibles arriba, dos **pills de navegación rápida** ("🧭 Solicitudes" / "🎫 Mis tickets") que bajan directo a cada sección, el wizard de siempre, y la sección de tickets (vista previa + reportar nuevo + ver todos).
  - Como ya no hay forma de llegar al wizard sin sesión, se quitó toda la lógica de "recordar a dónde iba" (`pendingPath`) que se había agregado en la entrega anterior — ya no hace falta, la sesión existe desde antes de ver cualquier opción.
- **Qué NO cambió:** Solicitar Cuenta/Ingreso/Recurso siguen siendo anónimas por su URL directa (`/solicitar-cuenta`, etc.) — el usuario confirmó explícitamente que el login solo debía exigirse para entrar a la Mesa de Ayuda en sí, no para esas páginas (ej. RH sigue pudiendo dar de alta a alguien que ni siquiera existe como empleado todavía). `/empleado/login` se conserva igual, como respaldo para quien llega directo a `/reportar-ticket`/`/mis-tickets` sin pasar por Mesa de Ayuda.
- **Por qué:** feedback directo del usuario tras ver la versión anterior — "no me gustó", quería el login obligatorio desde la entrada y que se viera mejor, con navegación.
- **Verificación:** en Chromium real — sin sesión, `/mesa-de-ayuda` no muestra ningún rastro del wizard (confirmado por ausencia del texto "¿Qué necesitas?" en el DOM); activarse ahí mismo aterriza en la misma pantalla ya completa, sin redirigir a ninguna otra URL; las pills de navegación bajan a la sección correspondiente; recargar la página mantiene la sesión; elegir un tipo de ticket desde el wizard con sesión ya activa navega directo a `/reportar-ticket` con el tipo preseleccionado (sin el rodeo de antes); "Cerrar sesión" limpia el token y regresa a la pantalla de bienvenida. Probado en tema claro y oscuro. El empleado real usado para la prueba (activación vía el flujo) se restableció a su estado original al terminar, y la entrada de auditoría que generó ese restablecimiento se borró por ID puntual.

### 2026-07-14 — Mesa de Ayuda se vuelve la pantalla principal del empleado: login inline + vista previa de sus tickets
- **Qué cambió:** el login del portal (antes solo en `/empleado/login`, a donde se redirigía a quien intentaba entrar sin sesión) ahora vive **dentro de la propia Mesa de Ayuda** — nadie tiene que salir de la pantalla para iniciar sesión o activarse. El recuadro de "Sistema de Tickets" cambia según haya sesión o no:
  - **Sin sesión:** el mismo widget de correo/no. de empleado + contraseña (o crear una, primera vez) aparece ahí mismo, en vez de un botón que llevaba a otra página.
  - **Con sesión:** el recuadro se convierte en un mini-resumen — "Hola, {nombre}" con "Cerrar sesión", una **vista previa de hasta 3 tickets recientes** (folio, asunto, estatus con color) que llevan a "Mis Tickets" al hacer clic, botón "+ Reportar un problema nuevo" y link "Ver todos mis tickets →". Así la Mesa de Ayuda funciona como panorama completo de lo que la plataforma le ofrece a esa persona, no solo un menú de botones.
  - El wizard ("Tengo un problema o algo no funciona") sigue llevando a las mismas 5 sub-preguntas de tipo de ticket, pero si la persona no tiene sesión al elegir una, la elección se recuerda (`pendingPath`) y la pantalla baja sola al recuadro de login — en cuanto inicia sesión ahí mismo, se le manda directo al formulario con el tipo ya preseleccionado, sin perder lo que había elegido.
- **Qué NO cambió:** Solicitar Cuenta/Ingreso/Recurso siguen siendo anónimos, sin login — solo Tickets lo requiere, como ya había quedado. `/empleado/login` se conserva como respaldo para quien llega directo a `/reportar-ticket` o `/mis-tickets` sin pasar por Mesa de Ayuda (ej. un link viejo compartido) — sigue funcionando igual, con el mismo `?next=`.
- **Detalle técnico:** se extrajo la lógica de login/activación a un componente compartido (`frontend/src/components/EmployeeLoginWidget.jsx`, sin navegación propia — recibe `onSuccess`) que usan tanto `EmployeeLogin.jsx` (página completa, para el respaldo) como `MesaDeAyuda.jsx` (embebido, sin duplicar código).
- **Por qué:** pedido explícito del usuario — que el login sea desde la Mesa de Ayuda y que esa pantalla sea la principal, donde el empleado ve de un vistazo todo lo que la plataforma le ofrece (no solo un formulario de reporte).
- **Verificación:** contra el backend real (empleado real activado por el flujo, restaurado a su estado original al terminar) — se probó en Chromium real de punta a punta: elegir "Tengo un problema" → "Software" sin sesión muestra el aviso "Inicia sesión para continuar con tu reporte" en el mismo recuadro; activarse ahí mismo (sin navegar a ninguna otra URL) aterriza directo en `/reportar-ticket?tipo=software` con el radio ya marcado; con sesión, el recuadro muestra los tickets reales de prueba con su estatus; "Cerrar sesión" limpia el token y regresa al widget de login. Se confirmó también que `/empleado/login` sigue funcionando como respaldo y que `/reportar-ticket` sin sesión sigue redirigiendo ahí con `?next=`. Probado en tema claro y oscuro. Los 2 tickets de prueba y las 3 entradas de auditoría se borraron al terminar.

### 2026-07-14 — Medir Tickets por urgencia (prioridad conectada — antes existía en el modelo pero no se usaba en ningún lado)
- **Qué se encontró:** `Ticket.priority` (baja/media/alta) existía en el modelo desde que se construyó el módulo, con un comentario explícito de que "la fija Sistemas al triage" — pero no había ninguna ruta que la cambiara ni ningún lugar de la interfaz que la mostrara o dejara elegirla. Era un campo muerto.
- **Qué se conectó:**
  - **Fijar la prioridad:** en el detalle de un ticket (`/tickets`), nuevo selector **"Prioridad"** (🔴 Alta / 🟡 Media / 🟢 Baja) visible sin importar el estatus, se guarda al cambiarlo sin pasos adicionales.
  - **Verla de un vistazo:** la tarjeta del tablero muestra un punto de color cuando la prioridad no es la media/default (🔴 o 🟢); el detalle también la resalta con el mismo color.
  - **Ordenar por lo urgente, no solo lo nuevo:** cada columna del tablero (Abierto/En proceso/Resuelto/Cerrado) ahora ordena primero por prioridad (alta arriba) y, dentro de la misma prioridad, por lo más reciente — antes solo ordenaba por fecha, así que un ticket urgente podía quedar enterrado debajo de varios triviales más nuevos.
  - **Medirla:** nueva tarjeta KPI "🔴 Urgentes" (prioridad alta entre los activos) en la fila de arriba, y nuevo panel "Por urgencia (activos)" (mismo estilo de barras que "Por tipo de soporte") con el desglose Alta/Media/Baja. En el Dashboard, la tarjeta de Tickets ganó una tercera estadística "🔴 Prioridad alta" junto a "Le impiden trabajar".
- **Por qué:** pedido explícito de la lista de Finanzas — "medir tickets también por urgencia (para KPIs)". El campo ya existía pero nadie podía usarlo ni verlo.
- **Verificación:** contra el backend real — se crearon 3 tickets de prueba, se les fijó prioridad baja/media/alta (`PUT /tickets/:id/priority`), se confirmó que una prioridad inválida se rechaza y que la ruta pide sesión de admin (401 sin token), y que `GET /tickets` devuelve el orden esperado (alta, media, baja) dentro del mismo estatus. Se probó en Chromium real: el tablero muestra los 3 tickets ordenados correctamente con sus puntos de color, el KPI y el panel reflejan los conteos, y cambiar la prioridad de un ticket desde el detalle (sin cerrar el modal) actualiza al instante el badge de la tarjeta, su posición en la columna, el KPI y el panel de fondo. Los 3 tickets de prueba y las 7 entradas de auditoría que generó la prueba se borraron al terminar; el empleado real usado para probar (activación vía el portal) se regresó a su estado original.

### 2026-07-14 — Mis Tickets: conversación real de ida y vuelta (no solo visual)
- **Qué cambió:** la entrega anterior (mismo día) solo pintaba el reporte inicial + la resolución formal como si fuera un chat, pero era de un solo sentido. Ahora es una conversación real:
  - **El empleado** puede escribir un mensaje de seguimiento en cualquier momento desde `/mis-tickets` (campo de texto + "Enviar" debajo del hilo) — ej. "sigue sin funcionar" o responder algo que Sistemas preguntó.
  - **Sistemas** puede responder desde el detalle del ticket en `/tickets` (nuevo campo "Responder") **sin tener que marcar el ticket como resuelto** — para poder preguntar algo o dar un avance antes de llegar a una resolución formal.
  - **Un mensaje nuevo del empleado sobre un ticket ya "Resuelto" lo reabre solo** (pasa a "Abierto" y limpia la resolución anterior, mismo criterio que ya usaba el "Reabrir" manual) — si el problema regresó, no hace falta levantar un ticket nuevo. Sobre un ticket "Cerrado" ya no se puede escribir (se le pide reportar uno nuevo).
  - La primera respuesta de Sistemas en un ticket "Abierto" lo pasa solo a "En proceso" (mismo criterio que ya aplicaba "Asignar").
- **Backend:** `Ticket.messages` (nuevo, arreglo embebido `{ from: 'employee'|'admin', authorName, text, createdAt }`) — la resolución formal (`resolution`/`resolutionNotes`, con su catálogo) sigue siendo un campo aparte, no se tocó. Nuevas rutas: `POST /tickets/:id/messages` (empleado, valida que el ticket sea suyo, bloquea si está cerrado, reabre si estaba resuelto, avisa a Telegram) y `POST /tickets/:id/reply` (admin, pasa de abierto a en_proceso).
- **Frontend:** `MisTickets.jsx` ahora intercala `ticket.messages` entre el reporte inicial y la resolución (si la hay), con su propio campo de texto. `Tickets.jsx` (admin) muestra el mismo hilo dentro del detalle y un campo "Responder" — se actualiza el hilo al instante sin cerrar el modal (para no cortar la conversación a media respuesta), y de fondo se refresca el tablero por si el estatus cambió. Nuevo badge 💬 con el conteo de mensajes en la tarjeta del tablero.
- **Por qué:** pedido explícito del usuario tras la primera versión — quería poder ir y venir con Sistemas, no solo ver un historial de una sola vía.
- **Verificación:** contra el backend real (empleado real activado por API, restaurado a su estado original al terminar) — se armó una conversación completa (empleado → admin → empleado), confirmando que el estatus pasó de abierto a en_proceso solo con la primera respuesta de Sistemas; se resolvió el ticket y se confirmó que un mensaje nuevo del empleado lo reabrió solo (resolución limpiada); se confirmó que un ticket "cerrado" rechaza mensajes nuevos del empleado con el aviso correcto; se confirmó 401 sin sesión. Se probó en Chromium real de punta a punta en ambos lados: el empleado mandó un mensaje desde `/mis-tickets` y lo vio aparecer en su hilo, y Sistemas respondió desde el detalle en `/tickets` sin que el modal se cerrara, viendo su propia respuesta reflejada de inmediato. Ticket de prueba eliminado y las 7 entradas de auditoría que generó la prueba borradas por ID puntual al terminar — no quedó residuo.

### 2026-07-14 — Reportar Tickets ahora requiere login de empleado; nuevo portal "Mis Tickets" con historial tipo conversación
- **Qué cambió (lo grande):** reportar un ticket dejó de ser anónimo — ahora requiere haber iniciado sesión como empleado. Nuevo portal, separado por completo del login de Sistemas:
  - **`/empleado/login`** (público): un solo flujo para login y activación — se escribe correo corporativo o no. de empleado; si la cuenta nunca se ha activado, pide crear una contraseña (mínimo 6 caracteres); si ya existe, pide la contraseña para entrar. **Nadie de Sistemas da de alta estas cuentas a mano** — cualquier empleado activo se activa solo la primera vez, ya que la cuenta "existe" desde que existe su registro de Employee.
  - **`/reportar-ticket`** (ahora protegida): ya no pide ni busca el nombre — la identidad viene de la sesión ("Reportando como **{nombre}**"), así que no puede fallar el emparejamiento por nombre como antes.
  - **`/mis-tickets`** (nueva, protegida): el historial del empleado pintado **como una conversación** — cada ticket es una tarjeta con folio/tipo/estado/app ligada, una burbuja con lo que reportó (izquierda) y, si Sistemas ya lo resolvió, una burbuja con la resolución (derecha) con su fecha; si no, un aviso de "todavía sin respuesta". Es una vista nueva sobre los mismos campos que el ticket ya tenía (`subject`/`description`/`resolution`/`resolutionNotes`) — **sin modelo de mensajes nuevo**, primera versión a propósito solo visual (no se puede responder de vuelta todavía).
  - Quien llega sin sesión a `/reportar-ticket` o `/mis-tickets` (ej. desde el wizard de Mesa de Ayuda o el botón directo de Tickets) se manda a `/empleado/login?next=...` y, al entrar, regresa exactamente a donde iba — si venía con `?tipo=software` desde el wizard, ese tipo sigue preseleccionado después de iniciar sesión.
- **Backend:** `Employee` ganó `password`/`passwordSetAt` (null hasta que el empleado se activa). Nuevo middleware `employeeAuth.js` (JWT separado, payload `{ employeeRef, name, type: 'employee' }`, 30 días — sesión de baja fricción, no la administrativa) y `routes/employeeAuth.js` (`POST /lookup`, `/activate`, `/login`, con límite por IP). `POST /tickets/public` (anónimo) se **retiró por completo** — se reemplazó por `POST /tickets/mine` y `GET /tickets/mine` (ambos con `employeeAuth`), donde la identidad y el activo(s) asignado(s) se resuelven del lado del servidor a partir del `employeeRef` real de la sesión, no de lo que mande el formulario.
- **Fix de seguridad de paso (no relacionado con el pedido, encontrado al agregar los campos nuevos):** `GET /employees`, `GET /employees/:id` y la respuesta de `PUT /employees/:id` excluían campos pero no estaban preparados para uno sensible — se les agregó `.select('-password')`/limpieza explícita para que el hash de la contraseña del portal nunca viaje al frontend; y `POST /employees`/`PUT /employees/:id` ahora descartan explícitamente `password`/`passwordSetAt` si vinieran en el body, para que una edición general de ficha nunca pueda pisar por accidente la contraseña del portal.
- **Recuperación sin correo:** el sistema no manda correos (solo avisos a Telegram), así que si un empleado olvida su contraseña no hay "recuperar por correo". En **Empleados**, cualquier fila que ya se activó muestra un botón **"🔑 Restablecer Tickets"** — limpia su contraseña para que pueda volver a activarse desde cero. Nuevo `PUT /employees/:id/reset-portal-access`.
- **Por qué:** pedido explícito del usuario — quería que el histórico de tickets tuviera dueño real (login) y que el empleado pudiera ver la conversación que ha tenido con Sistemas, no solo reportar y desaparecer.
- **Verificación:** contra el backend real (JWT de admin firmado localmente) — se usó un empleado real que nunca había activado su cuenta: lookup por no. de empleado y por correo (con mayúsculas distintas) antes de activarse, activación con contraseña corta rechazada, activación real, segundo intento de activar rechazado ("ya tiene contraseña"), login con contraseña incorrecta rechazado, login correcto, `POST /tickets/mine` creó el ticket con `employeeRef`/activos asignados resueltos del lado servidor y `appRef` ligado a una app real del catálogo, visible correctamente en `GET /tickets` (admin, con responsable poblado) y en `GET /tickets/mine`. Se confirmó que `POST /tickets/public` ya no acepta solicitudes anónimas. Se probó en Chromium real de punta a punta: entrar sin sesión a `/reportar-ticket?tipo=software` reenvía a login preservando el destino, tras iniciar sesión aterriza de vuelta con "Software" ya marcado, se reportó y resolvió un ticket, y `/mis-tickets` mostró la conversación completa (burbujas, badges, fechas) en tema claro y oscuro; cerrar sesión bloquea `/mis-tickets` de nuevo. Se probó el botón admin de restablecer acceso. Al terminar: ticket de prueba eliminado, el empleado real usado para la prueba se regresó a su estado original (`password: null`, nunca activado) con el mismo botón de restablecer, y las 3 entradas de auditoría que generó la prueba se borraron por ID puntual — no quedó ningún residuo ni se tocó ningún dato real de nadie más.

### 2026-07-13 — Conectar el catálogo de Aplicaciones Internas con Tickets
- **Qué cambió:** un ticket de tipo **Software** ahora puede ligarse a una aplicación específica del catálogo (ver entrada anterior) — en `/reportar-ticket`, al elegir "Software" aparece un selector opcional **"¿Es sobre alguna aplicación en particular?"** con las aplicaciones activas del catálogo (solo si hay al menos una). En la vista de Tickets (admin), el detalle del ticket muestra **"🗂️ Aplicación: {nombre} — enrutar a {responsable}"** cuando aplica, y la tarjeta del tablero lleva un badge 🗂️ — así Sistemas ve de inmediato si el ticket es, por ejemplo, de "Cuentas por Pagar" y a quién le toca (ej. Héctor, no Sistemas), sin abrir el detalle.
- **Backend:** `Ticket.appRef` (nuevo, `ObjectId` opcional → `InternalApp`). Nuevo `GET /api/internal-apps/public` (sin JWT, solo aplicaciones `active`, únicamente `name`/`description` — el responsable y la documentación no le sirven a quien reporta, solo a Sistemas). `POST /tickets/public` acepta `appRef` opcional y lo revalida contra la base (existe + está activa) antes de guardarlo — igual que `employeeRef`, ya que la ruta pública no lleva JWT y el valor podría venir manipulado; si no es válido, se guarda el ticket igual sin ese dato, nunca se rechaza el reporte por esto. `GET /tickets` (admin) ahora puebla `appRef` con `name`/`responsibleName`/`responsibleArea`. El aviso de Telegram al reportarse un ticket nuevo también incluye el nombre de la app cuando aplica.
- **Por qué:** completa el pedido del director de Finanzas — el catálogo por sí solo (entrada anterior) ya documentaba responsables, pero faltaba la pieza que de verdad resuelve "a dónde enruto esto": poder ligar el ticket concreto a la app concreta.
- **Verificación:** contra el backend real (JWT firmado para un admin real) — se creó una aplicación de prueba, se confirmó que `GET /internal-apps/public` la expone sin responsable/documentación, se reportó un ticket público con `appRef` válido y se confirmó que `GET /tickets` lo devuelve con la app poblada (nombre + responsable); se probó también con un `appRef` inventado (24 hex chars pero inexistente) y se confirmó que el ticket se crea igual, sin ese campo. Se probó de punta a punta en un Chromium real: reportar un ticket eligiendo "Software" → aparece el selector con las 2 aplicaciones reales ya registradas ("Cuentas por pagar", "ERP") → se envía → en Tickets (admin) aparece el badge 🗂️ en la tarjeta y el detalle muestra "Aplicación: Cuentas por pagar — enrutar a [responsable real ya registrado]". Ticket, aplicación y las 4 entradas de auditoría de prueba se borraron por ID puntual al terminar — no se tocó ningún dato real (las 2 aplicaciones reales y los 2 tickets reales existentes quedaron intactos).

### 2026-07-13 — Catálogo de Aplicaciones Internas (nuevo módulo admin, para saber a dónde enrutar un ticket de aplicativo)
- **Qué se agregó:** nuevo módulo admin-only **"Aplicaciones Internas"** (`/internal-apps`, enlace en el sidebar dentro de "Administración") — catálogo de aplicativos internos (ej. "Cuentas por Pagar", "Aplicativo de Ventas") con nombre, descripción, **responsable** (nombre + área/departamento en texto libre, ej. "Héctor Ramírez — Costos y SKU") y notas. Cada aplicación puede tener un **documento** (PDF/DOC/DOCX) subido y guardado en Mongo como buffer — mismo criterio que Responsivas/Planos de Red, ya que Render no persiste el filesystem entre despliegues. Tabla con botones para subir/ver/reemplazar/quitar el documento, editar y eliminar la aplicación.
- **Backend:** modelo `InternalApp` (`backend/src/models/InternalApp.js`) + rutas `backend/src/routes/internalApps.js` (`GET/POST /`, `GET/PUT/DELETE /:id`, `POST /:id/document` con `multer` en memoria limitado a PDF/DOC/DOCX de hasta 20MB, `GET /:id/document` para descargar, `DELETE /:id/document` para quitar solo el archivo) — todas protegidas con `auth`+`adminOnly`. Se agregó `'aplicacion_interna'` al enum `entity` de `AuditLog` y se registran `crear`/`editar`/`eliminar` en cada acción.
- **Por qué:** pedido del director de Finanzas (ver nota de proyecto) — que Sistemas tenga un inventario/catálogo de aplicaciones internas con documentación, para saber hacia dónde enrutar un ticket cuando es sobre un sistema específico (ej. que un ticket de "cuentas por pagar" se sepa que es de Héctor, no de Sistemas). Se decidió con el usuario dejar esta primera entrega como **solo el catálogo** — todavía no se liga desde Reportar Ticket ni se muestra en la vista de Tickets; esa conexión queda pendiente para una siguiente sesión.
- **Verificación:** backend corrido localmente contra la base real (JWT firmado para un admin real, sin atajos de código) — se creó una aplicación de prueba, se subió un PDF y se confirmó que la descarga es idéntica byte a byte, se confirmó que un archivo `.txt` se rechaza con el mensaje esperado, se probó editar, quitar solo el documento, eliminar la aplicación, y que sin token la ruta responde 401. Se confirmaron las 5 entradas de auditoría generadas (crear/subir doc/editar/quitar doc/eliminar) y se borraron por ID puntual al terminar, sin dejar residuo. Se probó también el flujo completo en un Chromium real (crear → subir documento → editar → eliminar, con el enlace del sidebar navegando correctamente) sin errores de consola. `npx vite build` sin errores.

### 2026-07-13 — Mesa de Ayuda: "tengo un problema técnico" se integra al wizard (ya no solo acceso directo)
- **Qué cambió:** la pregunta raíz del wizard (`frontend/src/pages/MesaDeAyuda.jsx`) ganó una 4ª opción, **"Tengo un problema o algo no funciona"**, con su propia sub-pregunta "¿de qué tipo es el problema?" — los mismos 5 tipos que ya usa `ReportarTicket.jsx` (Hardware/Software/Red-Conectividad/Cuenta-Acceso/Otro), cada uno navegando a `/reportar-ticket?tipo=...` con el radio correspondiente ya preseleccionado (mismo mecanismo que las otras ramas). La etiqueta de la pregunta raíz pasó de "Solicitudes" a **"¿Qué necesitas?"**, ya que ahora mezcla solicitudes con reportar un problema.
- **El acceso directo a Tickets se queda, pero con el texto aclarado:** el recuadro aparte de "Sistema de Tickets" (siempre visible, debajo del wizard) no se quitó — sigue siendo la vía rápida para quien ya sabe que lo suyo es un ticket. Se reescribió su texto ("¿Ya sabes que es un ticket?" / "Repórtalo directo aquí, sin pasar por las preguntas de arriba.") para que no se lea como si repitiera lo mismo que la nueva rama del wizard, sino como el atajo para quien no necesita que le pregunten nada.
- **Por qué:** pedido explícito del usuario tras la primera versión del wizard — "tengo un problema técnico" también debe caer dentro del árbol de preguntas, no solo quedar como botón suelto aparte.
- **Verificación:** `npx vite build` sin errores. Probado en Chromium real (Playwright) las 5 sub-ramas del nuevo tipo "problema" — cada una navegó a la URL con el `?tipo=` esperado (`hardware`/`software`/`red`/`cuenta_acceso`/`otro`); se confirmó con capturas que el grid de 4 opciones en la raíz y de 5 en la sub-pregunta se acomodan bien (3+1 y 3+2 por fila); se confirmó que `?tipo=otro` marca el radio correcto y además revela el campo "¿De qué se trata?" que ya exigía ese tipo. Sin errores de consola.

### 2026-07-13 — Mesa de Ayuda: enrutamiento inteligente (wizard de preguntas en vez de botones con nombre de módulo)
- **Qué cambió:** el bloque "Solicitudes" de `/mesa-de-ayuda` dejó de ser 3 botones directos con nombre de módulo — ahora es un wizard de 1-2 preguntas en lenguaje cotidiano. Pregunta raíz **"¿qué necesitas hoy?"**: "Acceso a un sistema o correo" (sub-pregunta: Gmail / Plataforma de venta / ERP), "Equipo, accesorio o servicio" (sub-pregunta: Equipo o accesorio / Línea telefónica / Software o licencia) o "Alta de un nuevo ingreso" (navega directo, no tiene sub-tipo). Cada rama final navega al formulario público real que ya existía (`/solicitar-cuenta`, `/solicitar-recurso`, `/solicitar-ingreso`) — el wizard no crea nada nuevo, solo decide a dónde mandar a la persona. Botón "← Volver" para corregir la primera respuesta sin recargar la página.
- **Preselección en el formulario destino:** la rama elegida viaja como `?tipo=` en la URL y el formulario correspondiente lo lee al montar para dejar ya marcada la opción (checkbox/radio) que corresponde — la persona llega a llenar el mismo formulario de siempre, pero un paso adelantado, y puede corregir la preselección libremente:
  - `SolicitarCuenta.jsx`: `?tipo=gmail|platforms|erp` → marca `wantsGmail`/`wantsPlatforms`/`wantsErp`.
  - `ReportarTicket.jsx`: `?tipo=hardware|software|red|cuenta_acceso|otro` → marca el radio de `ticketType` correspondiente (se valida contra `TICKET_TYPES`, un valor inválido o ausente deja el campo vacío como antes).
  - `SolicitarRecurso.jsx`: `?tipo=telefono|software` → agrega `'Línea Telefónica'`/`'Software o Licencia'` a `resourceItems` (las únicas dos opciones estáticas, ya que el resto del catálogo carga async vía `customOptions` y no está disponible de forma síncrona al montar).
  - `SolicitarIngreso.jsx` no recibió cambios — no tiene un campo de "tipo" único que valga la pena preseleccionar desde el wizard.
- **El bloque de Tickets no se tocó:** sigue siendo su propio recuadro aparte, siempre visible, con acceso directo a `/reportar-ticket` sin pasar por ninguna pregunta — a propósito, para quien ya sabe que lo suyo es un ticket de soporte.
- **Por qué:** primera pieza del "enrutamiento inteligente" pedido por el director de Finanzas (ver nota de proyecto) — que el sistema pregunte "qué necesitas" y decida solo hacia dónde enrutar, sin que la persona tenga que saber que existen módulos separados por debajo. Queda pendiente para más adelante que el wizard también pueda cubrir "tengo un problema" con sub-pregunta de tipo de ticket (hoy ese camino solo existe como acceso directo, no integrado al wizard) y que se conecte con el catálogo de aplicaciones internas que también pidió el director.
- **Verificación:** `npx vite build` sin errores. Probado en un Chromium real (Playwright) las 6 combinaciones de rama + sub-tipo (Gmail/Plataforma/ERP, Equipo/Teléfono/Software) más el camino directo de Ingreso — cada una navegó a la URL esperada; se confirmó visualmente con capturas que el checkbox/radio correcto queda marcado en cada formulario destino (ERP marcado en Solicitud de Cuentas, Red marcado en Reportar Ticket, Línea Telefónica marcada en Solicitud de Recursos) y que el resto de las opciones queda sin marcar. Se probó también el botón "← Volver" (regresa a la pregunta raíz sin perder el estado de la página) y no se encontraron errores de consola.

### 2026-07-13 — Nueva página pública "Mesa de Ayuda" (punto de entrada único, primer paso de la reorganización pedida por Finanzas)
- **Qué cambió:** nueva página pública `/mesa-de-ayuda` (`frontend/src/pages/MesaDeAyuda.jsx`, sin login ni sidebar, mismo lenguaje visual que Solicitar Cuenta/Ingreso/Recurso/Reportar Ticket) con un menú de botones en vez de que la persona tenga que saber a cuál de las páginas públicas sueltas entrar. Dos bloques visualmente separados: **"Solicitudes"** (Cuenta o acceso → `/solicitar-cuenta`, Ingreso de personal → `/solicitar-ingreso`, Recurso o servicio → `/solicitar-recurso`) y, aparte, con su propio recuadro destacado, **"Sistema de Tickets"** (→ `/reportar-ticket`) para cuando el problema es una falla/soporte, no una solicitud.
- **No se tocó ninguna página existente:** las 4 URLs públicas (`/solicitar-cuenta`, `/solicitar-ingreso`, `/solicitar-recurso`, `/reportar-ticket`) siguen funcionando exactamente igual si alguien ya las tiene guardadas — `/mesa-de-ayuda` es una puerta de entrada nueva que enlaza hacia ellas, no un reemplazo.
- **Por qué:** feedback del director de Finanzas (2026-07-10, ver nota de proyecto) — pidió que exista un solo punto de entrada ("Mesa de Ayuda") en vez de que el usuario final tenga que decidir por su cuenta entre Reportar Ticket/Solicitar Cuenta/Solicitar Ingreso/Solicitar Recurso. Este cambio cubre esa primera pieza (unificar el "input" del usuario); quedan pendientes las otras dos pedidas (enrutamiento interno automático "qué necesitas" → módulo correcto, y los otros 2 bloques grandes del sistema — Administración e Indicadores) para sesiones futuras, con la presentación al director el 2026-07-17 como referencia de avance.
- **Verificación:** `npx vite build` sin errores; probado en un Chromium real (Playwright) en tema claro y oscuro — los 4 botones navegan a su URL correcta (`/solicitar-cuenta`, `/solicitar-ingreso`, `/solicitar-recurso`, `/reportar-ticket`) y no hay errores de consola propios de esta página (es estática, sin llamadas a API).

### 2026-07-10 — Planos de Red: cableado/conexiones entre dispositivos con código de color
- **Qué pidió Felipe (Infra):** una vez colocadas cámaras, gabinetes intermedios con sus switches y los NVRs del site en el plano, poder dibujar la conexión entre cada cámara y su switch, y los uplinks entre switches y el router — con un trazo personalizado (no una línea recta, para simular el recorrido real del cable) y un color distinto por tipo de conexión (cámara-switch, switch-router, AP-switch), para poder leer la estructura de la red de un vistazo.
- **Qué se agregó:** nuevo modo **"🔌 Conectar dispositivos"** en el editor del plano (junto a "Agregar dispositivo") — clic en el dispositivo de origen, clics sobre el plano para ir marcando el recorrido del cable, y clic en el dispositivo destino para cerrar la conexión. El trazo se dibuja en vivo mientras se traza, y una vez guardado queda como una línea de color sobre el plano, debajo de los pines. Clic en una línea ya dibujada la borra (con confirmación).
- **Color automático, no un campo que haya que llenar:** el color de cada conexión se calcula solo a partir de qué dos tipos de dispositivo conecta (Cámara→Switch verde, AP→Switch azul, Switch→Switch/uplink ámbar, Switch→Router/uplink morado, NVR→Switch cian, cualquier otro par en gris) — nada que Felipe tenga que elegir a mano ni que se pueda desincronizar del par real de dispositivos. Leyenda de colores agregada debajo del plano.
- **Backend:** modelo nuevo `LayoutConnection` (`layout`, `fromDevice`/`toDevice` referencian pines de `LayoutDevice`, `path`: lista de puntos en porcentaje) + `GET/POST /api/network-layouts/:id/connections` + `DELETE /api/network-layouts/connections/:id`. Al guardar, el backend fuerza el primer y último punto del trazo a las coordenadas reales de los pines de origen/destino (no a donde cayó el clic aproximado). Cascada de borrado: eliminar un pin borra las conexiones que lo tocan; eliminar el plano borra todas sus conexiones.
- **Verificación:** probado contra producción (backend local contra la base real, JWT firmado para un admin real) — plano de prueba con 3 pines (cámara/switch/router), conexión cámara→switch con un trazo de 4 puntos confirmando que los extremos quedaron exactos en los pines (no en los puntos de prueba deliberadamente "mal puestos" que se mandaron), conexión switch→router, `GET` trayendo ambas con los dispositivos poblados, borrado del pin del switch confirmando que sus 2 conexiones desaparecieron solas (cascada), y borrado del plano completo. `npx vite build` sin errores. Datos de prueba y las 8 entradas de auditoría específicas que generó se borraron por ID puntual al terminar.

### 2026-07-10 — Planos de Red: catálogo de "dispositivos descubiertos" para identificar cámaras sin el NVR
- **Qué pidió el usuario:** Felipe (Infra) tiene el plano y ya sabe dónde está físicamente cada una de sus ~72 cámaras, pero no tiene las credenciales del NVR, así que no puede saber qué IP/MAC le toca a cada una — solo lo sabe de la única que él mismo instaló ("Cortina 8"). Sus únicas dos opciones eran conseguir acceso al NVR (fácil si se logra) o subir cámara por cámara a leer la etiqueta física (inviable con 72, varias fuera de su alcance por altura). Se le sugirió apoyarse en la herramienta de descubrimiento de red del propio fabricante (SADP de Hikvision, ConfigTool de Dahua, etc.), que lista IP/MAC/modelo/serie de todo lo conectado a la red **sin pedir credenciales** (solo detección pasiva) — el problema que quedaba era cargar esos ~72 registros y saber cuál le toca a cada pin del plano sin capturarlos a mano uno por uno.
- **Qué se agregó:** nuevo botón **"📡 Importar dispositivos descubiertos"** en el editor del plano — sube el .xlsx/.csv que exporta la herramienta de descubrimiento (detecta las columnas de IP/MAC/modelo/serie por palabra clave, ya que el nombre exacto varía por fabricante), muestra una vista previa con checkboxes (excluye automáticamente filas sin MAC o repetidas dentro del mismo archivo) y lo importa como un catálogo aparte — esto **no coloca ningún pin**, solo arma la lista de "lo que hay en la red".
- **Vincular cada pin (nuevo o ya existente) sin escribir IP/MAC a mano:** dentro del formulario de un dispositivo (nuevo o editar uno ya colocado) aparece un buscador **"Completar con un dispositivo descubierto"** que filtra por IP/MAC/modelo/serie y, al elegir uno, llena IP/MAC/serie de un jalón. Conforme Felipe vaya identificando físicamente cuál MAC le toca a cuál cámara (ej. apagando puertos PoE uno a uno en el switch y viendo cuál desaparece del listado de la herramienta de descubrimiento, sin tener que subir a verla), solo busca esa MAC en el picker y la asigna al pin correcto en un clic.
- **Panel de pendientes:** debajo de la tabla de dispositivos aparece "📡 Dispositivos descubiertos por red sin identificar (N)" — la lista de lo importado cuya MAC todavía no coincide con ningún pin ya colocado (comparación por MAC normalizada, sin importar separador ni mayúsculas), con botón para quitar del catálogo una fila mal importada.
- **Backend:** `NetworkLayout.discoveredDevices` (subdocumentos `ip`/`mac`/`model`/`serialNumber`) + `POST /api/network-layouts/:id/discovered-devices` (importa en lote, deduplica por MAC normalizada contra lo ya importado y dentro del mismo archivo) + `DELETE /api/network-layouts/:id/discovered-devices/:discoveredId`. El emparejamiento contra los pines ya colocados se calcula en el frontend comparando MACs normalizadas — no se guarda ningún estado de "ya usado" que se pueda desincronizar.
- **Verificación:** probado contra producción (backend corrido localmente contra la base real, con JWT firmado para un admin real) — importar 4 filas de prueba (1 duplicada con MAC en otro formato, 1 sin MAC) dejó exactamente 2 nuevas (`added:2, skipped:2`); se creó un pin de prueba sin IP/MAC, se le asignó vía `PUT` el IP/MAC de una de las importadas (mismo mecanismo que usa el picker del frontend) y quedó correcto; se probó `DELETE` de una entrada del catálogo. `npx vite build` sin errores. Plano de prueba eliminado (cascada borra su pin) y las 4 entradas de auditoría específicas que generó esta prueba se borraron por ID puntual, no por filtro de entidad completa.

### 2026-07-10 — Módulo de Planos de Red (nuevo, para Infra)
- **Qué pidió el usuario:** su compañero de Infra necesitaba poder subir el layout/plano de una sucursal y "asignarle" encima los datos de cámaras, NVRs, APs, etc. (IP, MAC, número de serie). Al aclarar, salió que ese inventario de cámaras del compañero todavía no está cargado como Activos formales en el sistema (aún no tiene acceso a los grabadores), así que el diseño tenía que soportar tanto ligar a un Activo real como capturar los datos del dispositivo directo sobre el plano, sin depender de que exista el Activo primero.
- **Qué se agregó:** módulo nuevo `/network-layouts` (admin-only, junto a Tickets/Envíos en el sidebar) con dos pantallas:
  - **Lista de planos** (`NetworkLayouts.jsx`): sube una imagen (JPG/PNG/WEBP) por sucursal, con nombre y sucursal opcional; miniatura + conteo de dispositivos por tarjeta.
  - **Editor visual** (`NetworkLayoutDetail.jsx`): plano de fondo con pines colocables con clic (coordenadas guardadas en porcentaje, independientes del tamaño en pantalla), un modal por dispositivo con tipo/estado/IP/MAC/serie/notas y un buscador para **ligar opcionalmente** el pin a un Activo ya existente (o dejarlo como captura libre si el equipo aún no está dado de alta). Tabla de dispositivos debajo del plano como respaldo sin depender de los pines.
- **Backend:** modelos `NetworkLayout` (imagen como `Buffer`, igual que Responsivas/Tickets — el filesystem de Render no persiste) y `LayoutDevice` (`assetRef` opcional), rutas CRUD en `backend/src/routes/networkLayouts.js`, nuevo `'access_point'` como tipo de Activo (con campos `band`/`ssid`/`macAddress`), entidad `plano_red` agregada a Auditoría.
- **Verificación:** probado contra producción con imagen y datos de prueba reales — subida de plano, descarga de imagen (bytes idénticos), creación de dispositivo ligado a un Activo real (cámara Dahua existente) y de un dispositivo con captura libre (sin Activo), edición, conteo de dispositivos por plano, eliminación de dispositivo y de plano completo (con cascada). Limpieza posterior por ID específico tanto del plano de prueba como de las 4 entradas de Auditoría que generó (no por filtro de entidad completa, para no repetir el borrado accidental de auditoría real de una sesión anterior).

### 2026-07-10 — "Zabbix de equipos" dentro de Tickets
- **Qué pidió el usuario:** un apartado inspirado en Zabbix (que en la empresa ya usan para monitorear red) pero para EQUIPOS — quería ver qué máquinas físicas (modelo, número de serie) están dando problemas, sin tener que revisarlo mezclado dentro del ticket normal.
- **Qué se agregó:** toggle arriba de `/tickets` — **"🎫 Tickets"** (el tablero de siempre) / **"🛰️ Zabbix — Equipos"** (nueva vista). La vista Zabbix NO lista tickets, lista ACTIVOS: agrupa todo el histórico de tickets por cada equipo en su `assetRefs` y le calcula una severidad con la misma paleta de colores que usa Zabbix de verdad (Desastre/Alta/Promedio/Advertencia/OK), según una heurística simple documentada en el código: bloqueante+vencido = Desastre; bloqueante o vencido = Alta; 2+ tickets abiertos = Promedio; 1 ticket abierto normal = Advertencia; nada abierto = OK.
- **Tabla:** severidad (con punto de color), equipo (marca/modelo + número de serie), tickets abiertos, total histórico, fecha del último problema, y un botón "Ver tickets →" que manda a la vista normal ya filtrada por ese activo (reutiliza el mismo `?assetId=` que ya existía desde el badge en Activos).
- **Verificación:** probado contra producción — se recalculó a mano la severidad de **9 activos reales** con tickets (celulares, laptops, monitor, tablet, adaptador) usando la misma lógica del componente, confirmando que clasifica correctamente. Todo de solo lectura, sin datos de prueba que limpiar.

### 2026-07-10 — Modo oscuro en toda la aplicación
- **Qué pasaba:** el usuario reportó que con el navegador/sistema en tema oscuro la app "se ve muy extraño" — la causa real: sin declarar `color-scheme`, el navegador pinta los controles nativos (inputs, selects, checkboxes, scrollbar) con su tema oscuro por default mientras el resto de la página (fondos blancos definidos a mano en cada CSS module) se queda en claro fijo — una mezcla, no un diseño oscuro real.
- **Qué se corrigió:** `color-scheme: light dark` en `index.css` (controles nativos coherentes con el tema del sistema) + un bloque `@media (prefers-color-scheme: dark)` en **19 de los 20 archivos CSS del proyecto** (todas las páginas y componentes, excepto `NotFound.module.css` que ya es oscuro por diseño en ambos temas) — mismo criterio en todos: superficies claras (`#fff`/`#fafafa`/`#f0f0f0`) pasan a gris oscuro (`#1c1e22`/`#17181b`/`#2c2e33`), texto oscuro pasa a claro (`#f0f0f0`/`#ccc`/`#999`), y los acentos de color (ámbar de avisos, verde de éxito, azul de info) se oscurecen para no quemar la vista mientras conservan su significado.
- **Cobertura:** shell global (sidebar/fondo), Dashboard, Login, Empleados/Asignaciones/Detalle de Empleado, Activos/Accesorios, Disponibilidad, Auditoría, Usuarios, Cuentas Gmail/Plataformas/ERP, Solicitudes de Cuentas/Ingreso/Recursos/Envíos, Tickets (ya lo traía), Responsivas archivadas, modal de importación de Excel.
- **Verificación:** build de frontend sin errores en cada tanda de archivos; se confirmó con `grep` que 19/20 archivos CSS del proyecto ya tienen su bloque de modo oscuro. No se pudo verificar visualmente en navegador con el tema oscuro activado (sin esa herramienta disponible en el entorno) — es un cambio de solo CSS, sin lógica de negocio de por medio.

### 2026-07-10 — Tickets: rediseño completo como página independiente
- **Qué pidió el usuario:** que `/tickets` se sintiera como su propia aplicación (dashboard, tablero, vencimientos, alertas, reportes), no una tabla más reciclando el estilo de las demás bandejas de revisión.
- **Qué se hizo:** hoja de estilos propia (`Tickets.module.css`, acento teal en vez del naranja de marca, para diferenciarlo visualmente) y rediseño completo de `Tickets.jsx`:
  - **KPIs arriba:** Abiertos, En proceso, Vencidos, Impiden trabajar, Resueltos (7 días), Días promedio para resolver.
  - **Vencimientos/alertas:** heurística simple y documentada en el código (no es un SLA formal) — un ticket que le impide trabajar a alguien y lleva más de 1 día sin resolverse, o uno normal con más de 5, se marca "Vencido" (badge ⏰ en la tarjeta, aviso destacado arriba si hay alguno).
  - **Reportes:** desglose por tipo de soporte (barras), total histórico/resueltos/cerrados/sin asignar, y las resoluciones más comunes (de los tickets ya resueltos).
  - **Tablero tipo kanban** en vez de tabla plana: 4 columnas (Abierto/En proceso/Resuelto/Cerrado), cada ticket como tarjeta con folio, tipo, asunto, quién reportó, equipo, iniciales de quién lo tiene asignado, y badges (⚠️ bloqueante, ⏰ vencido, 📎 con evidencia) — clic en la tarjeta abre el mismo detalle de siempre (asignar/resolver/reabrir/eliminar), ahora con su propio estilo de modal.
  - Filtro por tipo de soporte arriba del tablero; el filtro por activo (que llega desde el badge en Activos) se conserva igual.
- **Verificación:** build de frontend sin errores; se revisaron a mano los 2 tickets reales que ya existen en producción (ambos "En proceso", asignados a Lilly Arroyo, creados hoy) contra la lógica de cómputo (vencidos, desglose por tipo, promedio de resolución) para confirmar que los números que mostraría la página son correctos — sin necesidad de crear ni borrar ningún dato de prueba, todo fue de solo lectura. No se pudo ver el render final en navegador (sin esa herramienta disponible en el entorno).

### 2026-07-10 — Aviso: correo de cuenta Compartida no debe llevar nombres
- **Qué pasaba:** un compañero del usuario tuvo que explicarle a mano a alguien llenando la Solicitud de Cuentas que el correo de una cuenta compartida no debe llevar nombres, solo puesto/área — el formulario no lo decía en ningún lado.
- **Qué se corrigió:** cuando el tipo de cuenta Gmail es **Compartida**, el campo "Correo solicitado" ahora muestra un aviso explícito (⚠️ el correo NO debe llevar nombres — usa el puesto o área, ej. ventas/atencion/compras) y el placeholder cambia a un ejemplo por puesto en vez de `nombre.apellido@gmail.com`.
- **De paso:** la sugerencia automática de correo (que arma `nombre.apellido@gmail.com` a partir del nombre) solo aplicaba antes sin importar el tipo de cuenta — ahora solo sugiere así para **Individual**; si cambian a Compartida y el campo tenía la sugerencia automática (sin que la hayan editado a mano), se limpia solo para que el aviso y el placeholder por puesto tomen su lugar.
- **Verificación:** build de frontend sin errores; es lógica puramente de UI (dos `useEffect` complementarios sin dependencia de backend), revisada a mano para confirmar que no hay ciclo entre ambos.
- **Extendido a Plataformas y ERP:** el usuario pidió que el mismo aviso aplicara "para todo" — se agregó el mismo mensaje (⚠️ No debe llevar nombres — usa el puesto o área) y el mismo placeholder por puesto al campo "Usuario o correo con el que quieres que quede" de Plataformas de venta (uno por cada plataforma marcada) y de ERP, ya que esas cuentas normalmente también son compartidas/departamentales.
- **Extendido también a Gmail Individual:** el usuario aclaró que en Gmail lo normal es "Individual" (Compartida es raro), así que dejar el aviso solo para Compartida significaba que casi nunca se veía. El aviso y el placeholder por puesto ahora se muestran siempre en Gmail, sin importar el tipo de cuenta — se quitó por completo la sugerencia automática `nombre.apellido@gmail.com` (y el estado `gmailTouched` que la acompañaba, ya sin uso), porque ya no aplica ni siquiera para Individual.

### 2026-07-10 — QR del link de seguimiento de Envíos (para cuando no hay a dónde mandarlo)
- **Qué pasaba:** el usuario no siempre tiene el número del mensajero a la mano para mandarle el link de "marcar en tránsito" — necesitaba una forma de dárselo sin escribir ni compartir nada, directo desde su pantalla.
- **Qué se agregó:** en el detalle de un Envío (mientras no esté "recibido"), junto al link de siempre, ahora aparece un **código QR** que apunta al mismo link — el mensajero lo escanea con su celular desde la pantalla de quien está armando el envío y cae directo a la página para marcar "en tránsito" (o, más adelante, a la de confirmar recepción), sin necesitar su número ni mandarle nada.
- **Cómo se hizo:** se agregó la librería `qrcode.react` (genera el QR en el navegador, del lado del cliente — no se manda el link a ningún servicio externo de terceros).
- **Verificación:** build de frontend sin errores, confirmado que el nombre exportado (`QRCodeSVG`) coincide con la librería instalada. No se pudo probar visualmente en navegador esta vez (sin herramienta de navegador disponible en el entorno) — es un componente puro sin lógica de negocio (solo codifica el mismo link ya usado y verificado en el flujo de Envíos).

### 2026-07-10 — Tickets: desglose en Dashboard + campo "especifica" en tipo "Otro"
- **Campo faltante:** al elegir "Otro" como tipo de soporte en `/reportar-ticket`, no había dónde decir de qué se trataba (a diferencia de "Otro" en las demás solicitudes, que sí piden especificar). Se agregó `Ticket.otherTypeDetail` — obligatorio solo si el tipo es "Otro", se ve en la tabla/detalle de Tickets y en el aviso de Telegram.
- **Dashboard — más detalle, no solo el conteo:** el usuario pidió que Tickets no solo apareciera como número en "Pendientes de revisión", sino con más contexto. Se agregó una tarjeta nueva "Tickets" (junto a "Actividad real del equipo") con: total de tickets activos, cuántos le impiden trabajar a alguien (⚠️), desglose por tipo de soporte (Hardware/Software/Red/Cuenta-Acceso/Otro, mismo estilo de barras que "Activos por categoría"), y los 5 tickets más recientes (mismo estilo que "Últimas asignaciones").
- **Nota real (no simulada):** al probar contra producción se encontraron **2 tickets reales** ya reportados por empleados (Lilly Estefany Arroyo y Miguel García) y ya autoasignados por Lilly — el sistema de Tickets ya está en uso real, no solo en pruebas.
- **Incidente durante la limpieza (transparencia):** al borrar mis 2 tickets de prueba, un filtro de limpieza demasiado amplio (`AuditLog.deleteMany({ entity: 'ticket' })`, sin acotar por folio) borró también las 2 entradas reales de Auditoría de cuando Lilly se autoasignó esos tickets reales. Los tickets en sí y su asignación quedaron intactos (no se tocó `Ticket`, solo `AuditLog`) — se perdió únicamente el rastro histórico de esas 2 acciones, ya reportado directamente al usuario. Corregido el criterio para limpiezas futuras: acotar siempre por folio/ID específico, nunca por `entity` completa, en módulos ya en uso real.
- **Verificación:** probado contra producción — se confirmó que "Otro" sin especificar rechaza el envío y con especificar lo acepta; se revisó el detalle real de los 2 tickets de producción para construir la lógica del resumen del Dashboard con datos reales (no simulados). Tickets de prueba propios eliminados al terminar.

### 2026-07-09 — Tickets: quitar que la persona elija/vea el equipo
- **Qué pasaba:** el sistema de Tickets recién agregado le pedía a quien reportaba elegir de cuál de sus equipos asignados era el problema (si tenía más de uno). El usuario pidió explícitamente que NUNCA se le pregunte ni se le muestre eso.
- **Qué se corrigió:** se quitó por completo esa sección del formulario público — ahora solo pide nombre, tipo de soporte, asunto, descripción y evidencia opcional. `Ticket.assetRef` (uno) pasó a ser `Ticket.assetRefs` (arreglo), que el backend llena **solo**, buscando del lado del servidor todos los activos que el empleado (si su nombre coincide con uno real) tiene asignados activos en ese momento — sin que el formulario mande ni pida nada de eso. Si tiene un equipo, el ticket queda ligado a ese; si tiene varios (ej. laptop + celular), a todos; si no hay match de nombre, a ninguno.
- **Por qué así:** era la única forma de seguir cumpliendo el requisito original (que el historial de tickets se refleje por activo, no por persona) sin pedirle nada a quien reporta — el trade-off es que alguien con 2+ equipos hace que el ticket cuente para ambos, en vez de señalar el exacto, pero eso ya no es una decisión de la persona.
- **Verificación:** probado contra producción — se envió un ticket real sin mandar ningún dato de activo desde el cliente, y se confirmó que el backend lo ligó solo a los 2 equipos que esa persona tiene asignados (laptop + celular), y que el conteo por activo (`/tickets/counts-by-asset`) y el filtro por activo específico siguen funcionando igual con el arreglo. Dato de prueba eliminado al terminar.

### 2026-07-09 — Sistema de Tickets (soporte técnico ligado al activo, no a la persona)
- **Qué se agregó:** módulo nuevo de principio a fin — cualquier empleado reporta un problema desde una página pública (`/reportar-ticket`, sin login, mismo patrón que Solicitar Cuenta/Ingreso/Recurso), y Sistemas lo gestiona desde `/tickets`.
- **La pieza clave (pedida explícitamente):** el ticket queda ligado al **activo específico** (por su serie/etiqueta vía `Ticket.assetRef`), no a la persona — porque a quién esté asignado ese equipo puede cambiar, pero el historial de problemas debe quedarse con la máquina física. Al escribir su nombre, si coincide con un Empleado real, el sistema le muestra los equipos que tiene asignados **hoy** (`GET /tickets/public/my-assets`) y elige de ahí cuál está fallando — si tiene solo uno, se selecciona solo; si el nombre no coincide con nadie (ej. alguien muy nuevo), se acepta el reporte igual, solo sin activo ligado.
- **Formulario:** tipo de soporte (Hardware/Software/Red/Cuenta-Acceso/Otro), asunto, descripción, "¿te impide trabajar?", y adjuntar evidencia (foto/captura, opcional — se guarda en Mongo como buffer, igual que los PDFs, porque Render no persiste disco entre despliegues).
- **Del lado de Sistemas:** asignarse el ticket o asignarlo a alguien más (al asignar, si seguía "Abierto" pasa solo a "En proceso"); al resolver, se elige de un **catálogo de resoluciones comunes** que crece con el tiempo (mismo patrón que el catálogo de Solicitud de Recursos: "Otro (especifica)" se puede sumar como opción fija para la próxima vez); reabrir si el problema vuelve a pasar.
- **En Activos:** el modal de editar un activo ya existente muestra un badge "🎫 N tickets" — clic y lleva a Tickets ya filtrado por ese equipo específico, historial completo sin importar quién lo tuviera asignado en cada momento.
- **Conectado al resto del sistema:** tarjeta de "Tickets abiertos" en Pendientes del Dashboard, aviso a Telegram al reportarse uno nuevo, y registrado en Auditoría (asignar/resolver/eliminar) — `AuditLog` ganó la acción `resolver` y la entidad `ticket`.
- **Verificación:** probado de punta a punta contra producción — se reportó un ticket real con empleado emparejado (Luis Felipe Gómez, con 2 activos asignados — se probó que si tiene más de uno hay que elegir cuál) + adjunto (se descargó y se confirmó bit a bit idéntico al original), y otro con nombre sin match y sin activo (para confirmar que no se bloquea). Se probó asignar (con auto-transición a "en proceso"), resolver con una razón nueva agregándola al catálogo, reabrir (se limpia la resolución anterior), el conteo por activo, y que un adjunto con tipo de archivo no permitido se rechaza sin crear el ticket. Todo el dato de prueba (tickets, catálogo, auditoría) se eliminó al terminar.

### 2026-07-09 — El mensajero marca "en tránsito" desde el link público, sin meterse a la app
- **Qué pasaba:** el usuario preguntó cómo hacer que el mensajero marque un envío como "en tránsito" sin tener cuenta en el sistema — hoy esa acción solo se podía hacer autenticado, desde dentro de la app.
- **Decisión:** en vez de montar un bot interactivo de Telegram (requeriría webhook, manejo de botones/`callback_query`, etc. — infraestructura nueva), se reutilizó el mismo link único que ya existía para "confirmar recepción" — ahora ese link se adapta según el estatus del envío: si sigue "enviado", muestra el paso para que el **mensajero** lo marque en tránsito; una vez en tránsito, muestra el paso para que el **destinatario** confirme la recepción, como ya funcionaba. El link se puede compartir por Telegram, WhatsApp o donde sea — para quien lo recibe es solo abrir un link y tocar un botón.
- **Qué se agregó:** `POST /shipments/public/:token/transit` (público, sin login) — pide el nombre de quien marca el tránsito (`Shipment.transitByName`, nuevo campo) y avisa a Telegram igual que ya hace la confirmación de recepción. En el detalle de Envíos (vista de Sistemas) ahora se ve quién lo marcó en tránsito, y el link se relabeleó a "Link de seguimiento (mensajero y destinatario)" con una nota de qué le toca a quién según el estatus.
- **Verificación:** probado de punta a punta contra producción — se creó un envío de prueba, se marcó en tránsito por el link público (sin token de sesión, como lo haría el mensajero real), se confirmó que un segundo intento de marcarlo en tránsito lo rechaza (ya no está en "enviado"), y se confirmó la recepción por el mismo link — los tres estatus (enviado → en tránsito → recibido) quedaron correctos con sus respectivos nombres. Envío y registros de auditoría de prueba eliminados al terminar.

### 2026-07-09 — "Usuario/correo deseado" también en Plataformas y ERP (antes solo Gmail)
- **Qué pasaba:** el usuario notó que solo "Correo Gmail" tenía el campo de "cómo quieren que quede el correo" (Correo solicitado) — Plataformas de venta y ERP no tenían ningún campo equivalente para capturar el usuario/correo deseado en esas cuentas.
- **Qué se agregó:** nuevo campo **"Usuario o correo con el que quieres que quede"** en ambas secciones:
  - **Plataformas de venta:** uno por cada plataforma marcada (junto a Tienda/Cuenta/Seller) — `AccountRequest.platforms[].username`.
  - **ERP:** uno para toda la solicitud (junto a Nivel de acceso) — reutiliza el campo `username` que ya existía en el modelo pero nunca se usaba para este tipo.
  - Aparece también en el PDF de la solicitud en ambos casos.
- **Verificación:** probado contra producción — se envió una solicitud real de prueba con Plataformas (Amazon + usuario deseado) y ERP (SAP + usuario deseado) a la vez, se confirmó que ambos PDFs muestran el campo correctamente sin encimados, y se borró la solicitud de prueba al terminar.
- **Pendiente relacionado (no corregido, se lo señalo al usuario):** el modal de "Aprobar" en Solicitudes de Cuentas (`AccountRequests.jsx`) sigue sin pre-llenar Plataforma/Usuario para solicitudes tipo "platform" — usa un campo `request.platform`/`request.username` de nivel superior que quedó sin uso desde que ese tipo pasó a guardar sus datos en `platforms[]` (un renglón por plataforma). Sistemas puede seguir aprobando escribiendo los datos a mano, pero no ve prellenado lo que la persona ya pidió. Es un hueco preexistente, no algo que haya roto este cambio — lo dejo documentado por si se quiere corregir después.

### 2026-07-09 — Fix: "Correo actual" siempre salía vacío en Solicitud de Cuentas
- **Qué pasaba:** el usuario reportó que en dos solicitudes de plataformas (Mauricio Galicia) el campo "Correo actual" salía en blanco, aunque esas personas sí tienen correo corporativo registrado en el sistema.
- **Causa raíz:** el formulario público (`SolicitarCuenta.jsx`) sí busca al empleado por nombre contra la base real (autocompletar puesto/departamento/teléfono/empresa en automático), y esa búsqueda (`GET /employees/public-lookup`) ya devuelve `corporateEmails` — pero la función que copia los datos encontrados al formulario (`pickEmployee`) nunca copiaba ese campo, y el envío del formulario tampoco lo mandaba al backend. El campo existía en el modelo y el backend ya lo aceptaba — el hueco era 100% frontend.
- **Qué se corrigió:** `pickEmployee` ahora también copia `corporateEmails` al campo `currentEmail` del formulario, y `handleSubmit` ya lo incluye en el POST — mismo patrón "autocompletar sin mostrarlo" que ya usan puesto/departamento/teléfono/empresa.
- **Backfill:** se identificaron 9 solicitudes reales ya existentes (pendientes y aprobadas) cuyo empleado sí tiene correo corporativo registrado pero el campo se guardó vacío por este bug — se les asignó el correo real y se regeneró su PDF guardado para las 9 (mismo criterio que el backfill de PDFs encimados de antes).
- **Verificación:** probado contra producción — se regeneró el PDF de la solicitud reportada (folio PLAT-BC71B5) y se confirmó visualmente que "Correo actual" ya muestra `auditor10@selectshop.com.mx` en vez de "—".

### 2026-07-09 — Nueva sección "Pendientes de revisión" en el Dashboard
- **Qué pasaba:** el usuario notó que el Dashboard seguía sin mostrar nada de los módulos nuevos (Solicitudes de Cuentas/ERP, Ingresos RH, Solicitudes de Recursos, Envíos entre Sucursales) — el fix anterior de auditoría solo hacía que ese trabajo contara para el score de "Actividad real del equipo", pero no había ningún número visible de "esto está pendiente" para esos módulos, a diferencia de Activos/Empleados que sí tienen todo un panorama completo.
- **Qué se agregó:** nueva fila de tarjetas **"Pendientes de revisión"** arriba del Dashboard (debajo de los KPIs), con el conteo de pendientes de cada módulo — clic en cualquiera lleva directo a esa página:
  - **Solicitudes de Cuentas** (Gmail/Plataformas) — pendientes
  - **Solicitudes ERP** — pendientes
  - **Ingresos RH** — pendientes
  - **Solicitudes de Recursos** — pendientes
  - **Envíos entre Sucursales** — en curso (enviado + en tránsito, sin contar lo ya recibido)
- **Visibilidad respeta permisos:** cada tarjeta solo se pide/muestra si el usuario realmente puede ver ese módulo — mismos criterios exactos que ya usa el menú lateral (`Layout.jsx`): Cuentas si administra Gmail o Plataformas, ERP si administra ERP, y RH/Recursos/Envíos solo para admin. Un usuario sin ningún permiso de estos simplemente no ve la sección (como pasaba antes con "Actividad real del equipo").
- **Verificación:** probado contra producción — se confirmó que los 5 endpoints devuelven datos reales con pendientes reales (3 Solicitudes de Cuentas, 3 ERP, 2 Ingresos RH, 4 Solicitudes de Recursos, 1 Envío en curso al momento de la prueba). No se pudo probar visualmente en navegador esta vez (sin Playwright/herramienta de navegador disponible en el entorno) — se verificó a nivel de API + revisión cuidadosa de la lógica de agregación en el código, y build de frontend sin errores.

### 2026-07-09 — Fix: texto encimado en todos los PDFs generados (filas etiqueta/valor)
- **Qué pasaba:** el usuario reportó `Solicitud_platform_bc71b5.pdf` con "Justificación / Funciones" encimado con "Vigencia" — cuando un valor de texto libre (justificación, correo corporativo con varios correos, razón social larga, etc.) ocupaba más de una línea, la fila de abajo empezaba a dibujarse en una posición fija (15pt) sin importar cuánto espacio necesitó realmente la de arriba.
- **Causa raíz:** `kvRow`/`kvPair` en `backend/src/utils/pdfBranding.js` — el helper compartido que usan **todos** los PDFs del sistema (Solicitudes de Cuentas/Gmail/Plataformas/ERP, la Responsiva de equipo, la Responsiva de cuentas Gmail/Plataformas/ERP, y el Formato de Salida de Equipos) — asumía que cada fila mide una sola línea de texto. Un valor largo sí se dibujaba envuelto en varias líneas, pero la altura de la fila nunca se ajustaba, así que la siguiente fila lo pisaba.
- **Qué se corrigió:** `kvRow`/`kvPair` ahora miden el alto real que necesita cada etiqueta y valor (`heightOfString`) ANTES de dibujar, usan el máximo entre columnas como alto real de la fila, y de paso agregan salto de página automático (`guard`) si la fila ya no cabe — antes `kvRow` no protegía contra esto en absoluto. Como es un helper compartido, el fix aplica automáticamente a los 6 generadores de PDF que lo usan, no solo al que reportó el bug.
- **Verificación:** se regeneró el PDF real reportado (`Solicitud_platform_bc71b5.pdf`, folio PLAT-BC71B5) con el código corregido — ya no hay encimado. Se hizo una prueba de estrés del helper con valores extremos (justificación muy larga, lista de varios correos, razón social larga, etiqueta larga, valores vacíos) sin ningún encimado. Se regeneró también una Responsiva de equipo real completa (Luis Felipe Gómez, laptop + celular) para confirmar que no se rompió nada del resto del documento. Todo probado contra producción, solo lectura — no se modificó ningún dato real.
- **Nota importante (por qué seguía saliendo encimado después del fix):** el PDF de una Solicitud de Cuenta se genera **una sola vez**, al crearse, y se guarda como `pdfData` en el propio documento de Mongo — el botón de descarga solo devuelve ese buffer guardado, nunca lo regenera. Las Responsivas (equipo/Gmail/Plataformas/ERP) sí se generan al vuelo en cada descarga, así que esas ya quedaron corregidas en cuanto se desplegó el fix — pero las 9 Solicitudes que ya tenían PDF guardado desde antes seguían mostrando la versión vieja sin importar cuántas veces se descargaran. Se identificaron las 9 (`AccountRequest` con `pdfData` existente) y se regeneraron una por una con el generador ya corregido, actualizando el campo guardado — mismos datos de origen, solo se volvió a renderizar el PDF. Confirmado visualmente que la regeneración quedó sin encimados.

### 2026-07-09 — Autocompletar nombre por Empleados en Confirmar Recepción
- **Qué se agregó:** en la página pública de confirmar recepción de un envío (`/confirmar-envio/:token`), el campo "Tu nombre" ahora busca coincidencias contra Empleados mientras se escribe (mínimo 3 letras) y muestra un dropdown para elegir el nombre exacto — misma búsqueda pública (`GET /employees/public-lookup`) y mismo patrón visual que ya usan Solicitar Cuenta/Ingreso/Recurso.
- **Por qué:** pedido del usuario — que el campo de nombre en el link de confirmar entrega "ya encuentre al usuario" igual que en los otros formularios públicos, en vez de ser un campo de texto libre.
- **A diferencia de los otros formularios:** aquí NO es obligatorio que el nombre coincida con un empleado real (no se bloquea el envío si no hay match) — quien confirma la recepción puede no estar dado de alta en el sistema (ej. guardia de recepción), así que el dropdown es solo una ayuda, no una validación.
- **Verificación:** probado contra producción — `GET /employees/public-lookup?q=luis felipe` devolvió la coincidencia real esperada; se creó un envío de prueba, se confirmó su recepción usando el nombre sugerido, y se verificó que el flujo completo sigue funcionando igual que antes. Envío y registros de auditoría de prueba eliminados al terminar.

### 2026-07-09 — Mover "Responsivas" y "Cuentas" a la sección General del menú
- **Qué cambió:** en el sidebar (`Layout.jsx`), los enlaces "Responsivas" y "Cuentas" (con su submenú Gmail/Plataformas/Plataformas ERP/Solicitudes) ahora aparecen dentro de la sección **General**, junto con Dashboard/Disponibilidad/Empleados/Activos/Asignaciones, en vez de después de la sección "Administración".
- **Por qué:** pedido del usuario — son secciones de uso frecuente, no exclusivas de administración.
- **Verificación:** build de frontend (`vite build`) sin errores; es un cambio de solo orden/ubicación en el JSX, sin lógica de permisos afectada.

### 2026-07-09 — Reflejar los módulos nuevos (Solicitud de Recursos, Envíos, rechazos) en el Dashboard/Auditoría
- **Qué pasaba:** el usuario preguntó si los módulos que se armaron esta semana (Solicitud de Recursos, Envíos entre Sucursales, y los rechazos de Solicitudes de Cuentas/Ingreso) debían reflejarse en el Dashboard, con la misma lógica de "score de actividad" ("Actividad real del equipo") que ya existe ahí. La respuesta era sí, y el motivo técnico exacto era que ninguna de esas rutas llamaba a `logAction` — el aprobar de Solicitud de Recursos, Envíos completo, y el rechazar de Solicitudes de Cuentas/Ingreso/Recursos eran invisibles para Auditoría y, por lo tanto, para el score del Dashboard (que se calcula 100% a partir de `AuditLog`).
- **Qué se corrigió:** se agregaron los registros de auditoría que faltaban:
  - `AuditLog`: se ampliaron los enums — `action` ahora incluye `aprobar`/`rechazar`; `entity` ahora incluye `solicitud_cuenta`/`solicitud_ingreso`/`solicitud_recurso`/`envio`.
  - **Solicitud de Recursos:** aprobar → `aprobar/solicitud_recurso`; rechazar → `rechazar/solicitud_recurso`; eliminar → `eliminar/solicitud_recurso`.
  - **Envíos entre Sucursales:** crear → `crear/envio`; marcar en tránsito → `editar/envio`; eliminar → `eliminar/envio` (la confirmación de recepción, que hace el destinatario sin cuenta, no se audita — no hay usuario del sistema detrás).
  - **Solicitudes de Cuentas:** rechazar → `rechazar/solicitud_cuenta`; eliminar → `eliminar/solicitud_cuenta` (aprobar ya quedaba registrado indirectamente, vía `crear/cuenta_gmail` o `cuenta_plataforma`/`cuenta_plataforma_erp` al crearse la cuenta real).
  - **Solicitudes de Ingreso:** rechazar → `rechazar/solicitud_ingreso`; eliminar → `eliminar/solicitud_ingreso` (aprobar ya quedaba registrado como `crear/empleado`).
  - Dashboard (`ACTION_LABELS`/`ACTION_ICONS`/`ACTION_WEIGHTS`) y Auditoría (`ACTION_CONFIG`/`ENTITY_CONFIG` + filtro) actualizados con las nuevas acciones/entidades — de paso se corrigió que a `ENTITY_CONFIG` le faltaba `cuenta_plataforma_erp` (hueco previo, no relacionado con este cambio).
- **Por qué:** para que el score de "Actividad real del equipo" (pesos fijos por acción, sin nada aprendido — ya documentado así en el propio código) refleje el trabajo real que se hace hoy en el sistema, no solo el de los módulos más antiguos (Activos/Empleados/Cuentas).
- **Verificación:** probado de punta a punta contra producción — se creó y rechazó una Solicitud de Recursos real, se creó/marcó en tránsito/eliminó un Envío real, y se rechazó una Solicitud de Cuenta y una de Ingreso (creadas directo en Mongo para no depender de un empleado real) — se confirmó que las 6 entradas de `AuditLog` quedaron con el `action`/`entity` correcto y que `GET /api/audit` las filtra bien por ambos campos. Todos los registros y documentos de prueba se eliminaron al terminar.

### 2026-07-08 — Conectar Solicitud de Recursos con Envíos entre Sucursales
- **Qué se agregó:** en el detalle de una Solicitud de Recursos ("Ver"), nuevo botón **"🚚 Generar formato de salida"** — arma el formulario de "Envíos entre Sucursales" ya lleno con los datos de esa solicitud (solicitante, departamento, puesto, sucursal destino si el empleado la tiene registrada, destinatario, motivo "Asignación de equipo o recurso", y la justificación como observaciones) para no volver a escribir nombre/equipo/datos desde cero. Sistemas solo confirma la sucursal de origen y ajusta lo que haga falta, y de ahí sale el PDF imprimible + el link de confirmación para el destinatario, igual que un envío normal.
- **Por qué:** el usuario explicó que sigue necesitando el formato de salida para entregar lo que le solicitan (ej. Felipe u otros), y no quería tener que volver a capturar los mismos datos que ya vienen en la solicitud.
- **Backend:** se agregó la opción de motivo **"Asignación de equipo o recurso"** al catálogo de Envíos, y `Shipment.sourceResourceRequest` (referencia opcional, solo para trazabilidad) que liga el envío a la solicitud que lo originó.
- **Refactor:** el formulario de creación de envíos se movió a un componente compartido (`CreateShipmentModal`) para reutilizarlo tanto en Envíos entre Sucursales como desde Solicitudes de Recursos, sin duplicar código.
- **Verificación:** probado de punta a punta contra producción — se envió una Solicitud de Recursos de prueba, se abrió su detalle, se generó el formato de salida (confirmando que todo llegó prellenado correctamente) y se creó el envío — se confirmó que quedó ligado a la solicitud de origen (`sourceResourceRequest`). Solicitud y envío de prueba eliminados al terminar.

### 2026-07-08 — Envíos entre Sucursales (rastreo tipo paquetería para salidas de equipo)
- **Qué se agregó:** nueva sección **"Envíos entre Sucursales"**, digitaliza el "FORMATO DE SALIDA DE EQUIPOS" (Cómputo y Celulares) que Sistemas llenaba en Word. Sistemas arma un envío con uno o varios equipos (buscando activos ya existentes en Activos/Accesorios, o capturando a mano si no están en el sistema), sucursal origen/destino, destinatario y motivo (Mantenimiento, Reparación externa, Préstamo temporal, Baja definitiva, Otro).
- **Rastreo tipo paquetería:** cada envío pasa por **Enviado → En tránsito → Recibido**. "En tránsito" lo marca Sistemas manualmente; **"Recibido" solo lo puede confirmar el destinatario** (ej. Felipe en Tepotz II) desde un link único que se le comparte por WhatsApp/correo — sin necesitar cuenta en el sistema, escribe su nombre y notas opcionales ("llegó completo", etc.).
- **Efecto en Activos:** si el equipo enviado ya estaba vinculado a un activo real del sistema, al confirmarse la recepción se actualiza sola su ubicación a la sucursal destino — Disponibilidad queda correcta sin trabajo manual extra.
- **PDF:** cada envío se puede descargar como PDF con el mismo formato del Word original (folio, datos del solicitante, tabla de equipos, motivo, firmas), más el estatus de rastreo.
- **Backend:** modelo `Shipment` nuevo con folio autogenerado y token de confirmación único; rutas en `shipments.js` (crear/listar/marcar en tránsito/PDF — con sesión; ver y confirmar — públicas, sin sesión).
- **Verificación:** probado de punta a punta contra producción — se creó un envío real con un activo real vinculado (Corporativo Polanco → Tepotzotlán II), se marcó "en tránsito", se descargó el PDF, y se confirmó la recepción desde el link público (sin login) — se confirmó que la ubicación del activo se actualizó sola a la sucursal destino. Envío de prueba eliminado y ubicación del activo restaurada al terminar.

### 2026-07-08 — Separar Solicitudes ERP a su propia página
- **Qué pasaba:** el usuario notó que las solicitudes de cuentas tipo ERP aparecían mezcladas con Gmail/Plataformas en la misma tabla de "Solicitudes de Cuentas" — aunque el backend ya filtraba por permiso (quien no maneja ERP no las veía), quien sí maneja varios tipos (o es admin) las veía todas revueltas.
- **Qué se corrigió:** nueva página **"Solicitudes ERP"** (`/account-requests-erp`), separada de "Solicitudes de Cuentas" — igual que ya está separada la administración de esas cuentas ("Cuentas de Plataformas" vs "Cuentas de Plataformas ERP"). "Solicitudes de Cuentas" general ahora solo muestra Gmail/Plataformas, nunca ERP, ni siquiera para un admin con todos los permisos.
- **Sidebar:** aparece "Solicitudes ERP" como link aparte solo para quien tiene permiso de Plataformas ERP (junto a "Cuentas Plataformas ERP"); el link general "Solicitudes" solo aparece para quien maneja Gmail o Plataformas normales.
- **Backend:** `GET /account-requests` acepta `?type=` para pedir solo ciertos tipos (siempre cruzado con lo que el usuario realmente puede gestionar, nunca se puede pedir un tipo fuera de su permiso).
- **Verificación:** probado con 3 perfiles reales — un usuario solo-ERP ve "Solicitudes ERP" (con sus 2 solicitudes ERP reales) pero no "Solicitudes" general, ni puede entrar a `/account-requests` directo por URL (rebota a su página); un usuario solo-Gmail ve "Solicitudes" pero no "Solicitudes ERP"; un admin con todos los permisos ve las dos por separado y "Solicitudes de Cuentas" ya no mezcla el tipo ERP.

### 2026-07-08 — Recordatorio del link público en cada bandeja de revisión
- **Qué se agregó:** en Solicitudes de Cuentas, Solicitudes de Ingreso y Solicitudes de Recursos aparece un recuadro arriba de la tabla con el link público de ese formulario y un botón **Copiar** — para no tener que buscarlo o memorizarlo cada vez que alguien lo pida.
- **Por qué:** el usuario pidió tener los links a la mano justo donde llegan las solicitudes, por si se les olvida.
- **Verificación:** probado en Chromium — el link se arma con el dominio real de cada entorno (`window.location.origin` + la ruta pública), y el botón Copiar sí deja el link correcto en el portapapeles.

### 2026-07-08 — Búsqueda de respaldo por palabra/sinónimo en Disponibilidad de Solicitudes
- **Qué se agregó:** el usuario señaló que exigir coincidencia exacta de tipo era demasiado rígido — mucho de lo que ya está en Activos vive como "Accesorio" genérico con la descripción en texto libre, y basta con encontrar similitudes (ej. "soporte" y "base" significan lo mismo). Ahora, además de la búsqueda por tipo exacto, "Disponibilidad y recomendación" también busca por palabra clave (con sinónimos comunes: base/soporte/stand, audífonos/diadema/headset, bocina/altavoz/parlante, etc.) entre todo lo guardado como "Accesorio"/"Otro" genérico — incluso para "Otro (especifica)", usando lo que haya escrito quien solicitó.
- **Cómo se distingue:** si hay coincidencia exacta de tipo, se muestra igual que antes (✅ verde). Si no hay tipo exacto pero sí algo que se parece por descripción, se muestra aparte en naranja (🔎 "sin coincidencia exacta, pero se parece — revisa si aplica") — nunca se asume automáticamente, Sistemas decide si aplica antes de asignar.
- **Verificación:** probado contra producción — una solicitud de prueba pidiendo "Bocina" (vía "Otro (especifica)") encontró correctamente un "Amazon Alexa Echo Dot" guardado como Accesorio con descripción "Altavoz inteligente", sin tener ningún tipo exacto en común. Solicitud de prueba borrada al terminar.

### 2026-07-08 — Corrección: "Base para Laptop" (no "Soporte") sin stock encontrado
- **Qué pasaba:** el usuario reportó que ya tenía bases para laptop en Activos pero el sistema no encontraba stock. Dos causas: (1) le puse "Soporte para Laptop" en vez de "Base para Laptop", que es como ya le llaman; (2) sus bases existentes (LAPTOP STAND RT-007, Kishnell OFI-10, HAING N18) estaban registradas como tipo genérico "Accesorio" con la descripción en un campo de texto libre, no como un tipo aparte — por eso el nuevo tipo `base_laptop` no las encontraba, eran 3 cosas totalmente desconectadas entre sí.
- **Qué se corrigió:** se renombró el tipo de "Soporte para Laptop" a **"Base para Laptop"** en toda la app (clave interna también cambió de `soporte_laptop` a `base_laptop`, no había ningún activo real usándola todavía). Con autorización del usuario, se reclasificaron esos 3 activos existentes al tipo nuevo.
- **Verificación:** contra producción — ahora `GET /assets?status=disponible&type=base_laptop` regresa las 3 bases reales con su cantidad real en stock (10, 1 y 11 respectivamente), en vez de nada.

### 2026-07-08 — Generar la Responsiva directo al asignar desde Solicitud de Recursos
- **Qué se agregó:** al asignar un artículo desde "Ver" en Solicitudes de Recursos, junto al artículo ya asignado aparecen dos botones — **"📄 Responsiva nueva"** y **"📄 Anterior"** — que generan y descargan la responsiva de ese activo para ese empleado, reutilizando exactamente el mismo generador que ya existe en la ficha del empleado (mismo archivo, mismo archivado en "Responsivas generadas").
- **Corrección relacionada (bug real, no solo de este flujo nuevo):** al revisar esto encontré que la Responsiva **nueva** (la del botón normal en Empleados) tenía una categorización de accesorios incompleta — solo reconocía Monitor/Mouse/Teclado/Cargadores/Accesorio/Otro. Cualquier otro tipo (Audífonos, Kit Teclado+Mouse, Webcam, Hub USB, Cable, Disco Duro, Adaptador, Impresora, Escáner, Herramienta, Consumible, y el nuevo Soporte para Laptop) **desaparecía por completo** de la responsiva generada — el documento salía sin ese artículo listado, aunque sí estuviera asignado en el sistema. Esto afectaba a cualquier empleado cuyo único equipo asignado fuera uno de esos tipos, no solo a este flujo nuevo.
- **Qué se corrigió:** la sección de accesorios de la responsiva nueva ahora es un catch-all (cualquier tipo que no sea laptop/escritorio/all-in-one/celular/tablet cae ahí), en vez de una lista fija que había que mantener actualizada cada vez que se agregaba un tipo nuevo.
- **Verificación:** contra producción — se asignó un cable de prueba a un empleado real, se generaron ambos formatos de responsiva (nueva y anterior) y se confirmó que el cable sí aparece en "ACCESORIOS ENTREGADOS" de la nueva (antes de la corrección esa sección habría salido vacía). Probado también el flujo completo en Chromium: enviar solicitud → aprobar/asignar → descargar ambas responsivas. Asignación, solicitud y archivo de responsivas de prueba eliminados al terminar.

### 2026-07-08 — Corrección: "empleado no encontrado" en Solicitud de Recursos aunque sí existiera
- **Qué pasaba:** el usuario reportó ver "no encontramos a este empleado" en una solicitud de un empleado real (Miguel García Ramos) que sí estaba en Empleados. Causa: esa solicitud se mandó ~4 minutos antes de que se agregara el guardado de `employeeRef` (ver entrada "Disponibilidad y recomendación..." más abajo) — dependía de un dato fijado al momento de enviar, así que cualquier solicitud de antes de ese cambio (o donde el buscador no encontró el nombre en su momento) se quedaba marcada como "no encontrado" para siempre, aunque el empleado sí existiera.
- **Qué se corrigió:** si la solicitud no trae `employeeRef` guardado, ahora se busca al empleado por nombre exacto (activo) en el momento de revisar, en vez de asumir que no existe. Si encuentra exactamente una coincidencia, deja asignar directo igual que si hubiera venido guardado desde el principio.
- **Verificación:** confirmado contra producción — la solicitud real de Miguel García Ramos ahora muestra "✓ Encontramos a MIGUEL GARCIA RAMOS en Empleados (70476) — se le puede asignar directo" en vez de la advertencia.

### 2026-07-08 — "Soporte para Laptop" y catálogo que crece solo con "Otro (especifica)"
- **Qué se agregó:**
  - **"Soporte para Laptop"** ahora es un tipo de accesorio real en toda la app (Activos, Accesorios, Disponibilidad, Asignaciones, Solicitud de Recursos) — no existía en el catálogo digitalizado aunque sí estaba en el Excel original de accesorios.
  - **"Otro (especifica)"** en Solicitud de Recursos — para lo que todavía no está en el catálogo. Al marcarlo, pide especificar qué es. Al aprobar una solicitud así, aparece una casilla **"Agregar '{lo que pidieron}' a la lista de recursos"** (marcada por default) — si se deja marcada, esa cosa queda disponible como casilla normal para la próxima solicitud, sin necesitar tocar código.
- **Por qué:** el usuario notó que no se podía pedir un soporte/base para laptop, y pidió una forma de que el catálogo crezca con el tiempo según lo que vayan necesitando, en vez de quedar fijo para siempre.
- **Backend:** `soporte_laptop` agregado a `ASSET_TYPES` (Asset.js) y a los catálogos del frontend (`ASSET_TYPE_LABELS`, `ACCESSORY_TYPE_LABELS`, grupos de Activos/Accesorios/Disponibilidad/Asignaciones, íconos y specs). Modelo nuevo `CustomResourceOption` + `GET /resource-requests/custom-options/public` (el formulario las mezcla con las de siempre) + lógica en `PUT /resource-requests/:id/approve` que crea la opción si se pidió agregarla.
- **Verificación:** probado de punta a punta contra producción — "Soporte para Laptop" ya sale como casilla normal; se envió una solicitud con "Otro: Silla ergonómica de prueba", se aprobó marcando "agregar a la lista", y se confirmó que en una visita nueva al formulario ya aparece como casilla propia. Solicitud y opción de prueba borradas al terminar.

### 2026-07-08 — Agregar "Software o Licencia" a Solicitud de Recursos
- **Qué se agregó:** se había quitado por completo al simplificar el formulario (ver entrada de abajo) — el usuario pidió recuperarla, pero con forma de especificar cuál. Ahora "Software o Licencia" es una casilla más junto a los accesorios y Línea Telefónica; al marcarla aparece un campo obligatorio **"¿Cuál software o licencia?"** (ej. "Adobe Acrobat Pro", "Office 365"). Se trata igual que Línea Telefónica: no se controla como stock, se marca aparte en la revisión con el nombre específico que pidieron.
- **Backend:** `ResourceRequest.licenseDetail` (nuevo).
- **Verificación:** probado de punta a punta en Chromium contra producción — el campo aparece solo al marcar la casilla, se guarda y se muestra correctamente en la lista y en el detalle ("Software o Licencia (Adobe Acrobat Pro)"). Solicitud de prueba borrada al terminar (se dejó intacta una solicitud real de otro usuario que ya estaba pendiente).

### 2026-07-08 — Disponibilidad y recomendación al revisar una Solicitud de Recursos
- **Qué se agregó:** al abrir "Ver" en una Solicitud de Recursos, ahora consulta Disponibilidad en tiempo real por cada cosa que pidieron y da una recomendación clara: **✅ X disponibles, se puede dar** o **❌ Sin stock disponible ahorita**, con la lista de artículos concretos (marca/modelo/serie/sucursal) y un botón **Asignar** para dárselo directo al empleado desde ahí mismo, sin salir a Disponibilidad a buscarlo aparte. "Línea Telefónica" se marca aparte como que no se controla como stock (es un servicio con el operador).
- **Para que "Asignar" funcione**, ahora se guarda una referencia al empleado real (no solo su nombre en texto) cuando se encuentra por el buscador al llenar el formulario — si no se encontró (nombre no coincide con nadie registrado), se avisa que hay que asignar manualmente desde Disponibilidad.
- **Por qué:** el usuario pidió que al generarse la solicitud se compare contra Disponibilidad y se dé una recomendación de qué se puede entregar según lo que hay, en vez de tener que ir a consultarlo aparte.
- **Backend:** `ResourceRequest.employeeRef` (nuevo) guarda el `_id` del empleado si se encontró al enviar la solicitud.
- **Verificación:** probado de punta a punta contra producción con stock real — se detectaron correctamente 2 kits de teclado+mouse y 5 mouse disponibles, se asignó uno real a un empleado real desde el modal y se confirmó en Activos que quedó asignado; se revirtió (asignación borrada, activo vuelto a "disponible") y se borró la solicitud de prueba al terminar.

### 2026-07-08 — Simplificar Solicitud de Recursos (ya no "y Servicios")
- **Qué cambió**, a pedido del usuario tras ver la primera versión:
  - Ya no pide **Puesto/Departamento/Jefe directo** como campos a llenar — si encuentra al empleado por nombre, esos datos se guardan por dentro sin volver a mostrarlos (antes se autocompletaban pero igual se veían como inputs editables).
  - Se quitó **"Tipo de solicitud"** (Asignación/Compra/Instalación) — en la práctica siempre es asignación de lo que Sistemas ya tiene en stock; compras las maneja otra área.
  - "Recurso/Servicio" (un solo dropdown con categorías del Excel) se reemplazó por una **lista de casillas con el catálogo real de accesorios** que ya usa el resto de la app (Monitor, Mouse, Teclado, Kit Teclado+Mouse, Audífonos, Cable, etc.) más **Línea Telefónica** aparte — se puede elegir más de uno.
  - Se quitó **"Detalle de la solicitud"** (redundante con Justificación, que sí se conserva y sigue siendo obligatoria).
- **Por qué:** el usuario aclaró que esta solicitud es únicamente para lo que Sistemas puede entregar directo de su stock de accesorios (más línea telefónica si la piden) — nada de compras, instalaciones ni equipo mayor, eso es de otra área.
- **Backend:** `ResourceRequest` ahora guarda `resourceItems` (arreglo) en vez de `requestType`/`resourceService`/`detail`/`directManager`. Como la página llevaba minutos en producción y nadie había mandado una solicitud real todavía, se cambió el esquema directo sin necesidad de migrar datos viejos.
- **Verificación:** probado de nuevo de punta a punta en Chromium real contra producción — nombre autocompleta puesto/departamento sin mostrarlos como campos, casillas de accesorios + línea telefónica funcionan, la bandeja de revisión muestra "Kit Teclado+Mouse, Línea Telefónica" correctamente. Dato de prueba borrado al terminar.

### 2026-07-08 — Nueva página pública: Solicitud de Recursos y Servicios
- **Qué se agregó:** `/solicitar-recurso` — página pública (sin login, sin sidebar) que reemplaza el Excel "FORMATO DE SOLICITUD DE RECURSOS Y SERVICIOS" (SS-STD-DA-F01) que se llenaba e imprimía a mano. Cualquier empleado escribe su nombre (autocompleta puesto/departamento si ya está en Empleados), jefe directo, tipo de solicitud (Asignación / Compra / Instalación — mismas opciones que el Excel), recurso o servicio (Línea telefónica, Equipo de cómputo, Software o licencia, Servicio externo, etc. — misma lista del Excel), detalle y justificación.
- **Bandeja de revisión:** nueva página **"Solicitudes de Recursos"** (solo admin, en el sidebar junto a "Ingresos RH") — lista con pestañas Pendiente/Aprobada/Rechazada/Todas, botón **Ver** para el detalle completo, **Aprobar** (con notas de resolución opcionales, ej. "equipo asignado desde stock") o **Rechazar** (con motivo opcional).
- **Flujo elegido:** una sola revisión (como Ingresos RH), no la cadena de 3 firmas del Excel (Solicitante/Jefe Directo/Dirección) — decisión del usuario para no depender de que jefes y Dirección también entren al sistema.
- **Backend:** `ResourceRequest` (modelo nuevo) + `POST /resource-requests/public` (con límite por IP y honeypot, igual que Cuentas/Ingreso RH) + `GET/PUT/DELETE /resource-requests` (admin). Aviso a Telegram al recibir una solicitud nueva.
- **Verificación:** probado de punta a punta en Chromium real contra el backend de producción — se envió una solicitud de prueba, apareció en la bandeja, se abrió el detalle, se aprobó con notas y se confirmó que se mueve a la pestaña "Aprobada" con quién la aprobó. Registro de prueba borrado de producción al terminar.

### 2026-07-08 — Corrección: los botones de "Acción" se veían recortados en Responsivas
- **Qué pasaba:** al agregar la columna "Firmada" (ver entrada de abajo), la tabla de Responsivas quedó más ancha y los botones "Descargar"/"Eliminar" se recortaban o se apilaban en vez de verse en una sola línea.
- **Causa real:** no era solo cuestión de ancho de columna — el contenedor principal de la página (`.main` en `Layout.module.css`) es un hijo flex sin `min-width: 0`, así que en vez de dejar que la tabla hiciera su propio scroll horizontal (para eso ya existía `overflow-x: auto` en el recuadro de la tabla), toda la página se estiraba de más y el navegador la recortaba en el borde de la pantalla.
- **Qué se corrigió:** se agregó `min-width: 0` a `.main` (arregla este mismo problema en cualquier página con tablas anchas, no solo Responsivas) y se ajustó el ancho mínimo de la tabla y el `.page` de Responsivas para que quepan cómodas las 7 columnas, con scroll horizontal contenido dentro del recuadro de la tabla cuando la pantalla es angosta.
- **Verificación:** probado en Chromium a 1920px (todo visible sin scroll) y a 1440px (con scroll horizontal contenido dentro de la tabla, sin empujar el resto de la página) — "Descargar" y "Eliminar" ya no se cortan ni se apilan.

### 2026-07-08 — Subir la responsiva ya firmada (foto/PDF) en Responsivas generadas
- **Qué cambió:** en "Responsivas generadas", cada fila ahora tiene una columna **Firmada**. Si todavía no se ha subido nada, aparece un botón **"📤 Subir firmada"**; al elegir un PDF o una foto (JPG/PNG/HEIC, hasta 20MB) del documento ya firmado a mano, se guarda junto al registro original. Una vez subida, la fila muestra **"✅ Firmada"** con botones **Ver** (la abre en una pestaña nueva) y **Quitar** (la borra, sin tocar el PDF original generado por el sistema — se puede volver a subir después).
- **Permisos:** igual que para descargar el original — solo un admin o quien generó esa responsiva puede subir/ver/quitar su firmada.
- **Por qué:** el flujo real es generar el PDF en blanco desde el sistema, imprimirlo, firmarlo a mano, y luego escanearlo o tomarle foto — el usuario pidió una forma de guardar esa copia firmada junto al registro, en vez de tenerla suelta en otro lado.
- **Backend:** `ResponsivaArchive` ahora guarda también `signedFileData`/`signedFileName`/`signedFileMimeType`/`signedAt`/`signedByName`. Nuevas rutas en `responsivaArchive.js`: `POST /:id/signed` (sube, usa `multer` en memoria), `GET /:id/signed/download`, `DELETE /:id/signed`. El listado (`GET /`) sigue sin traer binarios pesados (excluye tanto `pdfData` como `signedFileData`).
- **Verificación:** contra el backend real — se generó una responsiva de prueba, se subió un PDF firmado de prueba, se confirmó que aparece en el listado, se descargó y se comparó byte a byte contra el original (idéntico), se probó que un usuario que no generó el documento recibe 403 al intentar subir/ver, y que el dueño sí puede. Se probó también en Chromium real: aparece el botón, sube el archivo, cambia a "✅ Firmada" con Ver/Quitar. Todos los registros de prueba se borraron de la base de producción al terminar.

### 2026-07-08 — Corrección: la Responsiva "formato anterior" no era fiel a la estructura real del Excel
- **Qué pasaba:** la primera versión (misma fecha, entrada de abajo) replicaba el texto/campos correctos pero con un layout **inventado** (tablas con caja en todos los campos, encabezado de una sola línea) — el usuario señaló que no respetaba "tal cual" el Excel como había pedido.
- **Qué se corrigió:** se revisó el Excel celda por celda (bordes, combinaciones de celdas, qué lleva caja y qué no) y se reconstruyó el PDF para igualar esa estructura real: **encabezado de 3 cajas** (logo de la empresa | título | clave + no. de revisión, con la razón social debajo del logo y la revisión debajo de la clave, igual que el Excel), **datos del empleado sin caja** — solo una línea de subrayado bajo cada valor (como el Excel, que tampoco los pone en tabla), **tabla con cuadrícula real de 4 columnas** (CARACTERÍSTICAS | DESCRIPCIÓN | SÍ | NO) para Equipos/Celular y de 2 columnas (Cantidad | Descripción) para Accesorios, y **cajas en blanco para firmar** (Entrega/Recibe/Autoriza) en vez de solo una línea. De paso, ahora usa el logo real de la empresa (ya lo teníamos en `pdfBranding.js`) en la caja donde el Excel intentaba poner uno (su fórmula de logo está rota en el original — "#VALUE!" — así que nunca se veía ahí).
- **Por qué:** el usuario reportó explícitamente que el resultado no respetaba el Excel tal cual, después de haberlo pedido dos veces.
- **Verificación:** se regeneraron los 3 formatos y se compararon visualmente contra la estructura real del Excel (celda por celda) — coinciden en qué lleva borde, qué lleva subrayado y qué no lleva nada. Se volvió a probar contra el backend real (laptop, celular y cable, activos y empleados reales existentes) — los 3 siguen generándose sin errores. Registros de prueba borrados del archivo de Responsivas al terminar.

### 2026-07-08 — Responsiva en el formato ANTERIOR (Excel), como opción junto a la nueva
- **Qué cambió:** al generar la Responsiva de un activo individual (botón "Responsiva" en la ficha del empleado, "Ver activos"), ahora primero pregunta **"Formato nuevo" o "Formato anterior"** antes de descargar — el usuario aclaró que RH todavía no autoriza usar la nueva por temas de políticas, así que Sistemas sigue necesitando la de siempre para algunos casos. La Responsiva nueva (y el botón "Responsiva completa", que combina todos los activos) **no se tocó en absoluto** — el formato anterior es código totalmente aparte, a propósito, para no arriesgar romper ninguna de las dos.
- **El formato anterior replica exactamente** (mismo texto legal, mismos campos, mismo orden, mismas claves de documento) los 3 Excel que compartió el usuario: **RESPONSIVA EQUIPOS** (`SS-IT-P-01-F01`, para laptop/escritorio/all-in-one/tablet — "Tipo/Marca/Modelo/Procesador/Serie/Cargador (CT)/Accesorios (Otros)"), **RESPONSIVA ACCESORIOS** (`SS-IT-P-01-F02`, para el resto de tipos — "Cantidad de Accesorios/Descripción"), y **RESPONSIVA CELULAR** (`SS-IT-P-02-F01`, para celulares — Marca/Modelo/Cargador/Audífonos/Otros/IMEI/Núm. de marcación/Correo Gmail; firma "JEFE DIRECTO" en vez de "JEFE INMEDIATO", igual que en el Excel original). Se elige automáticamente cuál de los 3 usar según el tipo del activo (tablet cae en Equipos, no en Celular, igual que en el Excel "Master" original). Un par de campos del Excel de Celular no existen en la base de datos hoy (número de marcación corto, costo del equipo) y se muestran como "—" en vez de inventarlos.
- **Razón social**: se usa el nombre corto de la empresa en los 3 formatos (igual que ya usan Equipos/Accesorios) — la tabla del Excel de Celular que relaciona nombre corto↔razón social larga no cuadraba fila por fila, así que se evitó adivinar cuál razón social larga corresponde a cada empresa en un documento oficial; el usuario confirmó esta simplificación.
- **Nuevo backend:** `backend/src/utils/responsivaLegacyPdf.js` (3 builders con estilo plano tipo Excel, sin el branding de color de la app) y `GET /api/responsiva/:employeeId/legacy?assetId=` en `responsiva.js` — se archiva igual que la nueva (marcado "(formato anterior)" en la etiqueta) para quedar en el historial de Responsivas.
- **Por qué:** el usuario explicó que aunque ya existe la Responsiva nueva en la app, RH todavía no las deja usar por políticas internas, y siguen trabajando hoy con estos 2 Excel (uno de equipo de cómputo/accesorios, otro de celulares) — pidió subirlos tal cual sin modificar el contenido, sin borrar la nueva, preguntando cuál usar cada vez.
- **Verificación:** contra el backend real (con activos y empleados reales existentes: una laptop, un celular y un cable) se generaron los 3 formatos y se revisaron visualmente contra el Excel original — texto, campos, claves de documento y roles de firma coinciden. Se probó también en un Chromium real que el modal de elección aparece al dar clic en "Responsiva" por activo. Los 4 registros de prueba que quedaron en el archivo de Responsivas se borraron al terminar.

### 2026-07-08 — Quitar "Tablet" duplicada en Accesorios de Solicitud de Ingreso; agregar "Otro"
- **Qué pasaba:** el usuario notó que "Tablet" aparecía tanto en la sección "Teléfono" (Celular/Tablet, correcto — es un tipo de equipo móvil) como en "Accesorios" (porque `ACCESSORY_TYPE_LABELS` en `config/assetFields.js` también incluye `tablet` como categoría de accesorio) — quedaba duplicada en dos secciones del mismo formulario.
- **Qué cambió:** se quitó "Tablet" de la lista de Accesorios (se queda solo en Teléfono); se agregó un campo **"Otro (especifica)"** en Accesorios para lo que no encaje en el checklist, con su propio campo `accessoryOther` en el modelo/ruta, y se muestra en la columna "Necesita" de la revisión.
- **Aclaración (no fue cambio):** Mouse/Teclado/Kit Teclado+Mouse no son redundantes — son categorías reales distintas ya registradas en Disponibilidad (a veces se entrega mouse o teclado sueltos, otras un kit combinado como un solo artículo de stock); se pueden marcar por separado o el kit, según lo que realmente se vaya a entregar.
- **Por qué:** el usuario reportó la duplicación de Tablet y preguntó si Mouse/Teclado/Kit debían ser mutuamente excluyentes.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: se envió una solicitud con accesorios + "Otro: Base para laptop" y se confirmó que ambos datos se guardaron correctamente (dato de prueba borrado al terminar). En un Chromium real se confirmó que "Tablet" ya no aparece en Accesorios (sigue en Teléfono) y que el campo "Otro" se muestra correctamente.

### 2026-07-08 — Se puede corregir el correo/usuario de una cuenta (Gmail/Plataformas/ERP)
- **Qué pasaba:** en el modal "Editar cuenta" de Cuentas Gmail, Cuentas de Plataformas y Cuentas de Plataformas ERP, el campo de correo/usuario aparecía siempre deshabilitado (`disabled`) — no había forma de corregir un correo mal escrito al capturarlo sin borrar la cuenta y volver a crearla.
- **Qué cambió:** ese campo ahora es editable en los tres módulos. Gmail sigue validando que termine en `@gmail.com` y que no choque con otra cuenta ya existente; Plataformas/ERP validan que no choque con otra cuenta de esa misma plataforma (el mismo usuario sí puede repetirse en plataformas distintas, como ya funcionaba al crear). Al corregir un correo de Gmail, también se actualiza `Employee.gmailAccounts[]` para que no quede el correo viejo con el typo colgado ahí. Queda registrado en Auditoría quién corrigió qué (de-a).
- **Por qué:** el usuario reportó que algunos correos se capturaron mal y no había manera de corregirlos.
- **Verificación:** contra el backend real (con un empleado real de prueba, todo borrado al terminar) — se creó una cuenta Gmail con typo, se corrigió, y se confirmó que `Employee.gmailAccounts` reemplazó el correo viejo por el corregido (no quedó duplicado ni residuo); se confirmó que sigue rechazando un correo que no termine en `@gmail.com`. En Plataformas se probó corregir el usuario de una cuenta real de Amazon y se confirmó que un segundo intento de dejarla igual a otra cuenta ya existente de esa misma plataforma se rechaza correctamente.

### 2026-07-08 — Telegram configurado y verificado en producción (sin cambios de código)
- **Qué se hizo:** se creó el bot real (@AssestsAvisos_bot), se armó el grupo "Avisos" en Telegram con el equipo de Sistemas, y se agregaron `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` tanto en el `.env` local como en las variables de entorno de Render (backend en producción). No hubo cambios de código en este paso — solo configuración/credenciales, ya que el código se había dejado listo el mismo día (ver entrada anterior).
- **Detalle del proceso:** el primer intento de sacar el `chat_id` del grupo no funcionaba porque el bot tenía el modo privacidad activado (`can_read_all_group_messages: false`) y no le llegaban los mensajes normales del grupo — se resolvió apagando "Group Privacy" desde @BotFather, tras lo cual sí se pudo leer el `chat_id` real del grupo (`-5381065146`) vía `getUpdates`.
- **Verificación:** se mandó un mensaje de prueba real al grupo "Avisos" (confirmado por el usuario que llegó) y se probó el flujo completo contra el backend de **producción** en Render (no local): se envió una Solicitud de Ingreso de prueba a `https://assets-manager-backend.onrender.com/api/onboarding-requests/public` y se confirmó la llegada del aviso al grupo real. Dato de prueba borrado de la base de producción al terminar.

### 2026-07-08 — Aviso a Telegram cuando llega una Solicitud (de Cuentas o de Ingreso)
- **Qué cambió:** nuevo `backend/src/utils/telegram.js` (`notifyTelegram`) que manda un mensaje a un grupo/chat de Telegram vía la API HTTP del bot (`sendMessage`), sin ninguna librería nueva. Se conectó en `POST /account-requests/public` (un mensaje por envío, resumiendo persona + tipo(s) de cuenta pedidos) y en `POST /onboarding-requests/public` (persona, puesto, y qué necesita). Es **best-effort**: si falla o si `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` no están configuradas, no rompe nada — la solicitud se guarda igual, solo no se manda el aviso (se probó ambos casos contra el backend real).
- **Por qué:** el usuario pidió conectar las notificaciones de ambas Solicitudes a algo más inmediato que entrar a revisar la página — se comparó Telegram vs. WhatsApp Business API vs. correo por Azure/Graph, y Telegram ganó por ser lo más simple de conectar (un bot con @BotFather + una llamada HTTP, sin verificación de negocio ni aprobación de plantillas).
- **Pendiente:** falta crear el bot y darme el `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID` (instrucciones en la respuesta del chat) y agregarlas en Render — sin eso, el código ya está listo pero no manda nada todavía.
- **Verificación:** `npx vite build`/sintaxis backend sin errores. Contra el backend real, sin las variables configuradas: se envió una Solicitud de Ingreso de prueba y se confirmó que sigue respondiendo 201 normal (el aviso se omite en silencio). Dato de prueba borrado al terminar.

### 2026-07-08 — Fix: faltaba el botón "Eliminar" en Solicitudes de Cuentas
- **Qué pasaba:** el usuario reportó no ver ningún botón de eliminar en "Solicitudes" (Solicitudes de Cuentas, `/account-requests`) — al revisar el código se confirmó que nunca se agregó ese botón ahí, aunque la ruta de backend `DELETE /api/account-requests/:id` ya existía desde que se construyó el módulo. Sí se había agregado correctamente en la página distinta "Ingresos RH" (Solicitud de Ingreso), lo cual generó la confusión.
- **Qué cambió:** se agregó el botón "Eliminar" en la tabla de `AccountRequests.jsx`, con confirmación, visible para quien administre el tipo de cuenta de esa solicitud (mismo criterio de permiso que ya usan Aprobar/Rechazar/PDF).
- **Por qué:** el usuario esperaba poder borrar solicitudes de prueba/erróneas ahí, igual que ya podía en Ingresos RH.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: se creó una solicitud de prueba real (Gmail, con un empleado real existente), se confirmó que aparecía en pendientes, se eliminó con la ruta y se confirmó que ya no aparece en la lista.

### 2026-07-08 — Ingresos RH conectado con Disponibilidad; se quitó "Kit de bienvenida"
- **Qué cambió (conectar con Disponibilidad):** en **Ingresos RH**, cada solicitud ya aprobada (con empleado creado) que haya pedido computadora, teléfono o accesorios ahora tiene un botón **"🔗 Asignar equipo"**. Abre un modal que busca, para cada tipo que se marcó en la solicitud (ej. "Laptop", "Celular", "Monitor"), lo que **realmente está disponible ahorita en Disponibilidad** (mismo dato que `/assets?status=disponible`) y deja asignarlo al nuevo empleado con un clic (mismo mecanismo de asignación que ya usa Disponibilidad/Activos — `POST /assignments`). No hace falta ir a buscarlo aparte ni cruzar manualmente qué se pidió contra qué hay libre.
- **Qué se quitó:** el checkbox "🎁 Kit de bienvenida" — se quitó del formulario público, del modelo, de la ruta y de la columna "Necesita" en la revisión. El usuario aclaró que eso es responsabilidad de RH, no de Sistemas.
- **Hallazgo aparte (no relacionado, se deja documentado):** al probar la asignación contra datos reales se encontró que la laptop LENOVO ThinkPad T14 (no. de serie PF61LNY2) tiene una asignación activa a Ashanty Yocelin Contla Veloz en `Assignment`, pero su campo `Asset.status` sigue en `disponible` — la misma clase de inconsistencia que ya se había corregido antes en sentido inverso (asignaciones huérfanas), aquí es un activo "fantasma disponible" que en realidad ya tiene dueño. No se tocó nada de este registro; queda pendiente decidir si se corrige.
- **Por qué:** el usuario pidió conectar la revisión de ingresos con Disponibilidad para poder asignar directo lo que se pidió, y quitar el kit de bienvenida por no ser tema de Sistemas.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: se creó y aprobó una solicitud de ingreso pidiendo "Laptop", se detectó que la primera laptop "disponible" encontrada en realidad ya tenía dueño (el hallazgo de arriba), se usó una laptop genuinamente libre y se confirmó la asignación real (el activo pasó a `asignado`); se desasignó, se confirmó que regresó a `disponible`, y se borraron la solicitud/empleado/asignación de prueba.

### 2026-07-08 — Equipo/Teléfono/Accesorios en Solicitud de Ingreso: seleccionar, no texto libre; se puede eliminar solicitudes
- **Qué cambió (selección en vez de texto libre):** en `/solicitar-ingreso`, "Teléfono", "Computadora" y "Accesorios" dejaron de tener un campo de texto libre ("Gama, plan...", "Laptop, escritorio...", "Mouse, teclado...") — ahora cada uno muestra un checklist con los tipos que **ya existen registrados en la aplicación** (`ASSET_TYPE_LABELS`/`ACCESSORY_TYPE_LABELS` de `config/assetFields.js`, los mismos que usan Activos/Accesorios): Teléfono → Celular/Tablet; Computadora → Laptop/Escritorio/All-in-One; Accesorios → los 13 tipos de accesorio existentes (Monitor, Mouse, Teclado, Kit Teclado+Mouse, Audífonos, Webcam, Hub USB, Cable, Consumible, Herramienta, Disco Duro/SSD, Adaptador, Accesorio). El modelo cambió de `computerNotes`/`phoneNotes`/`accessoriesNotes` (texto) a `computerTypes`/`phoneTypes`/`accessoryTypes` (arreglos de selección múltiple); la columna "Necesita" en la revisión ahora muestra los tipos elegidos entre paréntesis.
- **Qué cambió (eliminar solicitudes):** nuevo botón "Eliminar" en **Ingresos RH**, disponible para cualquier solicitud sin importar su estado (pendiente/aprobada/rechazada), con confirmación — usa la ruta `DELETE /api/onboarding-requests/:id` que ya existía en el backend pero no tenía botón en la interfaz.
- **Por qué:** el usuario pidió que Teléfono fuera de selección (no texto libre), y que Equipo/Accesorios mostraran las opciones que ya existen en la aplicación en vez de que RH tenga que escribirlas; también pidió poder borrar solicitudes.
- **Verificación:** `npx vite build` sin errores. Se probó en un Chromium real: marcar Computadora/Teléfono/Accesorios y seleccionar Laptop, Celular, Monitor y Mouse; se confirmó contra la base real que la solicitud creada trae exactamente esos valores en `computerTypes`/`phoneTypes`/`accessoryTypes`, y que `DELETE /:id` la elimina correctamente.

### 2026-07-08 — "Quién solicita" en Solicitud de Ingreso también se autocompleta contra Empleados
- **Qué cambió:** en `/solicitar-ingreso`, el campo "Tu nombre" (sección 4, quién de RH llena el formulario) ahora busca en tiempo real contra Empleados (mismo endpoint público `GET /employees/public-lookup`, ya usado para el solicitante en Solicitud de Cuentas) y, al elegir un resultado, autorellena su correo corporativo — el campo "Tu correo" se quitó de la vista, ya no hay que capturarlo a mano. Se agregó `corporateEmails` a los campos que devuelve esa búsqueda pública (antes solo traía puesto/área/teléfono/empresa/oficina).
- **Por qué:** el usuario señaló que todo el personal de RH ya está registrado como empleado en el sistema, así que no tenía sentido pedirles su nombre/correo a mano cuando ya se puede jalar de la base, igual que ya se hacía con el solicitante en Solicitud de Cuentas.
- **Verificación:** contra el backend real — se buscó "bruno" y encontró a Bruno Castañeda Rovira con su correo corporativo real; se completó y envió el formulario en un Chromium real seleccionando ese resultado, y se confirmó en la base que la solicitud creada trae `requestedByEmail: gerente.sistemas@selectshop.com.mx` sin haberlo escrito a mano. Solicitud de prueba borrada al terminar.

### 2026-07-08 — Nueva página pública "Solicitud de Ingreso de Personal" para RH
- **Qué cambió:** nueva página pública **`/solicitar-ingreso`** (sin login, sin sidebar, mismo patrón que Solicitud de Cuentas) para que RH avise un ingreso nuevo — reemplaza el correo manual que mandaban a Sistemas (compartido como ejemplo: "Especialista en métodos y procesos: Computadora SI / Teléfono SI / Kit de bienvenida SI / Si correo"). El formulario pide: datos del nuevo ingreso (nombre, puesto, área/departamento, empresa, oficina, jefe directo, fecha de ingreso), si necesita correo corporativo y **cómo quieren que quede** (ej. "metodosyprocedimientos@selectshop.com.mx", con nota de que es solo sugerencia), y si necesita computadora/teléfono/accesorios/kit de bienvenida (cada uno con notas de tipo/especificaciones si aplica).
- **Revisión (admin) y alta real del empleado:** nueva página **"Ingresos RH"** (`/onboarding-requests`, solo admin — a diferencia de Solicitudes de Cuentas, que se reparte por permiso de Gmail/Plataformas/ERP, esta es de alta de personal así que se dejó admin-only) que lista pendientes/aprobadas/rechazadas. "Aprobar" abre un modal para confirmar/corregir todos los datos — incluyendo el **no. de empleado**, que RH no siempre trae — y crea el `Employee` real (con el correo sugerido guardado en `corporateEmails`); "Rechazar" solo lo marca sin crear nada. Igual que Solicitudes de Cuentas: nunca se crea nada automático, siempre pasa por revisión manual.
- **Nuevo modelo/rutas:** `OnboardingRequest` (`backend/src/models/OnboardingRequest.js`), `backend/src/routes/onboardingRequests.js` (`POST /public` sin auth con honeypot+límite por IP, `GET /`, `PUT /:id/approve`, `PUT /:id/reject`, `DELETE /:id`, todas admin-only salvo la pública).
- **Por qué:** el usuario compartió el correo real que manda RH avisando ingresos nuevos y pidió una página igual a la de Solicitud de Cuentas pero para esto — especificando que quería el formato de correo deseado (con la lógica de que el puesto define el nombre, ej. "metodosyprocedimientos@..."), qué equipo/teléfono/accesorios necesita el nuevo ingreso, y los datos para darlo de alta en el sistema.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: se envió una solicitud de ingreso de prueba completa (equipo, teléfono, kit, correo sugerido), apareció en pendientes, se aprobó capturando un no. de empleado y se confirmó que el `Employee` real se creó con el correo corporativo correcto en `corporateEmails`. Se probó también el formulario público en un Chromium real — las secciones de computadora/correo aparecen solo al marcar la casilla correspondiente, sin errores de consola. Solicitud y empleado de prueba borrados al terminar.

### 2026-07-08 — Se quitan los campos de teléfono de la Solicitud (los resuelve Sistemas, no quien la llena)
- **Qué cambió:** se quitó "Teléfono de recuperación" de la sección de Gmail del formulario público y del PDF, y se quitó "Teléfono / Ext." de la sección "Datos del solicitante" del PDF (ese dato ya se auto-rellenaba desde Empleados sin mostrarse, pero seguía imprimiéndose en el documento). El campo `gmailRecoveryPhone` se eliminó del modelo `AccountRequest`, de la ruta pública y del generador de PDF.
- **Por qué:** el usuario indicó que la parte del teléfono la resuelve Sistemas directamente, no algo que se le deba pedir a quien llena la solicitud ni mostrar en el documento.
- **Verificación:** `npx vite build` sin errores. Se generó un PDF de prueba con marca temporal en ambos campos (teléfono de recuperación y teléfono general) y se confirmó que ninguno de los dos aparece ya en el documento.

### 2026-07-08 — La Responsiva se precarga con los datos de la Solicitud aprobada (Gmail/Plataformas/ERP)
- **Qué cambió:** cuando una cuenta se creó al aprobar una Solicitud pública, el modal de "📄 Responsiva" (en Cuentas Gmail, Cuentas de Plataformas y Cuentas de Plataformas ERP) ya no abre en blanco — se precarga con lo que esa persona puso en su solicitud: jefe directo y vigencia siempre; en Plataformas además tienda/cuenta y un "rol de acceso" armado a partir de los permisos que marcó (ej. "Ventas al detalle, Publicaciones"); en ERP además empresas del grupo, módulos, nivel de acceso, tipo de solicitud y uso en plataformas. Todo sigue siendo editable — quien genera la Responsiva puede corregir cualquier campo antes de descargarla, igual que antes.
- **Cuándo NO se precarga:** si la cuenta se dio de alta a mano (sin pasar por una Solicitud) o si la Solicitud original no traía ese dato, el campo se queda en blanco como siempre — no se inventa ni se copia nada de otra cuenta.
- **Nuevo backend:** `GET /api/gmail-accounts/:id/request-defaults`, `GET /api/platform-accounts/:id/request-defaults` y `GET /api/platform-accounts-erp/:id/request-defaults` — buscan la `AccountRequest` aprobada que generó esa cuenta específica (`createdAccountId`) y devuelven solo los campos relevantes; no modifican nada.
- **Por qué:** el usuario preguntó si tenía sentido que lo llenado en la Solicitud se autorellenara en la Responsiva en vez de volver a capturarlo — confirmó que sí, siempre que quedara editable (a diferencia de una decisión anterior donde se quitó a propósito que la Responsiva "recordara" el último valor usado, por el riesgo de mezclar datos de otra persona; aquí es distinto porque el dato viene de la solicitud de esa cuenta en particular, no de un caché genérico).
- **Verificación:** contra el backend real — se creó una Solicitud ERP de prueba con datos específicos (jefe directo, empresas del grupo, módulos, nivel de acceso, vigencia, uso en plataformas), se aprobó (creando la cuenta real), y se confirmó que `GET .../request-defaults` de esa cuenta devuelve exactamente esos mismos datos. Solicitud y cuenta de prueba borradas al terminar.

### 2026-07-08 — Quitar "Business Intelligence" del PDF de la Solicitud
- **Qué cambió:** el PDF de Solicitud de Cuentas (`backend/src/utils/accountRequestPdf.js`) mencionaba "Área de Sistemas IT & Business Intelligence" en el encabezado y en el pie de página — se quitó, queda solo "Área de Sistemas" / "Uso interno — Sistemas". No se tocó el mismo texto en las Responsivas reales (`gmailAccounts.js`, `platformAccounts.js`, `platformAccountsErp.js`), porque el usuario pidió el cambio específicamente en la Solicitud.
- **Por qué:** el usuario aclaró que ese trámite lo lleva solo el área de Sistemas, no "Business Intelligence".
- **Verificación:** se generó un PDF real de prueba y se confirmó visualmente que ya no aparece "Business" en ningún lado del documento.

### 2026-07-08 — Fix: los botones de Aprobar/Rechazar (y secciones de cuentas) no aparecían recién iniciada la sesión
- **Qué pasaba:** el usuario reportó que en "Solicitudes de Cuentas" veía la lista de pendientes pero no le dejaba hacer nada con ellas — sin botones de Aprobar/Rechazar. La causa: `AccountRequests.jsx` (y también `Stock.jsx` y `EmployeeDetail.jsx`) leían `localStorage.getItem('user')` en una constante **a nivel de módulo** (`const currentUser = ...` fuera del componente), que solo se ejecuta **una vez**, cuando el navegador carga el bundle de JavaScript por primera vez — normalmente antes de haber iniciado sesión, cuando `localStorage` todavía está vacío. Como iniciar sesión no recarga la página (React Router navega del lado del cliente), esa constante se quedaba pegada para siempre en `{}` durante toda la sesión, aunque el login sí hubiera guardado los permisos reales — por eso ningún botón que dependiera de `currentUser.canManageX` aparecía hasta refrescar la página a fuerzas (F5).
- **Qué cambió:** en los tres archivos, esa lectura se movió de nivel de módulo a la primera línea de la función del componente, para que se vuelva a evaluar cada vez que se visita la página (con el `localStorage` ya actualizado por el login).
- **Por qué:** el usuario probó el flujo real después de iniciar sesión y no podía aprobar/rechazar ninguna solicitud pendiente, aunque sí las veía listadas.
- **Verificación:** `npx vite build` sin errores. Se reprodujo el bug exacto en un Chromium real (Playwright): cargar la página sin sesión, simular un login sin recargar (igual que hace `Login.jsx`) y navegar del lado del cliente a Solicitudes — con el fix, el botón "Aprobar" aparece correctamente en ese mismo escenario.
- **Aparte:** se confirmó y borró de la base real la solicitud de prueba "Miguel Garcia Ramos" (Gmail, pendiente) a petición del usuario — no se tocaron las otras 2 pendientes (Jesús Eduardo Marquez Gonzalez y Lilly Estefany Arroyo Huerta) porque no se pidió borrarlas.

### 2026-07-08 — El PDF de la Solicitud ya no se ve igual que la Responsiva
- **Qué pasaba:** el PDF que se genera al enviar el formulario de Solicitud de Cuentas (`backend/src/utils/accountRequestPdf.js`) reutilizaba exactamente el mismo lenguaje visual que la Responsiva real (título centrado en color sólido, franjas de color detrás de cada encabezado de sección, cláusulas de obligaciones numeradas con fondo alternado tipo Responsiva) — el usuario notó que se veían prácticamente idénticos.
- **Qué cambió:** la Solicitud ahora tiene su propio layout, más ligero — badge "SOLICITUD" en contorno (no relleno), título en gris oscuro (no en el color de acento), líneas delgadas debajo de cada encabezado de sección en vez de franjas de color sólido, aviso en cursiva de "Pendiente de revisión — la Responsiva correspondiente se genera y firma al aprobarse esta solicitud", y la sección de obligaciones se condensó a un solo párrafo breve (sin viñetas ni franjas alternadas) que menciona el mismo fundamento legal (LFT Arts. 134/135/47, LFPDPPP, Código Penal Federal Art. 211 Bis 1) pero sin el énfasis/formalidad de la Responsiva — remite a que el detalle completo se formaliza ahí. La sección de aceptación electrónica también se simplificó (ya no lleva el recuadro con franja de color). El color de acento y logo por empresa (misma colorimetría) se mantienen igual que en la Responsiva — no se tocó `pdfBranding.js`, que sigue siendo el que usan las Responsivas reales.
- **Por qué:** el usuario pidió que la Solicitud y la Responsiva no se vieran "igualitas" — que compartieran la colorimetría de marca, pero que la Solicitud mencionara las mismas obligaciones/fundamento legal sin el mismo énfasis formal que sí debe tener la Responsiva.
- **Verificación:** se generó un PDF real de prueba (tipo ERP) y se revisó visualmente — badge de contorno, títulos oscuros, líneas delgadas, párrafo único de obligaciones, todo con el acento de Select Shop MB. Contra el backend real se envió una solicitud con los 3 tipos (Gmail, Plataformas, ERP) y los 3 PDFs se generaron sin errores; datos de prueba borrados al terminar.

### 2026-07-07 — El formulario público exige que el nombre exista en Empleados (frontend y backend)
- **Qué pasaba:** el campo "Nombre completo" del formulario de Solicitud de Cuentas dejaba enviar cualquier texto, incluso si no coincidía con nadie en el autocompletado — solo era una sugerencia, no una validación.
- **Qué cambió:** ahora es obligatorio elegir un nombre de la lista de sugerencias (que sale de `Employee`, empleados activos) para poder enviar la solicitud. Si se escribe un nombre y no aparece nadie en el buscador, se muestra un aviso ("No encontramos a nadie con ese nombre...") y el botón de enviar lo rechaza con el mismo mensaje hasta que se seleccione una coincidencia real. Se agregó la misma validación en el backend (`POST /api/account-requests/public` ahora busca el nombre exacto, sin distinguir mayúsculas, contra empleados activos y responde 400 si no existe) — por si alguien llama la ruta directo sin pasar por el formulario.
- **Por qué:** el usuario pidió confirmar que el nombre capturado sí exista en la base de empleados en vez de aceptar cualquier texto.
- **Verificación:** `npx vite build` sin errores. Contra el backend real: una llamada directa con un nombre inventado devolvió 400 con el mensaje esperado. En un Chromium real (Playwright): escribir un nombre inexistente mostró el aviso y bloqueó el envío (se quedó en el formulario); seleccionar a una empleada real de la lista sí permitió enviar la solicitud normalmente. Solicitud de prueba creada y borrada al terminar.

### 2026-07-07 — Visitar el sitio sin sesión ya no invita a iniciar sesión — muestra un 404 genérico
- **Qué cambió:** antes, cualquier ruta privada (empezando por la raíz `/`) visitada sin sesión redirigía a `/login`, mostrando el formulario de inicio de sesión — así, alguien que llegara al link público de `/solicitar-cuenta` y le borrara esa parte de la URL por curiosidad se encontraba con el login real del sistema interno. Ahora `PrivateRoute` muestra un 404 genérico (`NotFound.jsx`) en vez de redirigir a `/login`; también se agregó una ruta catch-all (`*`) para cualquier URL que no exista. `/login` y `/solicitar-cuenta` siguen funcionando exactamente igual si se entra directo a esa dirección.
- **Por qué:** el usuario notó que quitar `/solicitar-cuenta` de la URL revelaba el login del sistema y pidió que en vez de eso diera una página de "no encontrado", para no delatar que ahí vive una aplicación interna a quien solo esté curioseando el link.
- **Nota operativa:** quien ya usa la app con sesión iniciada no nota ningún cambio; para volver a entrar después de cerrar sesión (o en un dispositivo nuevo) hay que ir directo a `/login` — la raíz del sitio ya no ofrece esa invitación.
- **Verificación:** `npx vite build` sin errores. Probado en un Chromium real (Playwright): visitar la raíz sin token muestra el 404 (sin rastro del formulario de login), una ruta inventada también muestra 404, y tanto `/login` como `/solicitar-cuenta` entrando directo siguen funcionando sin cambios.

### 2026-07-07 — Formulario público de Solicitud de Cuentas: autocompletar por nombre, campos ocultos, y ajustes de contenido
- **Qué cambió (autocompletar sin mostrar datos):** el campo "Nombre completo" ahora busca en tiempo real contra `Employee` (nuevo endpoint público `GET /api/employees/public-lookup?q=`, sin JWT, solo empleados activos, mínimo 3 caracteres, máx. 8 resultados, límite de 20 búsquedas/minuto por IP) y, al elegir un resultado, rellena en automático puesto/área-departamento/teléfono/empresa/no. de empleado — pero esos campos ya **no se muestran** en el formulario; solo aparece una confirmación ("✓ Te encontramos en el sistema"). Si la persona no aparece en el buscador (ej. de alta muy reciente), esos datos simplemente quedan vacíos y Sistemas los completa al revisar.
- **Qué se quitó:** los campos "Correo actual", "Tu correo (para avisarte)" y "Tipo de solicitud" (alta/modificación/baja) — este último ahora siempre se manda como `alta` fijo, ya no se pregunta.
- **Qué cambió (Gmail sugerido):** el campo "Correo solicitado" ahora se autocompleta con una sugerencia (`nombre.apellido@gmail.com`, sin acentos) en cuanto se marca la casilla de Gmail, editable, con la nota "Es solo una referencia — puede quedar así o puede que Google ya lo tenga ocupado; Sistemas confirma el correo final."
- **Qué cambió ("Perfil de referencia" → "Accesos"):** ese campo (antes "usuario con permisos similares") ahora pregunta directamente "Accesos — ¿para qué vas a utilizar estas cuentas en las plataformas?" — la etiqueta del PDF también se actualizó a "Uso en plataformas".
- **Por qué:** el usuario probó el formulario ya en producción y pidió que buscara al empleado por nombre y rellenara sus datos solo, sin mostrárselos a quien llena el formulario (para no alargar la vista ni pedirle datos que el sistema ya tiene); quitar los dos campos de correo y el tipo de solicitud (siempre son altas); cambiar "perfil de referencia" por una pregunta de uso real; y sugerir el correo de Gmail dejando claro que no es definitivo.
- **Verificación:** `npx vite build` sin errores. Contra la base real (solo lectura para la búsqueda; solicitud de prueba creada y borrada al terminar): se probó de principio a fin en un Chromium real (Playwright) — buscar "monica priego" encontró a la empleada real, seleccionarla mostró solo la confirmación (sin exponer ningún valor de puesto/depto/teléfono en ningún input visible), la sugerencia de Gmail generada fue `monica.becerra@gmail.com`, la nota de "puede que Google ya lo tenga ocupado" se mostró, la etiqueta "Accesos" reemplazó a "Perfil de referencia", y los campos quitados ya no aparecen en ningún lado del formulario.

### 2026-07-07 — Formulario público de Solicitud de Cuentas y Accesos (sin login) + módulo de revisión con PDF y fundamento legal
- **Qué cambió:** nueva página pública **`/solicitar-cuenta`** (`SolicitarCuenta.jsx`, sin sidebar ni login, fuera del `Layout`/`PrivateRoute`) para que cualquier persona de la empresa pida cuentas/accesos sin tener usuario en el sistema. Está basada en el formato real que compartió el usuario (`Solicitud_Cuentas_y_Accesos_Unificada.docx`), pero acortado y **dinámico**: solo se marca qué se necesita (Gmail / Plataformas de venta / ERP) y únicamente aparece la sección correspondiente — a diferencia del documento original, que mostraba las tres secciones completas siempre.
- **Aislamiento entre ERP y el resto (petición explícita del usuario):** si se marca más de un tipo a la vez (ej. Gmail + ERP), el backend crea **un `AccountRequest` por tipo**, cada uno solo con los datos de su propia sección — un revisor de ERP nunca ve la parte de Gmail/Plataformas de esa misma solicitud, y viceversa. Reutiliza el mismo filtro por permiso (`canManageGmailAccounts`/`canManagePlatformAccounts`/`canManagePlatformAccountsErp`) que ya aislaba la lista de "Solicitudes de Cuentas".
- **Se guarda el PDF, como las Responsivas:** al enviar el formulario se genera y guarda (en Mongo, no en disco — Render no persiste el filesystem) un PDF por cada solicitud creada, con el mismo estilo visual que las Responsivas existentes (`backend/src/utils/accountRequestPdf.js`, reutiliza `pdfBranding.js`). Nuevo botón "⬇ PDF" en **Solicitudes de Cuentas** (`AccountRequests.jsx`) para descargarlo, protegido por el mismo permiso por tipo — `GET /api/account-requests/:id/pdf`.
- **Fundamento legal agregado:** la sección de obligaciones de cada PDF y del formulario cita explícitamente Ley Federal del Trabajo Art. 134 Fracc. I/IV/XIII (cumplir normas, ejecutar el trabajo con cuidado, guardar secretos comerciales/administrativos), Art. 135 Fracc. IX (prohibición de usar los accesos para fines distintos) y Art. 47 Fracc. II/IX (causal de rescisión sin responsabilidad patronal por revelar información reservada); además Ley Federal de Protección de Datos Personales en Posesión de los Particulares (datos de clientes/colaboradores) y Código Penal Federal Art. 211 Bis 1 (acceso ilícito a sistemas informáticos). Como es un formulario en línea sin firma autógrafa, se agregó una sección de "Aceptación electrónica" (checkbox + nombre + fecha/hora) fundamentada en los Arts. 89 y 97 del Código de Comercio (mensaje de datos con la misma validez que una firma).
- **Antiabuso sin secretos en el frontend:** la ruta pública (`POST /api/account-requests/public`) no usa el secreto compartido que ya tenía el webhook de Power Automate (`POST /webhook`, se deja intacto y sin usar por ahora) — un secreto en el código del navegador es visible para cualquiera. En su lugar: límite de 8 solicitudes por IP cada 15 minutos (en memoria) y un campo trampa (honeypot) invisible que los bots suelen llenar. Se agregó `app.set('trust proxy', 1)` en `index.js` para que `req.ip` refleje la IP real del visitante detrás del proxy de Render.
- **Backend reordenado para reutilizar la misma lógica de alta:** `gmailAccounts.js`, `platformAccounts.js` y `platformAccountsErp.js` ahora llaman a `backend/src/utils/createAccount.js` (`createGmailAccount`/`createPlatformAccount`/`createPlatformErpAccount`) en vez de duplicar la lógica de alta inline — la misma función la usa tanto el alta manual de siempre como la aprobación de una solicitud (`PUT /account-requests/:id/approve`), que sigue sin crear nada automático: cada solicitud se revisa y se empareja a mano con el empleado real antes de generar la cuenta.
- **Por qué:** el usuario preguntó si se podía dar un link de un formulario "que sea básicamente la misma página sin que lo sepan" en vez de depender de Microsoft Forms/Power Automate — se optó por una página pública nativa dentro de la misma app (más simple, sin dependencia externa). Después compartió el formato real usado por la empresa y pidió: acortarlo/hacerlo dinámico por tipo, que ERP quede separado del resto, que el PDF se archive como las Responsivas, y agregar fundamento legal de la LFT y argumentos legales de México/CDMX.
- **Verificación:** `npx vite build` sin errores. Contra la base real (datos de prueba creados y borrados al terminar): se envió una solicitud con Gmail+Plataformas+ERP a la vez y se confirmó que se crearon 3 documentos separados; un usuario con solo permiso ERP recibió 403 al pedir el PDF de la solicitud de Gmail, solo vio el tipo ERP en su lista, y sí pudo descargar su propio PDF. Se revisó visualmente el PDF generado (logo, secciones, fundamento legal, sin fuga de datos de otros tipos). Se probó el formulario público de principio a fin en un Chromium real (Playwright): sin sidebar/login visible, las secciones de Gmail/ERP aparecen y desaparecen correctamente al marcar/desmarcar las casillas, envío exitoso con folios, sin errores de consola.

### 2026-07-07 — Corrección del fix anterior: no borrar `freedFromEmployee` sin una reasignación real; se restauró el dato de un activo
- **Qué pasó:** el cambio anterior (mismo día) limpiaba `freedFromEmployee` en cuanto el `status` del activo dejaba de ser `disponible` por `PUT /assets/:id`, sin verificar que existiera una asignación real a un empleado nuevo. El usuario había cambiado el Estado del Motorola de Arandy a "Asignado" por error (sin asignarlo a nadie realmente) y luego lo regresó a "Disponible" — pero como el fix anterior ya le había borrado `freedFromEmployee` en el camino (al verificar ese fix se hizo un `PUT` real sobre ese mismo activo), la sección "Liberado por salida de personal" ya no lo mostraba, y regresarlo a disponible no lo trajo de vuelta porque el dato ya no existía.
- **Qué cambió:** `PUT /api/assets/:id` ahora solo limpia `freedFromEmployee` si de verdad existe una `Assignment` activa para ese activo (es decir, si en efecto quedó asignado a un empleado) — un simple cambio de "Estado" a mano sin asignación real ya no borra el dato.
- **Dato restaurado:** se regresó `freedFromEmployee` (nombre, puesto, sucursal, fecha original) al Motorola MOTO G04 de Arandy Itzel Onofre Mendoza, que había quedado sin ese dato por el fix anterior. Vuelve a aparecer en "Liberado por salida de personal" con su línea 5521091242.
- **Por qué:** el usuario reportó que, tras corregir el Estado a mano, el equipo seguía sin aparecer en Disponibilidad — el fix del cambio anterior era demasiado agresivo y borró un dato válido sin que hubiera pasado una reasignación real.
- **Verificación:** contra la base real — se confirmó que el activo no tenía ninguna `Assignment` activa (0 asignaciones), se restauró el campo con los valores exactos que se habían capturado antes de borrarlo, y se confirmó que la sección vuelve a mostrar los 4 activos liberados esperados.

### 2026-07-07 — `PUT /assets/:id` no limpiaba `freedFromEmployee` al reasignar editando el activo a mano
- **Qué pasaba:** el usuario preguntó por qué la sección "Liberado por salida de personal" de Disponibilidad mostraba 3 y no los 4 que esperaba. Se confirmó contra la base real que sí eran 4 originalmente, pero uno (el Motorola de Arandy Itzel Onofre Mendoza) ya se había reasignado — su `status` pasó de `disponible` a `asignado`, así que desaparecer de esa lista era el comportamiento correcto. Al investigar se encontró que esa reasignación se hizo editando el activo directamente (cambiando "Estado" a mano en el modal de Activos) en vez de usar el flujo de "Asignar" — `POST /assignments` sí limpia `freedFromEmployee` al asignar (`$unset`), pero `PUT /assets/:id` nunca lo hacía, así que ese registro se quedó con la etiqueta "liberado de Arandy" aunque ya no aplicaba. No causaba nada visible mientras el activo siguiera `asignado` (la sección solo muestra `disponible`), pero habría mostrado datos incorrectos si ese activo volvía a `disponible` por otra vía que tampoco limpiara el campo.
- **Qué cambió:** `PUT /api/assets/:id` ahora limpia `freedFromEmployee` en cuanto el `status` deja de ser `disponible`, sin importar por qué ruta se edite (mismo criterio que ya aplicaba `POST /assignments`).
- **Por qué:** para que la etiqueta de "de dónde vino" nunca quede obsoleta, sin importar si el activo se reasigna por el flujo de asignación o editándolo directamente.
- **Verificación:** contra la base real — se confirmó el registro afectado (Motorola de Arandy, `status: asignado` con `freedFromEmployee` aún seteado), se reprodujo el fix con un `PUT` real (antes: seguía con el campo viejo; después del fix: `freedFromEmployee: undefined`), y se dejó ese registro limpio. El conteo de la sección (3 disponibles) se confirmó correcto y sin cambios — el fix solo evita que se repita a futuro.

### 2026-07-07 — La columna "Datos" de equipo liberado muestra no. de serie o teléfono, no el contrato
- **Qué cambió:** en la sección "Liberado por salida de personal" de Disponibilidad, la columna "Datos" mostraba línea telefónica, IMEI **y** no. de contrato para cualquier tipo de equipo. Ahora es específico por tipo: para celulares/tablets muestra línea telefónica e IMEI (sin contrato); para cómputo y el resto (laptops, escritorios, accesorios, etc.) muestra el **no. de serie** — el contrato ya no aparece ahí, porque para decidir a quién reasignar un equipo importa más su serie o su número que el contrato.
- **Por qué:** el usuario indicó que ver el no. de contrato ahí no le servía para las computadoras — prefiere no. de serie (o teléfono en el caso de celulares); para accesorios, la marca/modelo (que ya se muestra en la columna "Artículo") es suficiente.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-07 — Renombrado "Bajas de personal" en Disponibilidad para no confundirse con activos "de baja"
- **Qué pasaba:** la sección de Disponibilidad que muestra equipo liberado por salida de un empleado se llamaba "Bajas de personal" — el usuario notó que el KPI "De baja" del Dashboard (activos con `status: 'baja'`, es decir, equipo dado de baja/desechado) siempre da 0 porque nunca marca un activo así, y le pareció inconsistente que apareciera una sección de "Bajas" con datos en Disponibilidad. En realidad son dos conceptos sin relación que comparten la palabra "baja": el estado del **activo** (`baja` = desechado) vs. que un **empleado** se dio de baja (dejó la empresa) y liberó su equipo, que sigue contando como `disponible`, no como `baja`. No había ningún bug de datos — el 0 del Dashboard y el conteo de esta sección miden cosas distintas.
- **Qué cambió:** la sección se renombró a "🔁 Liberado por salida de personal" con una nota aclaratoria debajo ("Este equipo está disponible (no 'de baja')..."); se actualizó también el texto de confirmación al dar de baja a un empleado en Empleados, que mencionaba el nombre viejo de la sección.
- **Por qué:** el usuario preguntó por qué "Bajas" aparecía en Disponibilidad si el Dashboard mostraba 0 "de baja" — la reutilización de la palabra "baja" para dos cosas distintas (activo desechado vs. empleado que se fue) era genuinamente confusa.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-07 — Búsqueda por palabras (no por campo único) en Empleados/Activos/Accesorios/Asignaciones; búsqueda nueva en Disponibilidad; número de línea visible en "Bajas de personal"
- **Qué pasaba (búsqueda de un solo campo):** todas las búsquedas comparaban el texto completo escrito contra un campo a la vez (`campo.includes(query)`) — si el dato buscado venía repartido en dos campos (ej. escribir "motorola 5521091242" para buscar por marca y por línea telefónica al mismo tiempo), no encontraba nada, porque esa cadena completa no vive en ningún campo individual. Se confirmó el bug contra la base real: esa búsqueda combinada daba 0 resultados con la lógica anterior.
- **Qué pasaba (Disponibilidad sin buscador y sin mostrar el teléfono):** la página de Disponibilidad (Stock.jsx) no tenía ninguna caja de búsqueda (solo el filtro de sucursal), y la sección "Bajas de personal" no mostraba el número de línea/IMEI del equipo liberado — así que, al dar de baja a alguien con un celular asignado, no había forma de encontrar ni de ver qué número de teléfono traía ese equipo para poder reasignarlo, aunque el dato (`Asset.specs.lineNumber`) ya existía en la base.
- **Qué cambió:** nuevo `frontend/src/utils/search.js` (`matchesSearch`) — búsqueda tipo "todas las palabras", cada una puede venir de un campo distinto (se junta todo el texto buscable en una sola cadena y se exige que cada palabra escrita aparezca en algún lado). Se aplicó en `Employees.jsx`, `Assets.jsx`, `Accessories.jsx` y `Assignments.jsx` (reemplazando su comparación de campo único), ampliando también qué se busca: en Activos ahora se incluyen todos los `specs` del equipo, notas, ubicación y el empleado del que se liberó por baja (`freedFromEmployee`); en Empleados se agregó puesto, teléfono y correos. `Stock.jsx` (Disponibilidad) ahora tiene una caja de búsqueda (antes no tenía ninguna) que filtra tanto las tarjetas agregadas por tipo como "Bajas de personal" por marca/modelo/serie/specs/ubicación o por el nombre del empleado del que se liberó; la tabla de "Bajas de personal" ahora muestra una columna "Datos" con el número de línea, IMEI y no. de contrato del equipo cuando aplica.
- **Por qué:** el usuario reportó que la búsqueda "está súper general" y no permite combinar datos (ej. marca + número de serie en una sola búsqueda), y dio un caso concreto: dio de baja a un empleado (Arandy Onofre) y no podía encontrar ni saber qué número de teléfono traía su equipo para reasignarlo.
- **Verificación:** `npx vite build` sin errores. Contra la base real (solo lectura): la búsqueda combinada "motorola 5521091242" pasó de 0 resultados (lógica vieja) a encontrar exactamente el Motorola correcto (lógica nueva); se confirmó el caso real reportado — Arandy Itzel Onofre Mendoza tiene un Motorola Moto G04 liberado con línea 5521091242, y la nueva búsqueda "Arandy Onofre" en Disponibilidad lo encuentra y muestra ese número directamente en la tabla.

### 2026-07-07 — La búsqueda de Empleados y de Activos ahora cruza entre los dos módulos
- **Qué pasaba:** en Empleados, el buscador solo comparaba contra campos del propio empleado (nombre, número, departamento, área, oficina, razón social) — buscar la marca/modelo/número de serie de un activo no encontraba al empleado que lo tiene asignado, aunque esa misma relación sí se ve en su ficha ("Ver activos"). Viceversa, en Activos el buscador solo comparaba contra campos del propio activo — buscar el nombre de un empleado no encontraba sus equipos asignados, aunque la tabla ya muestra a quién está asignado cada uno.
- **Qué cambió:** `Employees.jsx` ahora también carga `/api/assignments` y arma un mapa `empleado → texto de sus activos` (marca, modelo, no. de serie, etiqueta de inventario); el buscador compara también contra ese texto. `Assets.jsx` ya cargaba `/api/assignments` para mostrar el nombre del empleado en la columna Estado (`assigneeMap`) pero el buscador no lo usaba — ahora `assigneeMap` guarda nombre + número de empleado y el buscador también compara contra eso. Ambos placeholders del buscador se actualizaron para reflejarlo. Assignments.jsx ya buscaba correctamente en ambos sentidos desde antes, no se tocó.
- **Por qué:** el usuario reportó que buscar un activo desde Empleados (o un empleado desde Activos) no encontraba nada, aunque esa relación empleado↔activo ya es visible dentro de cada módulo por separado.
- **Verificación:** `npx vite build` corrió sin errores. Contra la base real (solo lectura, JWT firmado localmente, sin atajos de código): se buscó el número de serie de un activo real desde la lógica de Empleados y encontró correctamente a todos los empleados con ese activo asignado (incluyendo un caso de stock a granel — un cable de red compartido entre ~51 empleados, comportamiento esperado); se buscó el nombre de una empleada real desde la lógica de Activos y encontró correctamente sus 2 equipos asignados (un celular OPPO y una PC Lenovo).

### 2026-07-06 — Cuentas Gmail/Plataformas/ERP agrupadas en "Cuentas" en el sidebar
- **Qué cambió:** las tres cuentas (Gmail, Plataformas, Plataformas ERP) vivían como tres enlaces sueltos en "Administración", cada uno visible solo si el usuario tiene ese permiso específico. Ahora, si el usuario tiene **más de uno** de esos permisos, aparecen agrupadas bajo un enlace padre **"🔑 Cuentas"** con el mismo comportamiento que Empleados/Activos: sub-enlaces (nombres cortos: "Gmail", "Plataformas", "Plataformas ERP") que solo se muestran mientras estás dentro de cualquiera de esas tres páginas, se ocultan al volver a apretar "Cuentas" estando ya ahí, y se resetean al salir. Si el usuario solo tiene **un** permiso de cuentas, se queda como un enlace simple (agruparlo con un solo elemento no aportaba nada).
- **Detalle técnico:** a diferencia de Empleados/Activos, "Cuentas" no es una página real — el botón navega a la primera cuenta disponible para ese usuario si aún no está en el grupo (Gmail > Plataformas > ERP, el orden en que ya aparecían), o solo togglea la lista si ya está dentro de alguna.
- **Por qué:** el usuario pidió aplicar el mismo desglose a las tres páginas de cuentas.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Volver a apretar "Empleados"/"Activos" ya en esa sección oculta la sub-lista
- **Qué cambió:** los sub-enlaces (Empleados→Activos/Bajas, Activos→Equipos/Accesorios) solo se ocultaban al navegar a otra sección — si ya estabas dentro y volvías a apretar el enlace padre, no pasaba nada visible. Ahora, si haces clic en "Empleados" estando ya en Empleados (o en "Activos" estando ya en esa sección), la sub-lista se oculta; un clic más la vuelve a mostrar. Al salir de la sección por completo, se resetea sola para que la próxima vez que entres vuelva a aparecer por default.
- **Por qué:** el usuario señaló que solo se ocultaba al entrar a otro módulo, no al volver a apretar el mismo.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Activos y Accesorios agrupados en el sidebar (mismo patrón que Empleados)
- **Qué cambió:** "Accesorios" vivía en su propia sección aparte del menú ("Accesorios TI", con su propio encabezado), separada de "Activos" (en la sección "General") — visualmente parecían dos módulos sin relación. Se quitó el encabezado "Accesorios TI" y ahora "Activos" y "Accesorios" están agrupados igual que Empleados/Bajas: el enlace "Activos" tiene sub-enlaces **"Equipos"** (→ `/assets`) y **"Accesorios"** (→ `/accessories`) que solo aparecen mientras estás dentro de cualquiera de esas dos páginas, y desaparecen al navegar a otra sección.
- **Por qué:** el usuario pidió aplicar el mismo desglose que se hizo para Empleados/Bajas — le parecía que Activos y Accesorios estaban "muy separados" en el menú cuando en realidad son el mismo tipo de inventario.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Fix: los sub-enlaces de Empleados quedaban visibles fuera de esa sección
- **Qué pasaba:** el desglose "Empleados → Activos/Bajas" del cambio anterior usaba un estado (`empExpanded`) que se ponía en `true` la primera vez que se entraba a Empleados y nunca se revertía — así que, tras visitar esa página una vez, los sub-enlaces se quedaban visibles en el menú para siempre, incluso navegando a Dashboard, Activos, etc.
- **Fix:** se quitó ese estado (y el botón "▸/▾" que lo controlaba); ahora los sub-enlaces "Activos"/"Bajas" se derivan directo de la ruta actual — solo se muestran mientras estás dentro de `/employees`, y desaparecen automáticamente en cuanto navegas a cualquier otra sección.
- **Por qué:** el usuario reportó que la lista se quedaba a la vista por default en vez de aparecer solo al entrar a Empleados.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — "Empleados" se desglosa en el menú lateral: Activos / Bajas
- **Qué cambió:** siguiendo el cambio anterior (las dos tablas se volvieron pestañas dentro de Empleados), ahora el enlace "Empleados" del menú lateral es expandible — un botón "▸/▾" a su derecha despliega dos sub-enlaces indentados, **"Activos"** y **"Bajas"**, que llevan directo a `/employees` o `/employees?estado=baja` con la pestaña correspondiente ya seleccionada. Se expande solo automáticamente al entrar a Empleados; el estado de expandido/colapsado del grupo es independiente del colapso general del sidebar (los sub-enlaces se ocultan si el menú completo está colapsado, igual que el resto de etiquetas).
- **Detalle técnico:** `Employees.jsx` ahora sincroniza la pestaña activa (Activos/Bajas) con el query param `?estado=` de la URL (antes era solo un estado interno con dos tablas apiladas) — así el menú lateral y la página se mantienen en el mismo estado sin duplicar lógica. Se agregaron las clases de tabs a `Page.module.css` (mismo patrón visual que ya usan Activos/Accesorios).
- **Por qué:** el usuario pidió que el propio menú lateral desglosara estas "pestañas" en vez de tener que entrar a Empleados y cambiar de pestaña ahí.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Sección aparte de "Bajas de personal" en Empleados (en vez de mezclarlas con el checkbox)
- **Qué cambió:** el checkbox "Mostrar bajas" del cambio anterior mezclaba a los empleados de baja dentro de la misma tabla — se reemplazó por una **segunda tabla aparte**, debajo de la principal, titulada "🔴 Bajas de personal (N)", que solo aparece si existe al menos un empleado inactivo. Respeta la misma búsqueda/filtro de sucursal que la tabla de arriba, y tiene los mismos botones por fila (Ver activos, Editar, Reactivar, Eliminar). La tabla principal ahora siempre muestra solo activos (ya no necesita la columna "Estado", que era redundante fuera de una lista mixta).
- **Por qué:** el usuario pidió, además de poder mostrar las bajas, tener una sección dedicada solo a ellas — más clara que un checkbox que las mezclaba con el resto.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Un empleado de baja deja de contar como parte del equipo (pero su puesto y activos se pueden reasignar)
- **Qué cambió:** complementa el cambio anterior (baja libera activos a "Bajas de personal"). Ahora un empleado de baja: (1) deja de aparecer en la lista de **Empleados** por default — nuevo checkbox "Mostrar bajas (N)" en la barra de filtros para verlos cuando haga falta (ej. para reactivarlos); (2) deja de contar en los headcounts del **Dashboard** (KPI "Empleados", desglose "Empleados por sucursal", chips de filtro de sucursal/departamento); (3) deja de aparecer como opción al buscar a quién asignarle un activo físico **nuevo** — se corrigió esa búsqueda en Stock (Disponibilidad), Assets y el modal de alta de activos, que no filtraban por `active` (a diferencia de las cuentas Gmail/Plataformas, que sí lo hacían desde antes).
- **Lo que NO cambió (a propósito):** el registro del empleado no se borra — sigue existiendo (reactivable), su historial de asignaciones pasadas sigue en Assignments/Auditoría tal cual, y sus activos ya liberados siguen disponibles en "Bajas de personal" listos para asignarse a alguien nuevo o a un empleado interno que tome ese puesto (ya sea creando un empleado nuevo con el mismo puesto, o eligiendo a uno ya existente — el puesto es solo texto libre en el empleado, no hay que "liberarlo" de nada aparte).
- **Por qué:** el usuario aclaró que el punto de la baja es justo eso — que la persona deje de contar como parte del equipo activo (ya no debe aparecer en Empleados ni en los conteos), mientras que su puesto y sus activos sí deben poder reutilizarse por alguien más.
- **Verificación:** `npx vite build` corrió sin errores.

### 2026-07-06 — Dar de baja a un empleado libera sus activos solo a "Bajas de personal" en Disponibilidad
- **Qué se encontró:** `Employee.active` existe en el modelo desde siempre, pero no había ningún botón en la UI para ponerlo en `false` — no existía forma de "dar de baja" a un empleado. Además, si se hubiera podido, nada devolvía sus activos asignados: se habrían quedado marcados como "asignados" a alguien que ya no está.
- **Qué cambió:** en Empleados, nueva columna "Estado" (Activo/Baja) y botón "Dar de baja"/"Reactivar" por fila (con confirmación explícita). Al dar de baja a un empleado (`PUT /api/employees/:id` con `active:false`), el backend ahora desasigna automáticamente **todos** sus activos activos (misma lógica que ya usaba el botón "Desasignar" — cierra la `Assignment`, recalcula status para productos a granel) y los deja `disponible`, marcándolos con de dónde vinieron (`Asset.freedFromEmployee`: nombre, puesto, sucursal, fecha). Nueva sección **"🔴 Bajas de personal"** en Disponibilidad (Stock.jsx) que lista justo esos activos aparte del resto del stock — con botón "Asignar" para reciclarlos directo. La etiqueta se limpia sola en cuanto el activo se vuelve a asignar a alguien.
- **Por qué:** el usuario explicó que "una baja" no es solo un activo disponible genérico — viene de un puesto específico, y quería verlo aparte en Disponibilidad para poder decidir qué hacer con ese equipo (reasignarlo al reemplazo de ese puesto, etc.) en vez de que se perdiera mezclado en el stock general.
- **Detalle técnico:** la función que libera los activos se extrajo a `backend/src/utils/releaseAssetsOnBaja.js` (mismo patrón que `utils/audit.js`, `utils/archiveResponsiva.js`) para poder probarla aislada.
- **Verificación:** contra la base real — se creó un empleado y un activo de prueba, se asignó el uno al otro, se llamó la función real de baja y se confirmó: el activo quedó `disponible` con `freedFromEmployee` correcto (nombre, puesto), la asignación quedó cerrada con `returnDate`, y `freedCount` regresó 1. Se borraron por completo el empleado, activo, asignación y su entrada de auditoría de prueba al terminar — no quedó ningún residuo.

### 2026-07-06 — Dashboard 100% interactivo + se descubrieron y filtraron cuentas de prueba huérfanas
- **Qué cambió (interactividad, el resto de las tarjetas):** además del drill-down de categorías (cambio anterior el mismo día), ahora todo el Dashboard lleva a algo al hacer clic: "Estado del inventario" (Asignados → Asignaciones, Disponibles → Disponibilidad, De baja → Activos), "Empleados por sucursal"/"Departamentos" (clic en una fila aplica ese filtro al propio Dashboard, igual que los chips de arriba), "Últimas asignaciones" y "Top empleados" (cada fila lleva a la ficha de ese empleado), "Propiedad — Cómputo" (lleva a Activos) y cada persona en "Score de actividad" (lleva a Auditoría filtrada por esa persona). Para que estos últimos dos destinos lleguen ya filtrados, se agregó soporte de query params (`?office=` en Empleados, `?userId=` en Auditoría) que antes no existía — ambas páginas solo tenían filtros por estado interno, no leían la URL.
- **Qué se encontró (usuarios de prueba huérfanos en el score de actividad):** al revisar por qué aparecían nombres desconocidos en "Score de actividad por persona", se confirmó contra la base real que 6 nombres ("Verify Test", "Usuario ERP Prueba", "Tester Import", "Tester Dup", "Tester Reimport", "Tester Delete Guard") corresponden a cuentas de `User` creadas y borradas en verificaciones de features anteriores — el borrado del usuario fue correcto, pero `AuditLog` nunca borra su rastro (así debe ser, es un log de auditoría), así que sus acciones seguían apareciendo como si fueran gente real y activa hoy. No existe ninguna cuenta de automatización/agente en el sistema.
- **Fix:** el cálculo de "Actividad real del equipo" ahora cruza cada entrada de `AuditLog` contra la lista de usuarios que existen hoy (`GET /api/users`) y descarta las de cuentas ya eliminadas, antes de calcular totales, desglose por acción y el score por persona. No se borró nada de `AuditLog` — el historial completo se sigue viendo en la página de Auditoría; solo se dejó de mostrar en este widget del Dashboard.
- **Por qué:** el usuario pidió que absolutamente todo lo que se muestra en el Dashboard sea interactivo (no solo la categoría de activos), y por separado notó nombres que no reconocía como personas reales en el score de actividad y preguntó si eran de prueba o si alguno era "el agente" — se confirmó que son residuos de pruebas, no hay ningún agente/bot.
- **Verificación:** `npx vite build` corrió sin errores. El conteo de `AuditLog` real de los últimos 7 días (828 entradas) se contrastó contra la lista de usuarios reales para identificar exactamente los 6 nombres huérfanos antes de aplicar el filtro.

### 2026-07-06 — Dashboard: drill-down a ubicación física + todo agrupado por sucursal
- **Qué cambió (interactividad — "¿dónde están esos equipos?"):** la tarjeta "Activos por categoría" tenía 2 niveles (categoría → tipo). Se agregó un tercer nivel: al hacer clic en un tipo (ej. "Laptop" dentro de "Cómputo"), ahora se muestra el desglose por sucursal de esos equipos (usando `Asset.location`), con el mismo patrón de barras y botón "← Volver" que ya existía entre los otros niveles.
- **Qué cambió (Donut y Propiedad-cómputo ahora respetan la sucursal):** "Estado del inventario" (donut) y "Propiedad — Cómputo" estaban marcadas explícitamente como "siempre global" — no cambiaban aunque se filtrara por sucursal en la barra de filtros. Ahora, si hay una sucursal seleccionada, ambas usan `Asset.location` para mostrar solo lo físicamente en esa sucursal (incluyendo disponibles/de baja, no solo lo asignado). Los KPIs de arriba (Asignados/Disponibles/De baja/Total) siguen mostrando el número global a propósito — están etiquetados "global" y eso no cambió.
- **Qué cambió (actividad separada por sucursal):** se agregó el campo `office` a `User` (antes no existía — un usuario de Sistemas no tenía sucursal asociada). Nuevo selector "Sucursal" en el modal de Usuarios (mismo catálogo `OFFICES` que Empleados, ahora exportado desde `Employees.jsx` para no duplicarlo) y nueva columna en la tabla. El "Score de actividad por persona" del Dashboard ahora agrupa a cada persona bajo la sucursal de su cuenta (`GET /api/users`, cruzado por `userId` contra `AuditLog`), y si se selecciona una sucursal en el filtro del Dashboard, solo se muestra el grupo de esa sucursal.
- **Por qué:** el usuario pidió (1) que las gráficas/números fueran interactivos — dar clic en "X equipos de cómputo" y ver dónde están físicamente esos equipos, no solo un total; y (2) que toda la actividad mostrada se separe por sucursal (ejemplo real: Felipe en Tepotzotlán, Lilly en Polanco), no solo los empleados que ya se filtraban antes.
- **Nota operativa:** los usuarios de Sistemas existentes quedan con "Sin asignar" hasta que un admin les capture su sucursal desde Usuarios — sin eso, su actividad aparece agrupada como "Sin sucursal asignada" en el Dashboard.
- **Verificación:** `npx vite build` corrió sin errores tras el cambio.

### 2026-07-06 — Dashboard: score de actividad por persona (lógica tipo ML, sin modelo)
- **Qué cambió:** dentro de la tarjeta "Actividad real del equipo" (agregada más temprano el mismo día), se sumó un desglose por persona: cada usuario que aparece en `AuditLog` en los últimos 7 días recibe un **score compuesto** (`ACTION_WEIGHTS` en `Dashboard.jsx`: crear/asignar pesan 1, editar/eliminar/devolver pesan 0.5 — pesos fijos, no aprendidos) y se clasifica en **Actividad alta/media/baja** de forma relativa al máximo del propio equipo en el periodo (≥66% del máximo = alta, ≥33% = media, el resto = baja). Cada persona muestra su score, su nivel (con color) y el detalle de qué acciones hizo (ej. "3 altas · 5 ediciones · 1 baja").
- **Por qué:** el usuario pidió llevar el diagnóstico anterior "al siguiente nivel" — quería la lógica de un modelo de scoring/clasificación (features + pesos + umbrales) sin entrenar un modelo real de ML. Es una regla determinística (sin datos de entrenamiento, sin aprendizaje), pero sigue el mismo patrón que un clasificador: combina varias señales en un score y lo traduce a una categoría.
- **Cuidado de diseño:** el texto junto al score aclara explícitamente que no es una evaluación de desempeño, sino una señal relativa dentro del equipo — para no repetir, a nivel individual, el mismo error que motivó todo este cambio (juzgar a alguien solo por un número sin contexto).
- **Verificación:** `npx vite build` corrió sin errores tras el cambio.

### 2026-07-06 — Dashboard: tarjeta de "Actividad real del equipo" (diagnóstico, no solo descriptivo)
- **Qué cambió:** el Dashboard solo mostraba KPIs y gráficas descriptivas (activos por categoría, estado del inventario, últimas asignaciones, top empleados) — todas basadas en conteos de inventario/asignaciones. Se agregó una nueva tarjeta, visible solo para `role: admin`, que contrasta las **asignaciones nuevas de los últimos 7 días** contra el **total de acciones registradas en `AuditLog`** en el mismo periodo (altas, ediciones, bajas, devoluciones, además de asignar), con un desglose por tipo de acción y un mensaje diagnóstico automático cuando las asignaciones nuevas son pocas pero el resto de la actividad no lo es. Nuevo `useEffect` en `Dashboard.jsx` que llama a `GET /api/audit?from=<hace 7 días>` (endpoint que ya existía, sin cambios de backend).
- **Por qué:** el usuario señaló, usando como ejemplo un reporte de eficiencia de vendedores (que solo mide ventas por día y por eso no refleja los días sin venta pero con actividad — llamadas, etc.), que el Dashboard tiene el mismo problema: "asignaciones" es un conteo de resultado (como las ventas), no de esfuerzo — un periodo con pocas asignaciones nuevas no significa que Sistemas no hizo nada, ya que gran parte del trabajo (ediciones, altas de cuentas, bajas, correcciones de datos) no genera una asignación nueva. Se pidió agregar ese tipo de análisis diagnóstico (el "por qué", no solo el "qué") al Dashboard existente.
- **Verificación:** `npx vite build` del frontend corrió sin errores tras el cambio.

### 2026-07-03 — Disponibilidad ahora muestra la sucursal de cada equipo; se rellenaron 474 sucursales faltantes
- **Qué cambió:** en la página de Disponibilidad, cuando se ven "Todas las sucursales", ahora aparece un desglose por sucursal debajo del número de "Disponibles" en cada renglón (ej. "SUC.1 Corporativo Torre Polanco: 5 · SUC.7 CEDI TEPOTZ JSB: 2"). En el modal de "Asignar", cada unidad disponible en la lista ahora muestra su sucursal (📍) junto al nombre y la etiqueta/serie, para poder elegir la unidad correcta según dónde esté físicamente.
- **Dato faltante corregido:** de 659 activos, solo 159 (24%) tenían el campo `location` (sucursal) capturado directamente. Los otros 500 no lo tenían, pero 474 de ellos SÍ estaban asignados a un empleado que ya tiene su oficina/sucursal registrada — se copió esa oficina al campo `location` del activo (sin tocar ningún otro dato). Quedaron 26 sin poder inferir: 6 asignados a un empleado que tampoco tiene oficina capturada, 6 con más de una asignación activa (se dejaron para no adivinar cuál oficina aplica), y 14 sin asignar (disponibles/de baja, sin empleado del cual copiar). Resultado: de 159 a 633 de 659 activos (96%) con sucursal.
- **Investigado y descartado como falsa alarma:** se encontraron 23 activos con más de una asignación activa simultánea, lo cual parecía un bug (un mismo equipo "asignado" a 2+ personas a la vez) — pero al revisar uno por uno, los 23 son artículos de stock a granel (cables, mouses, kits, consumibles con `stockTotal`), donde es normal y esperado que varias personas tengan una porción del mismo lote asignada al mismo tiempo. No se tocó nada ahí.
- **Por qué:** el usuario reportó que Disponibilidad no mostraba a qué sucursal pertenecía cada equipo, y que esa información ya existía en la app (visible al ver qué empleado tiene asignado cada activo) — solo faltaba mostrarla/copiarla en el lugar correcto.

### 2026-07-03 — Reorganización de Activos/Accesorios: nuevas categorías (Almacenamiento, Adaptadores, Infraestructura) y limpieza de datos
- **Qué se encontró:** el cajón "Otros" de Accesorios (`type: 'accesorio'`) tenía 68 artículos de naturaleza muy distinta mezclados — discos duros y SSD sueltos, switches/routers/cámaras IP/NVRs/inyectores PoE/UPS/insumos de red (equipo de infraestructura, no accesorios de oficina), adaptadores, y varios que ya encajaban en categorías existentes (mouse, hub USB, audífonos, kit teclado+mouse, cargador celular, consumible, herramienta) pero nunca se movieron ahí. Además, 258 activos (80 laptops, 139 celulares, 21 escritorios, 18 all-in-one) no tenían el campo `category` asignado en absoluto.
- **Nuevas categorías creadas:** `disco_duro` (Almacenamiento, dentro de Accesorios), `adaptador` (Adaptadores, dentro de Accesorios), y **Infraestructura** como sección nueva dentro de Activos con 7 tipos: `router`, `switch`, `camara_ip`, `nvr`, `poe_injector`, `ups`, `insumo_red` — cada uno con sus propios campos de especificaciones (puertos, IP, canales, capacidad, etc.).
- **Migración de datos aplicada:** 61 de los 68 artículos de "Otros" se reclasificaron (revisados uno por uno con el usuario antes de aplicar) — 26 a Almacenamiento, 8 a Adaptadores, 15 a Infraestructura (pasaron de `category: 'accesorio'` a `category: 'equipo'`, ahora aparecen en Activos, no en Accesorios), y 12 a categorías ya existentes que no se habían usado. Quedan 7 en "Otros" sin categoría clara (bases para laptop, enfriadores, un Echo Dot, una batería suelta, un gabinete vacío). Los 258 activos sin `category` se corrigieron a `equipo` (coincide con sus tipos: laptop/celular/escritorio/all-in-one).
- **Causa raíz corregida:** la importación masiva por Excel (`mapAssetRows` en `importCategories.js`) nunca establecía el campo `category` — se quedaba con el default del esquema (`equipo`) sin importar qué categoría se eligiera al importar, lo que probablemente causó buena parte del desorden original. Cada categoría de importación ahora declara su `category` correcta y se aplica siempre. También se agregaron 3 nuevas categorías de importación (Almacenamiento, Adaptadores, Infraestructura) con sus propias plantillas de Excel.
- **6 listas de tipos hardcodeadas, todas actualizadas:** además de `ASSET_GROUPS`/`ACCESSORY_GROUPS` (compartidas en `assetFields.js`), se encontraron y actualizaron listas independientes en Disponibilidad (`STOCK_SECTIONS`), Dashboard (`CATEGORIES`), Asignaciones (`FILTER_CATS`), Accesorios (`TABS`) y Activos (`TABS`) — sin esto, los nuevos tipos habrían quedado invisibles en esas páginas aunque existieran en la base.
- **Por qué:** el usuario reportó "mucho desorden" en Accesorios, con cosas en "Otros" que no debían estar ahí o que pertenecían a categorías que no existían (adaptadores, infraestructura).
- **Verificación:** se revisó cada uno de los 68 artículos de "Otros" con el usuario antes de mover nada; tras aplicar, se confirmó que no queda ningún activo sin `category`, que "Otros" bajó exactamente a los 7 esperados, y que el total de activos (659) no cambió — solo se reclasificaron, nada se creó ni se borró.

### 2026-07-03 — La Responsiva de Cuentas ERP usa su propio formato (Responsiva_Acceso_ERP.docx)
- **Qué cambió:** el usuario compartió la plantilla real que usa Sistemas para el acceso al ERP, distinta a la de marketplaces que se venía reutilizando. Se reescribió por completo el contenido de `GET /api/platform-accounts-erp/:id/responsiva` para seguir ese formato: título "SOLICITUD Y CARTA RESPONSIVA DE ACCESO AL SISTEMA ERP", sección de usuario con "Empresa / Razón social" (`employee.businessName`) en vez de teléfono (esta plantilla no lo pide), y una sección 2 completamente distinta: **Módulos** del ERP (Ventas, Compras, Inventarios/Almacén, Facturación, CxC, CxP, Finanzas/Contabilidad, Bancos/Tesorería, Nómina/RH, Reportes/BI, Otro) con selección múltiple, **Nivel de acceso** (Consulta/Captura-Operación/Autorización-Supervisión/Administrador) de selección única, **Tipo de solicitud** (Alta/Modificación/Baja), **Empresa(s) del grupo con acceso**, **Vigencia** y **Perfil de referencia** — y el texto legal de la sección 3 y las firmas (Usuario responsable / Jefe directo (autoriza) / Sistemas (configura acceso), cada una con su propia línea de fecha en blanco) tomados verbatim de la plantilla, distintos a los de la Responsiva de marketplaces.
- **Sin tocar Plataformas/Gmail:** las Responsivas de Cuentas de Plataformas (general) y Cuentas Gmail siguen exactamente igual, con su checklist de marketplaces — solo la de ERP cambió, porque es la única que de verdad tiene un formato distinto.
- **Igual que siempre:** ninguno de estos datos (tipo de solicitud, módulos, nivel de acceso, etc.) se guarda en la cuenta — el modal siempre abre en blanco, viajan solo como parámetros de esa descarga puntual.
- **Por qué:** el usuario indicó que "la responsiva de ERP es diferente" y compartió el .docx real que usa Sistemas para dar de alta accesos al ERP.
- **Verificación:** se generó una Responsiva real con varios módulos y un nivel de acceso marcados a la vez — el PDF resultante coincide con la plantilla campo por campo (título, secciones, checklist de módulos envuelto en varias líneas cuando no cabe, firmas con línea de fecha en blanco).

### 2026-07-03 — La Responsiva mostraba Gmails en "Correo corporativo"; datos corregidos y validación agregada
- **Qué pasaba:** el usuario reportó que la Responsiva ponía "todos los gmails del usuario" en el campo "Correo corporativo" en vez del de Microsoft. La causa: 2 empleados tenían direcciones `@gmail.com` mezcladas dentro de `Employee.corporateEmails` (el campo que se supone solo debe tener correos de Microsoft/corporativos) — probablemente capturadas ahí por error, ya que "Correos corporativos" y "Gmail" en el formulario de Empleados son dos campos de texto libre (tipo tags) sin ninguna validación de dominio entre ellos.
- **Fix de datos:** se movieron esos gmails de `corporateEmails` a `gmailAccounts` (nunca se borró nada) — Oscar Ivan Ramirez Lopez (#70399) tenía 3 gmails mezclados con su único correo real de Microsoft (`analista.bi@selectshop.com.mx`, que se quedó); Eliyahu Cojab Yedid (#SDWERFG) tenía solo un gmail y ningún correo de Microsoft real. Se confirmó que ya no queda ningún empleado con un gmail dentro de `corporateEmails`.
- **Fix de prevención:** el campo "Correos corporativos" en el formulario de Empleados ahora rechaza cualquier valor que termine en `@gmail.com`, con el aviso de que ese va en el campo "Gmail" de abajo — así no se puede volver a mezclar por accidente.
- **Por qué:** la Responsiva de cualquiera de las tres páginas (Plataformas, ERP, Gmail) toma "Correo corporativo" directo de `employee.corporateEmails.join(', ')` — el código siempre fue correcto, el problema era que ese campo tenía datos que no debían estar ahí.
- **Verificación:** se confirmó que el registro de Oscar ya solo devuelve `analista.bi@selectshop.com.mx` en ese campo, y que no quedan más empleados con gmails mezclados en corporateEmails.

### 2026-07-03 — No se puede eliminar un activo asignado; se limpiaron 3 asignaciones huérfanas
- **Qué pasaba:** algunos activos se habían eliminado directamente sin desasignarlos primero, dejando la `Assignment` activa apuntando a un activo que ya no existe. La ficha del empleado ("Ver activos") truena en ese caso porque intenta leer `asset.type`/`asset.brand`/etc. de un activo que llega como `null` tras el `populate`. Afectaba a 3 empleados: Bruno Castañeda Rovira, Andros Cuauhpn Ochoa Lopez y Sistemas.
- **Fix 1 (evitar que vuelva a pasar):** `DELETE /api/assets/:id` ahora revisa si el activo tiene una asignación activa antes de borrarlo; si la tiene, responde 400 con "Este activo está asignado a &lt;empleado&gt;; desasígnalo primero antes de eliminarlo." y no borra nada. Se corrigieron también dos huecos donde ese aviso no llegaba a verse: el borrado en lote de Activos ignoraba silenciosamente cualquier error (`.catch(() => {})`) y ahora junta los fallos y los muestra en una alerta; el borrado individual en Accesorios no tenía manejo de errores en absoluto (la promesa fallida se perdía sin avisar nada) y ahora sí captura y muestra el mensaje.
- **Fix 2 (limpieza de datos):** se identificaron y eliminaron las 3 asignaciones activas huérfanas ya existentes (el activo referenciado ya no existía, así que no había nada que preservar). Además, `GET /api/employees/:id` ahora filtra cualquier asignación cuyo activo no exista (`asset: null` tras el `populate`) antes de devolverla — la misma defensa que ya tenía `responsiva.js` (`.filter(Boolean)`) — como red de seguridad adicional por si una asignación queda huérfana por otra vía en el futuro.
- **Por qué:** el usuario reportó empleados con la vista de activos rota por esta causa exacta y pidió (1) limpiar los datos huérfanos y (2) bloquear el borrado de un activo asignado, avisando que hay que desasignarlo primero.
- **Verificación:** contra los routers reales — intentar borrar un activo con asignación activa da 400 y no lo borra; tras desasignarlo, si se borra correctamente; simulando un huérfano igual al reportado (activo borrado sin pasar por la ruta protegida), `GET /employees/:id` ya no lo incluye y ninguna asignación devuelta tiene `asset: null`. Las 3 asignaciones huérfanas reales se identificaron primero (vista previa) y se confirmó que ya no quedan tras la limpieza.

### 2026-07-03 — La vista previa del importador de Excel también detecta duplicados dentro del mismo archivo
- **Qué se confirmó (el import nunca borra nada):** el importador de Excel de Cuentas ERP (`POST /bulk-import`) solo llama `.create()` para cuentas nuevas — nunca actualiza, sobrescribe ni elimina un documento existente. Se verificó de forma empírica contra la base real: el conteo de cuentas solo sube por cada una creada, nunca baja.
- **Qué se corrigió (duplicados que sí se detectan, pero no se avisaban en la vista previa):** el backend ya rechazaba correctamente una fila duplicada (misma plataforma+usuario), incluso si las dos copias venían en el mismo archivo — pero la **vista previa** del frontend solo comparaba contra las cuentas ya existentes en la base, no contra otras filas del mismo Excel, así que si el archivo traía el mismo correo dos veces, ambas se veían como "✓ Listo" hasta que se importaba (recién ahí el backend omitía la segunda). Ahora la vista previa marca "Ya existe" también cuando el correo se repite dentro del mismo archivo, quedando excluida por default como cualquier otro duplicado. De paso se corrigió que la comparación contra la base ahora es por plataforma+usuario (como es realmente único), no solo por usuario — antes podía marcar como "ya existe" una cuenta con el mismo correo pero de otra plataforma, que en realidad sí es válida.
- **Por qué:** el encargado de ERP preguntó si el import podía borrar datos, y si un duplicado se agregaría dos veces — la respuesta a ambas dudas debía quedar clara y, en el segundo caso, corregida donde faltaba (la vista previa).
- **Verificación:** contra el router real, un lote con la misma cuenta repetida 3 veces (incluyendo variación de mayúsculas) solo crea 1 y omite las otras 2 con "Ya existe una cuenta con ese usuario en esa plataforma"; el conteo de documentos en la base solo sube en +1. La lógica de la vista previa se probó por separado: fila nueva (no marcada), fila repetida en el archivo (marcada), fila ya existente en la misma plataforma (marcada) y fila con el mismo correo pero otra plataforma (correctamente NO marcada).

### 2026-07-03 — "¿Ya existe con Gmail?" en Cuentas ERP: toma la contraseña sola
- **Qué cambió:** al dar de alta una cuenta en Cuentas de Plataformas ERP, la elección "¿Esta cuenta ya existe o es nueva?" tiene ahora una tercera opción: **"¿Ya existe con Gmail?"**. Al elegirla (con un empleado ya seleccionado), busca las cuentas Gmail de ese empleado ya registradas en Cuentas Gmail y toma la contraseña automáticamente — sin escribirla a mano. Si el empleado tiene varias cuentas Gmail, deja elegir cuál; si no tiene ninguna, avisa y sugiere usar "Ya existe" para capturarla a mano. La opción "Ya existe" original no cambió.
- **Nuevo endpoint:** `GET /api/platform-accounts-erp/gmail-lookup?employeeId=` — devuelve las cuentas Gmail (correo + contraseña) del empleado. Requiere el permiso `canManagePlatformAccountsErp`, **no** `canManageGmailAccounts` — un usuario de ERP no tiene por qué ver el resto de Cuentas Gmail, solo la contraseña puntual del empleado que está dando de alta.
- **Por qué:** el encargado de ERP reportó que, para las cuentas que ya existen, su contraseña es la misma que la de su Gmail — así que no tiene caso volver a escribirla si ya está guardada en el sistema.
- **Verificación:** contra el router real, con un empleado real que tiene 6 cuentas Gmail (confirma el selector de "cuál usar"), un empleado sin ninguna (devuelve `[]`, correcto) y sin `employeeId` (400).

### 2026-07-03 — Responsiva también en Cuentas Gmail, con selección múltiple de plataformas
- **Qué cambió:** Cuentas Gmail ahora tiene el mismo botón "📄 Responsiva" que Cuentas de Plataformas/ERP — genera la "Solicitud y Carta Responsiva de Cuenta de Acceso a Plataformas Digitales" para una cuenta Gmail usada para entrar a marketplaces. Nuevo `GET /api/gmail-accounts/:id/responsiva`.
- **Diferencia clave:** una cuenta Gmail puede dar acceso a varias plataformas a la vez (ej. una sola cuenta usada para Mercado Libre + Amazon + Walmart + TikTok Shop), a diferencia de Cuentas de Plataformas donde cada cuenta es de una sola. El checklist de plataformas en el modal es ahora de **selección múltiple** (checkboxes, no un dropdown de una sola opción), y en el PDF aparecen marcadas `[X]` todas las que apliquen. Se agregó **Coppel** y **Liverpool** a la lista de marketplaces (antes solo tenía Mercado Libre/Amazon/Walmart/TikTok Shop) — esta lista ahora vive centralizada en `pdfBranding.js` (`MARKETPLACE_OPTIONS`) y la usan las tres páginas.
- Como siempre: plataformas/tienda/jefe directo/rol/vigencia nunca se guardan en la cuenta, el modal siempre abre en blanco, y queda archivada en el historial de Responsivas (`type: 'cuenta_gmail'`).
- **Por qué:** el usuario está dando de alta cuentas Gmail específicamente para acceso a marketplaces (compartió una tabla real: 8 cuentas, cada una usada para entre 1 y 5 plataformas distintas) y necesitaba la misma Responsiva que ya existía para Cuentas de Plataformas.
- **Verificación:** contra el router real, generando una Responsiva con 4 plataformas marcadas a la vez — el PDF las muestra todas correctamente marcadas, el resto sin marcar, y la cuenta Gmail queda exactamente igual después (sin rastro de los datos de la solicitud); se confirmó el archivado con el tipo correcto y se limpiaron los datos de prueba.

### 2026-07-03 — Los encabezados de sección del menú se veían aplastados/encimados
- **Qué pasó:** el usuario reportó (con captura) que en el menú lateral los nombres de los apartados se veían "encimados". Era un efecto secundario del arreglo del scroll del nav (2026-07-03, entrada más abajo): los encabezados de sección (`.navSection` — "Accesorios TI", "Administración") tienen `overflow: hidden` para truncar texto largo, y por la especificación de flexbox, un hijo flex con `overflow` distinto de `visible` puede encogerse hasta 0 de alto en vez de mantener su tamaño natural. Cuando la ventana no tenía suficiente alto para las ~14 filas del menú, el navegador aplastaba esos encabezados casi a la nada en vez de dejar que el `<nav>` scrolleara — el texto comprimido se veía encimado/ilegible. Los enlaces normales (Dashboard, Empleados, etc.) no tenían este problema porque no llevan `overflow`.
- **Fix:** se agregó `flex-shrink: 0` a `.navSection` (y por seguridad a `.link`) — ahora conservan su tamaño natural siempre, y es el `<nav>` el que scrollea si no cabe completo, como se pretendía desde el arreglo anterior.
- **Por qué:** el usuario señaló correctamente que esto no se veía normal; se confirmó con la captura que compartió.

### 2026-07-03 — Disponibilidad (Stock) no tenía ningún ajuste para pantallas pequeñas
- **Qué se encontró:** al revisar a fondo cada hoja de estilos del frontend, `Stock.module.css` (página Disponibilidad) era la única sin un solo `@media` — cero ajustes para tablet/celular. Además su tabla usaba `overflow: hidden` en vez de scroll horizontal (a diferencia de todas las demás páginas, que usan `overflow-x: auto`), así que en pantallas angostas la tabla se recortaba en vez de poder desplazarse lateralmente.
- **Qué se corrigió:** `.tableWrap` ahora usa `overflow-x: auto` + `min-width` en la tabla (scroll horizontal en vez de recorte); la fila de filtro de sucursal pasó de estilo inline a una clase (`.filterRow`) para poder ajustarla en móvil; y se agregó un bloque `@media (max-width: 640px)` que reduce el título, ajusta el filtro y hace que el modal de asignación se comporte como hoja inferior (igual que en el resto de la app) en vez de modal centrado de escritorio.
- **Revisión del resto de la app:** se revisaron todas las demás hojas de estilos (Dashboard, Activos/Accesorios, Empleados/Asignaciones, Auditoría, Login, Usuarios, Gmail/Plataformas/ERP, Responsivas) — ya tenían manejo razonable de tablet/celular (scroll horizontal en tablas, modales tipo hoja inferior en móvil, grids que se colapsan). El hueco real estaba únicamente en Disponibilidad.
- **Por qué:** el usuario señaló, con razón, que el ajuste anterior (scroll del menú lateral) fue un parche puntual, no un acoplamiento real a distintos dispositivos — esta revisión encontró y corrigió el caso concreto donde sí faltaba.

### 2026-07-03 — Mismo arreglo de "Otra" también en Cuentas de Plataformas (general)
- **Qué cambió:** la página general de Cuentas de Plataformas tenía exactamente el mismo problema que se acababa de corregir en la de ERP — lista de plataformas fija (`Microsoft 365`, `Amazon`, `Netflix`, etc.), y escribir una nueva con "Otra" nunca quedaba disponible para elegir después. Se aplicó la misma solución: la lista ahora se arma con la base fija más cualquier plataforma ya registrada entre las cuentas existentes. Cuentas Gmail no tiene este problema — no maneja un campo de "plataforma" (todas sus cuentas son `@gmail.com`).
- **Por qué:** el usuario preguntó si el arreglo de ERP también aplicaba a "las otras cuentas" — sí debía aplicar, y de hecho tenía el mismo defecto exacto ahí.

### 2026-07-03 — Las plataformas ERP escritas con "Otra" quedan disponibles para elegir después
- **Qué cambió:** en Cuentas de Plataformas ERP, la lista de "Plataforma" al crear una cuenta o importar por Excel era fija (`SAP`, `Oracle NetSuite`, `Microsoft Dynamics`, `Odoo`, `Aspel`, `Contpaqi`, `Otra`) — si escribías un nombre nuevo con "Otra", quedaba guardado en la cuenta pero nunca aparecía como opción después; había que volver a teclearlo cada vez. Ahora la lista se arma dinámicamente con la base fija más cualquier plataforma que ya exista entre las cuentas registradas — en cuanto se usa una vez con "Otra", queda disponible para elegir directamente la próxima vez.
- **Por qué:** el usuario preguntó si al agregar "otro tipo de ERP" se iba a quedar guardado para después o siempre habría que volver a escribirlo — antes la respuesta era "siempre escribirlo", ahora se recuerda solo.

### 2026-07-03 — Aclarar que "Solo lectura" + permiso de cuentas = control total en esa página
- **Qué cambió:** el usuario preguntó si con rol "Solo lectura" sus usuarios de ERP iban a poder editar/crear/generar Responsivas, o si hacía falta un rol especial "administrador de ERP". La respuesta es que el sistema ya funciona así — el permiso de cuentas (Gmail/Plataformas/ERP) da control total sobre esa página específica sin importar el rol, y "Solo lectura" solo significa que no entra a Usuarios/Auditoría ni ve el resto de la app. Se reescribió el texto del modal de Usuarios (tarjetas de rol y sección de permisos) para que esto quede claro a simple vista, sin necesidad de preguntar.
- **Por qué:** el nombre "Solo lectura" es engañoso en este contexto — dentro de su propia página de cuentas (si tiene el permiso) el usuario tiene control total, no de solo lectura. No se necesitó ningún cambio de lógica, ya que el comportamiento deseado ("todos los permisos, pero solo de esa página") ya existía; solo faltaba explicarlo bien en la UI.

### 2026-07-03 — El "líder de ERP" veía todo el sistema porque su rol era Administrador
- **Qué pasó:** `lider.erp@selectshop.com.mx` y `analista.erp@selectshop.com.mx` quedaron dados de alta con rol **Administrador** además del permiso ERP. El rol Admin siempre tiene acceso total por diseño (así funciona `isErpOnlyUser()`, agregada el 2026-07-01: explícitamente no aplica a admins) — por eso veían todo el sistema en vez de quedar limitados a Cuentas de Plataformas ERP + Responsivas. No era un bug en la restricción; el permiso ERP ya da control total sobre esa página por sí solo, sin necesitar rol Administrador.
- **Fix de datos:** se corrigió el rol de ambos usuarios a "Solo lectura" en la base de datos, conservando su permiso `canManagePlatformAccountsErp`. Como el rol y los permisos se cargan en el JWT al iniciar sesión, cada uno necesita cerrar sesión y volver a entrar para que el cambio tome efecto.
- **Fix de UI para prevenir que se repita:** en el modal de "Nuevo usuario"/"Editar usuario" (solo visible para `sistemas.2`), ahora aparece una advertencia si se selecciona rol Administrador junto con cualquiera de los permisos de cuentas (Gmail/Plataformas/ERP), explicando que Admin ve todo sin importar esos permisos y que no hace falta para gestionarlos.

### 2026-07-03 — El botón de "cerrar sesión" ya no se pierde en pantallas más bajas
- **Qué cambió:** el menú lateral (`Layout.module.css`) tenía el `<nav>` con `flex: 1` pero sin `min-height: 0` ni scroll propio, dentro de un sidebar con `overflow: hidden`. Con la cantidad de enlaces que ya tiene el menú (Responsivas, Cuentas ERP, etc.), en pantallas con menos alto vertical (una laptop, por ejemplo) el nav empujaba el bloque de usuario/cerrar sesión fuera del área visible y quedaba recortado — invisible e inalcanzable. En un monitor externo, al haber más alto disponible, no se notaba.
- **Fix:** el `<nav>` ahora tiene scroll propio (`overflow-y: auto`, con `min-height: 0` para que el flex funcione bien) y el botón de colapsar menú + el bloque de usuario/cerrar sesión llevan `flex-shrink: 0` — quedan siempre fijos y visibles, sin importar cuántos enlaces tenga el menú ni el alto de la pantalla; si el menú no cabe completo, ahora scrollea internamente en vez de empujar todo lo de abajo fuera de vista.
- **Por qué:** el usuario reportó que en un monitor sí veía la opción de cerrar sesión, pero en su computadora (pantalla con menos alto) ya no la podía ver ni usar.

### 2026-07-01 — Un usuario solo-ERP ya no ve el resto de la aplicación
- **Qué cambió:** Dashboard, Empleados, Activos, Asignaciones, Accesorios y Disponibilidad nunca tuvieron ningún control de acceso — cualquier usuario autenticado los veía, sin importar su permiso, porque hasta ahora todos los usuarios eran administradores o vieron esas páginas a propósito. Con el nuevo permiso `canManagePlatformAccountsErp` eso dejó de ser cierto: un usuario cuyo **único** permiso es ese debe ver nada más "Cuentas Plataformas ERP" y "Responsivas". Se agregó `isErpOnlyUser()` (en `Layout.jsx`, exportada) que detecta este caso (no admin, sin Gmail, sin Plataformas generales, con ERP) y: (1) en el menú lateral, oculta todo lo demás y solo deja esas dos opciones; (2) en `App.jsx`, un nuevo `NotErpOnlyRoute` bloquea también el acceso directo por URL a esas páginas y redirige a Cuentas Plataformas ERP.
- **Por qué:** el usuario reportó que aunque le puso el permiso ERP a alguien, esa persona seguía viendo toda la aplicación (Dashboard, Empleados, etc.) — solo debía ver su cuenta ERP y sus propias Responsivas, sin motivo para ver el resto.
- **Alcance:** esta restricción solo aplica cuando ERP es el único permiso — un usuario con Gmail y/o Plataformas generales (o admin) sigue viendo todo como antes; no se tocó el comportamiento de esos casos.

### 2026-07-01 — Otorgar permisos de cuentas (Gmail/Plataformas/ERP) desde el alta de usuario
- **Qué cambió:** el modal de "Nuevo usuario"/"Editar usuario" ahora incluye, solo cuando quien lo abre es `sistemas.2`, tres checkboxes ("Cuentas Gmail", "Cuentas de Plataformas", "Cuentas de Plataformas ERP") para otorgar esos permisos directo en el alta — antes solo se podían activar después, con los toggles de la tabla. `POST /api/users` ahora acepta esos mismos tres campos con la misma validación que ya tenía `PUT /:id` (solo `sistemas.2` puede mandarlos; cualquier otro admin recibe 403 si lo intenta).
- **Por qué:** el usuario reportó que al crear un usuario nuevo solo veía los roles "Administrador"/"Solo lectura" y no encontraba dónde asignar el permiso ERP — el rol y estos permisos son independientes a propósito, pero antes obligaban a un paso extra (crear y luego editar) que no era obvio.
- **Verificación:** contra el router real — `sistemas.2` crea un usuario con `canManagePlatformAccountsErp: true` directo en el `POST` y queda con el permiso activo; un admin distinto a `sistemas.2` que intenta lo mismo recibe 403, igual que ya pasaba al editar.

### 2026-06-30 — Importar cuentas ERP existentes desde Excel (masivo, sin contraseña)
- **Qué cambió:** en Cuentas de Plataformas ERP, nuevo botón "📥 Importar Excel" que sube un `.xlsx`/`.xls`/`.csv` con una columna de nombre de empleado y otra de correo/usuario (encabezados flexibles: detecta "nombre"/"empleado" y "correo"/"email"/"usuario", o cae a las dos primeras columnas si no encuentra ninguno). Se elige una sola plataforma para todo el lote. Cada fila se empareja automáticamente contra los empleados activos (exacto, insensible a acentos/mayúsculas, y también si el orden del nombre viene invertido) y se muestra en una tabla de revisión donde se puede **corroborar o corregir** el empleado detectado antes de confirmar, con casillas para incluir/excluir filas. Las cuentas sin coincidencia, sin correo o ya existentes (mismo usuario+plataforma) se marcan y quedan excluidas por default.
- **Sin contraseña real, nunca inventada:** las cuentas importadas se crean con contraseña vacía y un nuevo flag `passwordPending` — quedan visibles en un bloque "🔑 Pendientes de contraseña" arriba de la tabla y con una etiqueta "⏳ Pendiente" en la columna de contraseña, con un botón directo para capturarla cuando se tenga a la mano. Al guardarla (manual o regenerada), `passwordPending` se limpia solo. El modelo `PlatformAccountErp.passwordEncrypted` dejó de ser obligatorio para soportar este estado.
- **Nuevo endpoint:** `POST /api/platform-accounts-erp/bulk-import` (`{ platform, accounts: [{ employeeId, username }] }`) → `{ created: [...], skipped: [{ username, reason }] }`, mismo permiso `canManagePlatformAccountsErp`.
- **Por qué:** el usuario ya tiene usuarios activos con cuentas reales en el ERP y no quiere darlas de alta una por una — la contraseña sí es nueva información que se captura después, pero el nombre/correo ya existen y se pueden cargar en lote, verificando el emparejamiento antes de guardar.
- **Verificación:** contra el router real — import masivo con filas válidas, un empleado inexistente y una fila sin correo (cada una omitida con su razón); reintento del mismo archivo detecta los duplicados; las cuentas creadas quedan con `password: null` y `passwordPending: true` hasta capturar la contraseña real, momento en el que se limpia el flag. La lógica de emparejamiento de nombres (acentos, mayúsculas, orden de palabras) y el parseo de encabezados flexibles del Excel se probaron por separado con archivos de prueba reales.

### 2026-06-30 — La sección "Cuentas ERP" en la ficha del empleado solo aparece si tiene alguna
- **Qué cambió:** en `EmployeeDetail.jsx` ("Ver activos"), la tabla de "Cuentas ERP" ya no se muestra con un texto vacío ("Este empleado no tiene cuentas ERP asignadas") para cada empleado — ahora solo aparece, con su propio encabezado, cuando ese empleado tiene al menos una cuenta ERP asignada. El botón "+ Asignar cuenta ERP" del encabezado de la sección "Cuentas" no cambió — sigue disponible siempre para poder asignar la primera.
- **Por qué:** las cuentas ERP son un caso muy puntual (un solo usuario nuevo por ahora), así que mostrar el aviso de "no tiene" en cada ficha de empleado era ruido innecesario para el resto de administradores.

### 2026-06-30 — Cuentas de Plataformas ERP: página y permiso aislados para un usuario nuevo
- **Qué cambió:** nueva página **Cuentas de Plataformas ERP** (`/platform-accounts-erp`), copia funcional completa de Cuentas de Plataformas (alta nueva/existente, editar, regenerar/corregir contraseña una vez, eliminar, filtros, exportar Excel, generar Responsiva en PDF, reciclaje de cuentas disponibles) pero en su **propia colección de MongoDB** (`PlatformAccountErp`), sin relación con las cuentas de Microsoft/Amazon/etc. que ya gestiona Sistemas.
- **Permiso nuevo:** `canManagePlatformAccountsErp`, independiente de `canManageGmailAccounts`/`canManagePlatformAccounts`, otorgable solo por `sistemas.2@selectshop.com.mx` desde Usuarios (nueva columna "Plataformas ERP"). Un usuario con solo este permiso no ve Cuentas de Plataformas, Cuentas Gmail, Usuarios ni Auditoría — únicamente su página ERP (y Responsivas, ver abajo).
- **Reciclaje:** igual que las cuentas generales — asignar/desasignar cuentas ERP se hace desde la ficha del empleado ("Ver activos") y las disponibles también aparecen en Disponibilidad, en su propia sección "Cuentas de Plataformas ERP".
- **Responsivas con visibilidad acotada:** la página Responsivas ahora es visible para cualquier usuario con algún permiso de cuentas (Gmail, Plataformas o Plataformas ERP), no solo administradores — pero un usuario no-admin **solo ve las responsivas que él mismo generó** (nuevo campo `generatedBy` en el archivo, usado para filtrar). Los administradores siguen viendo todo. Borrar del archivo sigue reservado a administradores.
- **Por qué:** va a entrar un usuario nuevo al sistema y no debe ver todo lo que Sistemas ha estado gestionando (Gmail, cuentas de plataformas generales, usuarios, auditoría) — solo su propia página de cuentas ERP y el historial de sus propias responsivas.
- **Verificación:** contra los routers reales con un usuario ficticio que solo tiene `canManagePlatformAccountsErp`: confirmado 403 al intentar ver Cuentas de Plataformas general; ciclo completo en ERP (crear, generar responsiva archivada con el `generatedBy` correcto, desasignar/reciclar, reasignar a otro empleado); en Responsivas, el usuario ERP solo ve su propio documento (1) mientras que un admin ve todos (2); el usuario ERP recibe 403 al intentar borrar del archivo, el admin sí puede.

### 2026-06-30 — Datos de la Responsiva de Plataformas dejan de guardarse; borrar del archivo
- **Qué cambió (datos siempre en blanco):** "Tienda/Cuenta/Seller", "Jefe directo", "Rol de acceso" y "Vigencia" dejaron de guardarse en `PlatformAccount` (se quitaron esos 4 campos del modelo y de `PUT /:id`; se limpiaron de los documentos existentes en Mongo). Ahora viajan como query params directo a `GET /api/platform-accounts/:id/responsiva` y solo existen para esa descarga puntual — el modal siempre abre en blanco, sin importar qué se haya puesto la vez anterior.
- **Qué cambió (borrar del archivo):** en la página **Responsivas** cada fila tiene un botón "Eliminar" con modal de confirmación (mismo patrón que el resto de la app). Nuevo `DELETE /api/responsiva-archive/:id`, solo admin.
- **Por qué:** el usuario notó que los datos de la solicitud (tienda, jefe directo, etc.) se estaban guardando y prellenando, pero cada responsiva es para una persona/tienda distinta — nunca deben repetirse. También pidió poder borrar entradas del archivo (por ejemplo, las que generó de prueba) por si más adelante hay que corregir un error.
- **Verificación:** contra el router real, se confirmó que generar la responsiva con datos de prueba los refleja correctamente en el PDF pero el documento de `PlatformAccount` queda sin esos campos después (`{}`); se probó `DELETE /:id` end-to-end (crea, borra, confirma que ya no existe). Se dejó intacto el documento real de archivo que el usuario generó de prueba (Amazon / MIGUEL GARCIA RAMOS) para que lo borre él mismo con el nuevo botón.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Archivo histórico de Responsivas generadas (activos y cuentas)
- **Qué cambió:** cada vez que se genera una Responsiva en PDF (de equipo/activos o de cuenta de plataforma) se guarda una copia completa en Mongo — nuevo modelo `ResponsivaArchive` (`type`, `employee`, `employeeName`, `employeeIdNum`, `relatedLabel`, `fileName`, `pdfData` como `Buffer`, `generatedByName`). Se guarda vía `archiveAndRespond()` (`backend/src/utils/archiveResponsiva.js`), que junta el PDF completo en memoria antes de responder y hace el guardado **best-effort**: si falla, la descarga se completa igual, nunca se rompe por un error de archivado. Nueva página **Responsivas** (`/responsivas`, solo admin) que lista todo lo generado (tipo, empleado, detalle, quién lo generó, fecha) con filtro por tipo, búsqueda y botón de descarga por documento — nuevas rutas `GET /api/responsiva-archive` y `GET /api/responsiva-archive/:id/download`.
- **Por qué:** el usuario pidió un lugar donde queden guardados todos los PDF de responsivas que se generan, tanto de activos como de cuentas — hoy se generaban y se perdían en cuanto se cerraba la descarga.
- **Detalle técnico:** se guarda en MongoDB y no en el disco del servidor porque Render (free tier) no persiste el filesystem entre despliegues — cualquier archivo escrito a disco se perdería en el siguiente deploy. Esto obligó a refactorizar cómo `responsiva.js` y `platformAccounts.js` entregan el PDF: antes usaban `doc.pipe(res)` (streaming directo); ahora recolectan los chunks del stream de `pdfkit`, arman el buffer completo, lo guardan y solo entonces responden — el contenido visual del PDF no cambió.
- **Verificación:** se generaron ambos tipos de responsiva contra los routers reales (JWT firmado, sin atajos) y se confirmó que ambas quedaron archivadas correctamente; se releyó el PDF de activos completo (2 páginas) para confirmar que el refactor de streaming no alteró el resultado visual. Se probaron `GET /` y `GET /:id/download` del archivo, y se confirmó 403 para un usuario sin rol admin. Los registros de prueba se borraron al terminar.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Nombres en las firmas de la Responsiva de Plataformas
- **Qué cambió:** en el bloque de firmas del PDF, "JEFE DIRECTO" ahora muestra el nombre capturado en el campo del mismo nombre (`account.directManager`), igual que "USUARIO RESPONSABLE" ya mostraba el nombre del empleado. "SISTEMAS" ahora **siempre** muestra el nombre de quien tiene registrado el correo corporativo `gerente.sistemas@selectshop.com.mx` (se busca en `Employee.corporateEmails` en cada generación) — nunca se imprime el correo, solo el nombre.
- **Por qué:** el usuario pidió que las firmas mostraran nombres, no dejarlas en blanco ni mostrar correos, y que Sistemas siempre sea la misma persona (identificada por ese correo) sin importar quién genere el documento.
- **Verificación:** contra la base real, `gerente.sistemas@selectshop.com.mx` resolvió a "BRUNO CASTAÑEDA ROVIRA" (único registro con ese correo corporativo). Se probó con el router real (PUT + GET con JWT firmado) que las tres firmas muestran el nombre correcto; se limpió el valor de prueba de `directManager` al terminar (los demás campos de prueba ya eran del usuario, no se tocaron).
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Campos manuales antes de generar la Responsiva + fix de teléfono
- **Qué cambió (campos manuales):** el botón "📄 Responsiva" ya no descarga directo — ahora abre un modal para completar "Tienda / Cuenta / Seller", "Jefe directo", "Rol o tipo de acceso" y "Vigencia del acceso" (los que no se pueden llenar solos con los datos del sistema). Al enviar el modal, esos valores se guardan en la cuenta (`PUT /api/platform-accounts/:id`, nuevos campos `store`, `directManager`, `accessRole`, `accessValidity` en `PlatformAccount`) y luego se genera el PDF — la próxima vez que se regenere la responsiva de esa misma cuenta, el modal ya viene prellenado con lo último capturado.
- **Bug corregido (teléfono):** el campo "Teléfono / Ext." usaba `Employee.phone`, pero ese campo casi nunca está lleno (4 de 256 empleados activos). El número real vive en la línea del celular que la empresa le asignó al empleado (`Asset.specs.lineNumber`, vía su asignación activa) — 186 de 256 empleados activos lo tienen ahí. Ahora el PDF usa ese número primero, y solo cae a `Employee.phone` si no hay celular asignado con línea.
- **Por qué:** el usuario señaló que el teléfono debió salir solo porque casi todos los empleados tienen uno registrado — cierto, pero vive en el activo asignado, no en la ficha del empleado — y pidió poder llenar los demás campos manuales antes de generar el documento en vez de editarlos a mano después.
- **Verificación:** contra la base real, se confirmó que 186/256 empleados activos tienen línea de celular asignada vs. solo 4 con `Employee.phone`. Se probó el flujo completo (guardar campos vía `PUT` real + generar PDF vía `GET` real, ambos con JWT firmado, sin atajos) contra la cuenta de Amazon existente — el PDF resultante mostró el teléfono real (5548605399, de un OPPO A40 asignado) y los cuatro campos manuales ya llenos. Los valores de prueba (Ana Torres, etc.) se limpiaron de esa cuenta real después de verificar.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Responsiva en PDF para Cuentas de Plataformas (solicitud de acceso)
- **Qué cambió:** en `Cuentas de Plataformas`, cada cuenta con empleado asignado tiene un botón "📄 Responsiva" que genera y descarga un PDF con los datos ya llenos, basado en la plantilla que compartió el usuario (`Responsiva_Cuentas_Plataformas.docx`, encontrada en `~/Downloads`): "Solicitud y Carta Responsiva de Cuenta de Acceso a Plataformas Digitales". Se llenan solos: datos del empleado (nombre, puesto, área/departamento, correo corporativo, teléfono), datos de la cuenta (plataforma marcada con checkbox `[X]`/`[ ]`, correo asociado, justificación si hay notas), el texto legal/obligaciones completo de la plantilla, y los tres bloques de firma (Usuario responsable, Jefe directo, Sistemas) con el nombre del empleado prellenado en el primero. **Nunca incluye la contraseña** — la plantilla original tampoco la pide. Nuevo endpoint `GET /api/platform-accounts/:id/responsiva`, protegido por `canManagePlatformAccounts`.
- **Refactor de soporte:** se extrajeron a `backend/src/utils/pdfBranding.js` las funciones de layout/marca (colores y logo por empresa, helpers de `pdfkit` como `sectionBand`, `kvRow`, `clauseBlock`, etc.) que ya usaba la Responsiva de activos físicos (`responsiva.js`), para reutilizarlas en este nuevo documento sin duplicar ~150 líneas. La Responsiva de activos sigue funcionando igual (se verificó generando un PDF real con el router de producción).
- **Por qué:** el usuario quiere que este documento se llene solo (como ya hace la Responsiva de equipo) en vez de capturarlo a mano cada vez que se solicita acceso a una plataforma para un empleado.
- **Verificación:** se generó un PDF real usando el router de producción (con un JWT de prueba, sin atajos de código) contra una cuenta real de la base — layout, checkboxes y texto legal completo se revisaron visualmente. Se corrigió en el camino un bug de compatibilidad: los caracteres ☐/☒ no se veían bien con la fuente estándar del PDF (salían como "&"); se cambiaron por `[ ]`/`[X]`.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Detectar Gmail de celulares/tablets como pendientes en Cuentas Gmail
- **Qué cambió:** `GET /api/gmail-accounts/unregistered` ahora también revisa `Asset.specs.gmailAccount` de celulares y tablets (campo "Gmail" que ya se capturaba al registrar esos equipos), usando el empleado con la asignación activa de cada equipo para saber a quién ligarla. Se combina con la detección que ya existía (`Employee.gmailAccounts[]`) en una sola lista, sin duplicar por correo. No modifica `Asset` ni `Employee` — solo lee. El texto de la sección en `Cuentas Gmail` se actualizó de "Cuentas ya registradas en Empleados" a "Cuentas ya usadas sin contraseña guardada" para reflejar ambas fuentes.
- **Por qué:** el usuario notó que varios celulares Android ya tienen su cuenta Gmail capturada (es para lo que se usan) y quería traerlas al gestor sin duplicar las que ya estuvieran ahí ni inventarles contraseña.
- **Verificación:** solo lectura contra la base real — 23 celulares/tablets con Gmail en specs, 8 ya en el gestor, 15 pendientes (los 15 con empleado actualmente asignado); combinado con la detección existente no generó duplicados (0 correos repetidos entre ambas fuentes).
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Fix: EmployeeDetail solo mostraba 1 cuenta Gmail; elegir reasignar directo o disponible; cuentas de Plataformas en Disponibilidad
- **Bug corregido:** la sección "Cuentas" de `EmployeeDetail.jsx` usaba `.find()` para buscar la cuenta Gmail del empleado, así que si tenía varias (caso real: Karla Conejo) solo mostraba la primera. Se cambió a `.filter()` y ahora se listan todas.
- **Desasignar con opción de reasignar directo:** en `EmployeeDetail.jsx`, el botón "↩️ Desasignar" de una cuenta de Plataforma ahora abre un modal con dos caminos: "Mandar a disponible" (como antes, la deja sin empleado) o "Asignar a otro empleado" (selecciona directamente al nuevo empleado ahí mismo, sin tener que ir a su ficha por separado). Ambos casos usan `PUT /platform-accounts/:id` (con `unassign: true` o `employeeId`).
- **Gmail se queda sin reciclaje (decisión confirmada):** se preguntó explícitamente si extender el reciclaje a Gmail también, y el usuario confirmó que no, por ahora solo Plataformas.
- **Cuentas de Plataformas visibles en Disponibilidad:** se agregó una sección "🔐 Cuentas de Plataformas" en `Stock.jsx`, listando por plataforma cuántas cuentas están disponibles (sin empleado), con su propio botón "Asignar" que abre un modal (`AccountAssignModal`) con selección de cuenta + búsqueda de empleado por número/teléfono/nombre — mismo patrón visual que el modal de asignación de activos físicos que ya existía en esa página. Solo visible si el usuario tiene `canManagePlatformAccounts`.
- **Por qué:** al revisar el caso de Karla Conejo, el usuario notó el bug de una sola cuenta Gmail visible, y aprovechó para pedir un flujo de desasignación más directo y que las cuentas disponibles también se vieran junto al inventario físico en Disponibilidad, ya que es la página donde ya se gestiona qué hay "libre" para asignar.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Migrar Correos Corporativos a Cuentas de Plataformas (como Microsoft)
- **Qué cambió:** en `Cuentas de Plataformas` se agregó una sección "📥 Correos corporativos (Microsoft) sin contraseña guardada" que detecta los correos ya cargados en `Employee.corporateEmails[]` (capturados desde el formulario de Empleados, con distintos dominios) que todavía no tienen registro en el gestor con `platform: 'Microsoft 365'`. Cada uno tiene un botón "+ Agregar contraseña" que abre el mismo modal de "Nueva cuenta", pre-llenado con el empleado, plataforma "Microsoft 365" y el correo, en modo "ya existe" (para capturar su contraseña real). Backend: nuevo `GET /api/platform-accounts/unregistered-corporate`, que solo lee — no modifica ni borra `Employee.corporateEmails[]`.
- **Por qué:** el usuario tiene 184 correos corporativos (con distintos dominios) que en realidad son todas cuentas de Microsoft, y quiere pasarlos al gestor de contraseñas de Plataformas sin perder ni tocar lo que ya está en la ficha de cada empleado.
- **Verificación:** se corrió un script de solo lectura contra la base real que confirmó 166 empleados con 184 correos corporativos, 0 ya migrados, 184 pendientes de migrar — sin escribir nada.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Mover asignar/desasignar cuentas a la ficha del empleado ("Ver activos"); Gmail deja de ser reciclable por ahora
- **Qué cambió:** las acciones de asignar/desasignar cuentas ya no viven en las páginas de Cuentas Gmail/Plataformas. Ahora se hacen desde `EmployeeDetail.jsx` (la misma pantalla de "Ver activos" a la que se entra desde Empleados), en una nueva sección **"Cuentas"** separada de "Activos asignados": muestra la cuenta Gmail del empleado (si tiene, solo lectura + ver/copiar contraseña) y sus cuentas de Plataformas (con botón "↩️ Desasignar", modal de confirmación, ver/copiar contraseña), más un botón **"+ Asignar cuenta de plataforma"** que abre un modal para elegir una cuenta disponible (del pool de reciclaje) y dársela a ese empleado. Se agregó `AssignAccountModal` en `EmployeeDetail.jsx`, reutilizando los estilos de modal ya existentes ahí (`Assets.module.css`).
- **Qué se quitó de las páginas de Cuentas:** en `GmailAccounts.jsx` se revirtió por completo el reciclaje (botón "Desasignar", sección "Disponibles para reciclar" y sus modales) — Gmail vuelve a requerir `employee` siempre. En `PlatformAccounts.jsx` se quitó el botón "↩️ Desasignar" de la tabla y el botón "Asignar a un empleado" de la sección "Disponibles para reciclar" (esa sección se queda, solo como listado + Eliminar, con una nota de que la asignación ahora se hace desde la ficha del empleado). Las páginas de Cuentas siguen siendo las únicas para **crear**, editar notas/estado, regenerar/corregir contraseña, ver/copiar/exportar y eliminar.
- **Backend:** `GmailAccount.employee` volvió a ser obligatorio; `PUT /api/gmail-accounts/:id` perdió el soporte de `unassign`/`employeeId`. `PlatformAccount` y sus rutas (`unassign`/`employeeId` en `PUT /api/platform-accounts/:id`) no cambiaron — solo dejaron de usarse desde `PlatformAccounts.jsx` y ahora los usa `EmployeeDetail.jsx`.
- **Por qué:** el usuario quiere gestionar las cuentas igual que los activos físicos — desde la ficha del empleado ("Ver activos") — y no desde las páginas de administración de cuentas, que deben quedar enfocadas en creación y gestión general. También pidió que, por ahora, solo las cuentas de Plataformas sean reciclables (Gmail no).
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Alta "nueva o existente" también en Cuentas Gmail
- **Qué cambió:** el modal "Nueva cuenta Gmail" ahora tiene el mismo selector "¿Esta cuenta ya existe o es nueva?" que ya se agregó a Plataformas: si es nueva, sigue generando la contraseña sola (`POST /gmail-accounts`); si ya existe, aparece un campo de contraseña (mostrar/ocultar) y usa el endpoint que ya existía `POST /gmail-accounts/import`. La sección aparte "Cuentas ya registradas en Empleados sin contraseña guardada" (que detecta automáticamente correos heredados de `Employee.gmailAccounts[]`) se queda igual, sin tocarse — este cambio solo cubre el caso de dar de alta manualmente una cuenta que ya existe y que ese detector no encontró.
- **Por qué:** el usuario pidió que la misma pregunta "nueva o existente" que se hizo para Plataformas también estuviera disponible en Gmail, por consistencia.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Reciclar cuentas Gmail/Plataformas + corrección manual de contraseña + alta "nueva o existente" en Plataformas
- **Qué cambió (reciclaje):** `employee` dejó de ser obligatorio en `GmailAccount` y `PlatformAccount` (`null` = disponible). Se agregó, en ambas rutas (`PUT /:id`), soporte para `unassign: true` (libera la cuenta, la deja sin empleado; en Gmail también quita el correo de `Employee.gmailAccounts[]`) y `employeeId` (asigna/reasigna la cuenta a un empleado; en Gmail agrega el correo al nuevo `Employee.gmailAccounts[]`). En ambas páginas se agregó el botón "↩️ Desasignar" en cada fila y una sección "🔁 Disponibles para reciclar" que lista las cuentas sin empleado, con botón "Asignar a un empleado". Las acciones quedan auditadas con `asignar`/`devolver` (mismos valores que ya usaban Assignments).
- **Qué cambió (corrección manual de contraseña, una sola vez):** se agregó `passwordManuallySet` (boolean) a ambos modelos. En el modal "Editar cuenta" aparece un botón "✏️ Corregir contraseña manualmente" **solo si la cuenta nunca lo ha usado**; al guardar una contraseña por ahí, el backend la cifra, marca `passwordManuallySet: true` y esa opción desaparece permanentemente para esa cuenta (cambios futuros solo vía "🔄 Contraseña", que sigue siendo aleatoria).
- **Qué cambió (alta "nueva o existente" en Plataformas):** el modal "Nueva cuenta" de `PlatformAccounts` ahora pregunta primero "¿Esta cuenta ya existe o es nueva?"; si es nueva, sigue igual (contraseña autogenerada); si ya existe, aparece un campo de contraseña (con mostrar/ocultar) y el alta se manda a un nuevo endpoint `POST /platform-accounts/import` (mismo patrón que ya existía en Gmail para correos heredados).
- **Por qué:** el usuario quiere poder recuperar (reciclar) las cuentas de un empleado que se da de baja y reasignarlas a otro sin crear cuentas nuevas; y, tras agregar manualmente una cuenta de Amazon con contraseña autogenerada por error, necesitaba una forma de corregirla directamente además de poder declarar desde la creación si una cuenta de plataforma ya existía de antes (con su propia contraseña) o era nueva.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Filtros tipo Asignaciones en Cuentas Gmail
- **Qué cambió:** `GmailAccounts.jsx` pasó de tener solo un buscador libre a filtros por empresa, oficina y estado (activa/inactiva), con la misma estructura que Assignments/PlatformAccounts: cuadrícula de selects, barra de búsqueda completa, y una barra de resultados con contador, botón "Limpiar filtros" y el botón "Exportar Excel" (que ahora respeta los filtros aplicados y los anota en la cabecera del archivo y en el nombre). El botón de exportar se movió del encabezado a esa barra de resultados para quedar junto al conteo, igual que en las otras páginas.
- **Por qué:** el usuario pidió que Cuentas Gmail tuviera los mismos filtros que ya se habían hecho para Cuentas de Plataformas (inspirados en Assignments), para poder acotar por empresa/oficina/estado antes de exportar.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Nueva página "Cuentas de Plataformas" (Microsoft, Amazon, etc.) con filtros y export tipo Asignaciones
- **Qué cambió:** nuevo módulo gemelo al de Gmail pero para cualquier plataforma (Microsoft 365, Amazon, Netflix, Adobe, Canva, Zoom, Dropbox u "Otra" con nombre libre), sin restricción de dominio de correo. Backend: modelo `PlatformAccount` (`employee`, `platform`, `username`, `passwordEncrypted`, `status`, `notes`, índice único `platform+username`), rutas `backend/src/routes/platformAccounts.js` (`GET /`, `POST /` con contraseña siempre autogenerada, `PUT /:id` con `regeneratePassword`, `DELETE /:id`), entidad `cuenta_plataforma` agregada a `AuditLog`. Frontend: página `PlatformAccounts.jsx` con el mismo manejo de contraseñas que Gmail (ver/copiar/ocultar, regenerar y eliminar con modal de confirmación explícita, nunca capturar la contraseña a mano al crear), **más filtros** (plataforma, empresa, oficina, estado, búsqueda libre) y **exportación a Excel que respeta los filtros aplicados**, siguiendo el mismo patrón de `exportToExcel` de `Assignments.jsx` (cabecera con los filtros usados, nombre de archivo con esos filtros).
- **Permisos:** a solicitud del usuario, es un permiso **independiente** del de Gmail: `User.canManagePlatformAccounts`, protegido por el nuevo middleware `platformManagerOnly`, ruta frontend `PlatformManagerRoute`, y controlado exclusivamente por `sistemas.2@selectshop.com.mx` (mismo dueño de permisos que Gmail) desde una segunda columna/checkbox en la página de Usuarios. Esa cuenta también se autocorrige con este permiso en cada login, igual que ya hacía con Gmail.
- **Por qué:** el usuario pidió una página igual a la de Gmail pero para otras plataformas (Microsoft, Amazon, etc.), con filtros y exportación de Excel como la página de Asignaciones — y, siguiendo el mismo criterio de seguridad ya establecido, que el acceso lo siga controlando solo `sistemas.2@selectshop.com.mx`, pero de forma independiente por módulo (puede dar Gmail a alguien y Plataformas a otra persona).
- **Nota operativa:** igual que con el permiso de Gmail, quien ya tenga sesión abierta debe cerrar sesión y volver a entrar para que `canManagePlatformAccounts` se refleje (viaja en el JWT, no se consulta en cada request).
- **Commit(s):** (ver commit que introduce este módulo).

### 2026-06-30 — Importar a Cuentas Gmail las cuentas ya existentes en Empleados
- **Qué cambió:** sin quitar ni mover nada de la página, se agregó una sección "Cuentas ya registradas en Empleados sin contraseña guardada" que lista los correos que ya vivían en `Employee.gmailAccounts[]` (dados de alta desde el formulario de Empleados, antes de que existiera este módulo) y que todavía no tienen registro en el gestor de contraseñas. Backend: `GET /api/gmail-accounts/unregistered` calcula esa diferencia; `POST /api/gmail-accounts/import` da de alta el registro usando una contraseña que **sí captura el usuario** (a diferencia de `POST /`, que siempre la genera), porque estas cuentas ya tienen una contraseña real en Gmail que no se puede regenerar a ciegas. Frontend: cada fila pendiente tiene un botón "+ Agregar contraseña" que abre un modal con el correo fijo (no editable) y un campo de contraseña con mostrar/ocultar.
- **Por qué:** el usuario ya tenía correos de Gmail registrados por empleado desde antes de este módulo (capturados solo como texto al dar de alta al empleado, sin contraseña); pidió poder traerlos al gestor y ponerles su contraseña real, sin tocar lo que ya estaba construido.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Confirmación reforzada antes de eliminar una cuenta Gmail
- **Qué cambió:** el botón "Eliminar" en `Cuentas Gmail` ya no usa `confirm()` nativo; ahora abre el mismo tipo de modal propio de la app usado para regenerar contraseña, con advertencia explícita (no se puede deshacer, no afecta la cuenta real en Gmail) y un botón rojo "Sí, eliminar cuenta".
- **Por qué:** mismo pedido que con el botón de regenerar contraseña — que eliminar no sea una acción de un solo clic con un popup fácil de aceptar por reflejo.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Permiso independiente para Cuentas Gmail, controlado solo por sistemas.2@selectshop.com.mx
- **Qué cambió:** se agregó `canManageGmailAccounts` (boolean) a `User`, desacoplado del rol `admin`/`viewer`. Las rutas de `gmail-accounts` ahora se protegen con el nuevo middleware `gmailManagerOnly` (en vez de `adminOnly`), que exige ese permiso en el JWT. En el login (`auth.js`), si el email coincide con la constante `GMAIL_ROOT_EMAIL` (`sistemas.2@selectshop.com.mx`, en `backend/src/config/permissions.js`), se autocorrige esa cuenta a `role: admin` + `canManageGmailAccounts: true` en cada inicio de sesión, sin importar lo que tuviera guardado. En `PUT /api/users/:id`, el campo `canManageGmailAccounts` solo se acepta si quien hace la petición es `sistemas.2@selectshop.com.mx` (403 en cualquier otro caso). En el frontend, `/gmail-accounts` pasó de estar protegida por `AdminRoute` a una nueva `GmailManagerRoute` basada en el permiso; el enlace del sidebar y la columna/checkbox "Cuentas Gmail" en la página de Usuarios (edición de permiso) solo se muestran a `sistemas.2@selectshop.com.mx`.
- **Por qué:** el usuario pidió que el acceso a crear cuentas/contraseñas de Gmail no dependiera del rol general de administrador, sino que una sola cuenta específica (`sistemas.2@selectshop.com.mx`) decida explícitamente quién más puede hacerlo.
- **Nota operativa:** las sesiones ya iniciadas antes de este cambio no tienen el nuevo campo en su JWT — todos, incluida `sistemas.2@selectshop.com.mx`, deben cerrar sesión y volver a entrar para que el permiso se refleje. Si esa cuenta aún no existe, hay que crearla primero desde Usuarios (o `POST /api/auth/register`) con ese correo exacto; al iniciar sesión con ella se autoconvierte en admin con el permiso activo.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Confirmación reforzada antes de regenerar contraseña de Gmail
- **Qué cambió:** en `Cuentas Gmail`, el botón "🔄 Contraseña" ya no dispara la regeneración con un `confirm()` nativo del navegador; ahora abre un modal propio de la app con advertencia explícita (la contraseña actual deja de servir de inmediato) y un botón rojo "Sí, regenerar contraseña" que hay que pulsar deliberadamente. El botón también se re-estilizó (ámbar, `btnWarn`) para distinguirlo visualmente de las acciones normales (Editar/Eliminar).
- **Por qué:** el usuario pidió que el botón de regenerar contraseña no fuera "de tan fácil acceso" — un `confirm()` nativo es fácil de aceptar por reflejo y no deja claro que invalida la contraseña ya compartida con el empleado.
- **Commit(s):** (ver commit que introduce este cambio).

### 2026-06-30 — Módulo de Cuentas Gmail con gestor de contraseñas
- **Qué cambió:** nueva página `Cuentas Gmail` (solo admin) para dar de alta cuentas de Gmail asignadas a empleados registrados. Backend: modelo `GmailAccount` (email único + contraseña cifrada AES-256-GCM), utilidades `backend/src/utils/gmailVault.js` (cifrado/descifrado, generador de contraseñas aleatorias únicas, sugeridor de correo `nombre.apellido@gmail.com` con manejo de colisiones), rutas `backend/src/routes/gmailAccounts.js` (`GET /`, `GET /suggest-email`, `POST /`, `PUT /:id`, `DELETE /:id`, protegidas con `auth`+`adminOnly`), nueva variable de entorno `GMAIL_VAULT_KEY`, y se agregó `cuenta_gmail` al enum de `AuditLog.entity`. Frontend: `GmailAccounts.jsx` con alta (correo autogenerido pero editable, contraseña siempre autogenerada — sin campo para capturarla a mano), mostrar/ocultar y copiar contraseña, regenerar contraseña, editar estado/notas, eliminar, y exportación a Excel de correos+contraseñas. Se sincroniza `Employee.gmailAccounts[]` al crear/eliminar para no romper las vistas existentes (Employees, EmployeeDetail, export de auditoría de correos en Assignments).
- **Por qué:** el equipo venía repitiendo la misma contraseña en todas las cuentas de Gmail creadas para empleados, lo cual causó un problema de seguridad grande. Se necesitaba forzar contraseñas únicas y aleatorias por cuenta, guardarlas de forma recuperable (para poder compartirlas y exportarlas) en vez de solo hash, y dejar rastro de auditoría de quién creó/regeneró/eliminó cada cuenta.
- **Commit(s):** (ver commit que introduce este módulo).

### 2026-06-30 — Respaldo de seguridad + bitácora de proyecto
- **Qué cambió:** se agregó este `CHANGELOG.md`; se creó tag de git `backup-2026-06-30` sobre el estado actual de `main` y se subió a GitHub.
- **Por qué:** el usuario pidió un respaldo antes de continuar trabajando y un documento persistente para que cualquier sesión futura (incluyendo con Claude) pueda entender el proyecto y el historial de cambios con su razón de ser, sin depender de memoria de corto plazo.
- **Commit(s):** (ver commit que introduce este archivo).

### 2026-06-30 — README de handoff del proyecto
- **Qué cambió:** se agregó `README.md` con stack, estructura de carpetas, modelo de datos, variables de entorno y endpoints documentados.
- **Por qué:** preparar el traspaso del proyecto a otro equipo/dueño (documentación de referencia para retomarlo sin conocimiento previo).
- **Commit(s):** `56c095d`.

### 2026-06-29 — Auditoría de correos en Assignments
- **Qué cambió:** se agregó exportación de auditoría de correos en Assignments (`602633b`). Antes se había probado una importación masiva de correos para empleados existentes (`e0131f8`) y se revirtió (`5c9e671`) en favor de este export, por ser más simple y suficiente para el caso de uso.
- **Por qué:** necesidad de auditar/verificar correos corporativos y de Gmail de empleados ya existentes sin arriesgar una importación masiva que pudiera sobrescribir datos.
- **Commit(s):** `e0131f8`, `5c9e671`, `602633b`.

### 2026-06-29 — Restaurar botones de transferencia Accesorios ↔ Activos
- **Qué cambió:** se restauraron los botones "Mover a Accesorios" / "Regresar a Activos" que se habían quitado previamente.
- **Por qué:** se determinó que sí eran necesarios para reclasificar equipo entre catálogos tras la separación de Activos/Accesorios.
- **Commit(s):** `6f30529`.

### 2026-06-25 / 2026-06-26 — Rediseño de Accesorios como catálogo de stock a granel
- **Qué cambió:** Accessories pasó de ser un listado de items individuales a un catálogo por producto con `stockTotal`; se agregó campo `location` a assets y accesorios; filtro por sucursal en Stock; fix de `PUT /assets` que no guardaba `stockTotal`/`location`.
- **Por qué:** el control de accesorios (mouse, teclado, cables, etc.) no tiene sentido por número de serie individual como laptops — se necesitaba trackeo de cantidades por sucursal.
- **Commit(s):** `149ef08`, `b8a4551`, `1a09058`, `ed249a2`, `dd31cb2`, `4447140`, `4ec35e4`, `5de6ab1`, `39fe14e`, `19df29a`, `ca8e149`, `beb0711`, `e0d6b93`.

### 2026-06-25 — Overhaul de Assignments (auditoría) + campo teléfono
- **Qué cambió:** rediseño de filtros y export de Excel en Assignments para calidad de auditoría; se ocultó al empleado "Sistemas" de Assignments mostrando sus activos como disponibles en Stock; se agregó campo `phone` a Employee con búsqueda por número de empleado o teléfono en el modal de asignación de Stock.
- **Por qué:** el equipo asignado a la cuenta genérica "Sistemas" no representa un empleado real — se necesitaba que ese inventario apareciera como disponible en vez de "asignado". El export de Assignments necesitaba ser confiable para auditorías.
- **Commit(s):** `e643e09`, `915fe2c`, `5e4b6ea`, `7d8604f`, `b738337`.

### 2026-06-22 — Healthcheck para monitoreo
- **Qué cambió:** endpoint `HEAD /health` sin auth.
- **Por qué:** Render duerme el backend en free tier tras inactividad; se necesita un monitor externo (UptimeRobot) haciendo ping para reducir cold starts.
- **Commit(s):** `cb7b4e4`.

### 2026-06-16 / 2026-06-17 — Responsiva en PDF con branding por empresa
- **Qué cambió:** generador de PDF de responsiva (pdfkit) con bloques de firma, branding/logo por empresa, corrección de logos y matching de nombres de empresa en DB (incl. typos conocidos); texto legal expandido con artículos completos de la LFT (110, 132, 134, 135); sistema de auditoría (`AuditLog`) y tracking de últim@ que modificó cada registro.
- **Por qué:** requisito legal/operativo de tener responsiva firmable por empleado y empresa, con el texto legal correcto, y trazabilidad de quién hizo qué cambio (auditoría).
- **Commit(s):** `dccde40`, `77663d0`, `77cb7a0`, `ea2ca5c`, `efc8dd8`, `9d8c010`, `28254fd`.

### 2026-06-15 — Fixes de guardado en Mongoose 8 + mejoras de UI en Dashboard/Employees
- **Qué cambió:** fix de ediciones de activos que no guardaban (usar `findById` + `markModified` + `save()` en vez de `findByIdAndUpdate`, necesario por el campo `specs` tipo Mixed); fix de falso positivo en detección de número de serie duplicado; drilldown interactivo de categorías en Dashboard; ComboSelect para sucursal/departamento/razón social; filtro de sucursal en Employees.
- **Por qué:** Mongoose 8 no persiste bien cambios en campos `Mixed` vía `findByIdAndUpdate`; era un bug bloqueante para editar specs de activos.
- **Commit(s):** `48b3c29`, `a2a68e0`, `65a1747`, `4345109`, `90fd748`, `89882a7`, `9e0f787`, `14617f7`, `7043d81`.

### 2026-06-12 — Export de Excel para Assets
- **Qué cambió:** export de Excel con columnas específicas por pestaña/categoría; fix de crash por caracteres inválidos en nombre de hoja; mostrar empleado asignado en la tabla de estatus de Assets.
- **Por qué:** necesidad operativa de exportar inventario a Excel para reportes, sin que el nombre de hoja rompiera el archivo.
- **Commit(s):** `4d86e72`, `831e9b2`, `70c0320`, `baae99e`.

### 2026-06-05 / 2026-06-08 — Detección de duplicados + edición de asignaciones
- **Qué cambió:** detección de números de serie duplicados con visor de duplicados (refinada para excluir periféricos y validar línea telefónica en celulares); filtros interactivos de sucursal/departamento en dashboard; alta de activo desde el modal de asignación de empleado; edición de activos asignados desde el detalle de empleado y desde el modal de edición.
- **Por qué:** evitar altas duplicadas de inventario por error de captura; agilizar el flujo de alta+asignación en un solo paso.
- **Commit(s):** `01202b8`, `8577168`, `c04c341`, `fc894d6`, `ba107d3`, `1c8d062`.

### 2026-06-03 / 2026-06-04 — Setup inicial del proyecto
- **Qué cambió:** primer commit; configuración de deployment (CORS por env var, URL de API dinámica, `.env.example`); rediseño de campos de empleado (`businessName`, `office`, `area`, multi-email); sidebar colapsable; rediseño de dashboard (KPIs, barras por categoría, dona, asignaciones recientes, top empleados); fix de 404 en refresh (regla de rewrite SPA en Vercel); campo de número de serie de cargador/PSU; asignación opcional de empleado al registrar activo; campo `planCost` en celulares.
- **Por qué:** construcción inicial del sistema de control de activos para reemplazar el proceso manual (Excel) de IT.
- **Commit(s):** `21f0019`, `b296f56`, `f1ffd16`, `8d7306d`, `a6f5053`, `a0db094`, `cb25f7c`, `ce248be`, `5490353`.

---

## Notas conocidas pendientes (heredadas de README)

- `users.js` no tiene middleware `auth` aplicado a sus rutas, a diferencia del resto de recursos — revisar antes de exponer sin gateway.
- No hay seed/migration scripts ni tests automatizados; alta de datos manual desde la UI o importación de Excel.
