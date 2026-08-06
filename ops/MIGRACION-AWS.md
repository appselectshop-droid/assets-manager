# Migración a AWS (2026-08-02)

Resumen técnico de la migración de infraestructura de assets-manager, de
Vercel + Render + MongoDB Atlas a un solo EC2 en AWS corriendo todo por
Docker. Este documento es la referencia operativa; el Word entregado al
usuario (`Migración a AWS — Assets Manager.docx`) es una versión narrativa
del mismo contenido.

## Arquitectura

```
                         Internet
                            │
                            ▼
              activos.eup.com.mx (HTTPS, Let's Encrypt)
                            │
                    ┌───────┴────────┐
                    │   EC2 (Ubuntu)  │  t3.small, us-east-1
                    │  i-0a9ebde3eaf58b188
                    │                 │
                    │  nginx (frontend) :80/:443
                    │    ├─ / → SPA (React build)
                    │    ├─ /mesa-de-ayuda → shell PWA aparte
                    │    └─ /api/ → proxy_pass → backend:4000
                    │                 │
                    │  backend (Node/Express) :4000 (no expuesto al host)
                    │                 │
                    │  mongo (MongoDB 7, self-hosted) :27017 (no expuesto)
                    │    └─ volumen: mongo-data (persistente)
                    └────────────────┘
                            │
                somewhere.mongo-backups → S3 (cron diario 12:00)
```

## Recursos creados en AWS (cuenta 294149409385, us-east-1)

| Recurso | Nombre / ID |
|---|---|
| Usuario IAM (deploy, uso humano por CLI) | `assets-manager-deploy` |
| Rol IAM (EC2, runtime) | `assets-manager-ec2-role` — lee el Secret y escribe en el bucket de backups, sin Access Keys guardadas |
| Bucket S3 (backups) | `eup-assets-manager-backups` — privado, versionado, cifrado SSE-S3, expira objetos a los 90 días |
| Security group | `sg-00471b15c3d4aaaaf` — 22 (SSH) solo desde la IP del administrador, 80/443 abiertos |
| Key pair SSH | `assets-manager-key` (privada en `~/.ssh/assets-manager-ec2.pem`, nunca subida a ningún lado) |
| Instancia EC2 | `i-0a9ebde3eaf58b188` — Ubuntu 22.04, t3.small, 30 GB gp3, **sin Elastic IP** (decisión explícita: evitar reiniciar la instancia; un `stop/start` sí le cambiaría la IP pública) |
| Secret (Secrets Manager) | `assets-manager/backend-env` — JWT_SECRET, GMAIL_VAULT_KEY, VAPID keys, Telegram, Azure/Graph (notificaciones por correo), FRONTEND_URL |

## Base de datos

- **Antes**: MongoDB Atlas (`cluster0.9o99oee.mongodb.net`), usuario `assets-admin` con rol `atlasAdmin`.
- **Ahora**: MongoDB 7 self-hosted en el contenedor `mongo`, con el único volumen persistente real del stack (`mongo-data` → `/data/db`).
- Multer usa `memoryStorage` en todo el backend — los adjuntos (firmas, fotos, PDFs) se guardan como buffers dentro de los documentos de Mongo, no en disco. Por eso **no hace falta un segundo volumen** para uploads, a diferencia de lo que suele asumirse en instructivos genéricos de "Docker con volúmenes".
- Migración: `mongodump --uri="$MONGO_URI"` (Atlas, solo lectura) → `mongorestore --db assets-manager --drop` dentro del contenedor `mongo`. Verificado documento por documento (conteos por colección) antes de dar por buena cada corrida.
- Los respaldos manuales de esta migración quedaron en
  `assets-manager-db-backups/backup-2026-08-02-final2/` (junto al repo en
  OneDrive, fuera de git — son datos reales de empleados/activos).

**Cuidado real que se topó esta migración**: `responsivaarchives` es una
colección lenta de volcar (documentos con binarios grandes — fotos/PDFs
firmados). Un primer intento de dump "final" antes del corte se cortó a
medio camino (43 de 87 documentos) porque el proceso tardó más que el
timeout de la sesión que lo estaba corriendo — el `mongorestore`
**no reportó ningún error** porque el `.bson` truncado seguía siendo
válido hasta ese punto. Se detectó comparando conteos por colección contra
el respaldo anterior (no coincidían) y se resolvió repitiendo el dump en
segundo plano (`nohup ... &`) sin límite de tiempo corto, hasta que
terminó de verdad (87/87). **Lección**: nunca dar por bueno un
`mongodump`/`mongorestore` de una colección con documentos grandes solo
porque el comando "no tronó" — comparar conteos por colección contra una
corrida anterior conocida.

## Secretos

Viven en `assets-manager/backend-env` (Secrets Manager), nunca en el
servidor como Access Keys. El EC2 los lee así:

```bash
aws secretsmanager get-secret-value --secret-id assets-manager/backend-env \
  --region us-east-1 --query SecretString --output text
```

Esto funciona sin ninguna credencial guardada porque el EC2 tiene el rol
`assets-manager-ec2-role` adjunto (instance profile) — las credenciales se
resuelven solas vía el servicio de metadata de la instancia.

Para actualizar un secreto: editar el JSON, `aws secretsmanager
put-secret-value`, y en el servidor volver a correr el fetch de arriba +
regenerar `.env` + `docker compose up -d backend` (y `frontend` si cambió
`VAPID_PUBLIC_KEY`, porque `VITE_VAPID_PUBLIC_KEY` se hornea en el build).

**Ojo**: el `.env` local de desarrollo (`backend/.env`) NO es necesariamente
igual al de producción real — en esta migración se descubrió que
`FRONTEND_URL` ahí decía `http://localhost:3000` (valor de desarrollo)
mientras que Render tenía el real. Antes de asumir que un `.env` local
refleja producción, hay que compararlo contra el dashboard real (Render, en
este caso) — el único campo que sí era fiable en el `.env` local era
`MONGO_URI`, porque no hay ambiente de staging separado.

**Corrección real que pasó en esta migración**: el primer secreto subido a
Secrets Manager (Fase 4) se armó a partir de `backend/.env` local, que
resultó tener valores de desarrollo distintos a los reales de Render —
además le faltaban 4 variables que sí existían en Render
(`AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`,
`NOTIFICATIONS_FROM_EMAIL`, usadas por `backend/src/utils/graphMail.js`
para avisos por correo vía Microsoft Graph — best-effort, no rompe nada si
faltan, pero la función de avisos por correo no manda nada). Se corrigió
exportando el `.env` real desde el dashboard de Render y resubiendo el
secreto completo con las 12 llaves. Se verificó el `GMAIL_VAULT_KEY` real
descifrando en vivo una contraseña ya migrada, dentro del contenedor:

```bash
docker compose exec -T backend node -e '
const mongoose = require("mongoose");
const { decryptPassword } = require("./src/utils/gmailVault");
mongoose.connect(process.env.MONGO_URI).then(async () => {
  const doc = await mongoose.connection.db.collection("gmailaccounts").findOne({});
  console.log(decryptPassword(doc.passwordEncrypted).length); // longitud, nunca el valor
  process.exit(0);
});'
```

## TLS / dominio

- Dominio `eup.com.mx` administrado en Hosting-Mexico (fuera de AWS, decisión
  explícita: no migrar el DNS completo a Route 53, solo se agregó un
  registro A para el subdominio `activos`).
- Certificado real de Let's Encrypt (webroot, `certbot`), renovación
  automática vía el timer de systemd de `certbot` + `--deploy-hook` que
  reinicia el contenedor `frontend` para que tome el cert nuevo.
- `frontend/nginx.conf` — bloque 80 solo redirige a 443 (y sirve el
  `.well-known/acme-challenge` para la renovación); bloque 443 sirve la app.

## Backups

`ops/backup-to-s3.sh`, cron diario a las 12:00 (root, en el EC2):
`mongodump --archive --gzip` (dump lógico, no los archivos crudos de
`/data/db`) → sube a `s3://eup-assets-manager-backups/mongo/` → borra
copias locales de más de 7 días (S3 ya expira solas a los 90).

Restaurar un backup puntual:
```bash
aws s3 cp s3://eup-assets-manager-backups/mongo/<archivo>.archive.gz /tmp/
cd ~/assets-manager && set -a && source .env && set +a
docker compose exec -T mongo mongorestore \
  --username "$MONGO_ROOT_USER" --password "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin --drop --archive --gzip < /tmp/<archivo>.archive.gz
```

## Cómo mandar un cambio nuevo

1. Editar código, commit + push a `main` (GitHub:
   `appselectshop-droid/assets-manager`).
2. En el EC2: `git pull`, luego reconstruir solo lo que cambió:
   ```bash
   cd ~/assets-manager
   docker compose build backend   # o frontend, o ambos
   docker compose up -d backend   # recrea solo ese contenedor
   ```
3. `mongo` no se toca en un deploy normal — solo `backend`/`frontend` se
   reconstruyen y recrean.

(Pendiente, no implementado: automatizar el paso 2 con GitHub Actions para
que un push a `main` despliegue solo con eso, sin entrar por SSH.)

### El EC2 ya es un clon real de git (no un tarball suelto)

Al principio de la migración, el código llegó al EC2 por `scp` de un
tarball (más rápido para probar, pero sin trazabilidad ni forma fácil de
actualizar). Se convirtió después a un clon real:

1. `mv assets-manager assets-manager-tarball-backup` (respaldo, sin borrar).
2. `git clone https://github.com/appselectshop-droid/assets-manager.git assets-manager`.
3. Copiar `.env` (secretos reales) y `certbot-www/` (webroot de Let's
   Encrypt) del respaldo al clon nuevo.
4. `docker compose up -d` desde el clon nuevo — Docker Compose identifica
   los contenedores existentes por **nombre de proyecto** (el nombre de la
   carpeta, `assets-manager` en ambos casos), así que reconoció los
   contenedores ya corriendo y no recreó nada — cero downtime.

**Ojo con el cron**: el script de respaldo se había copiado a mano a
`scripts/backup-to-s3.sh` en el tarball, pero en el repo real vive en
`ops/backup-to-s3.sh`. Al convertir a clon de git, el cron seguía
apuntando a la ruta vieja (que ya no existe) — se corrigió actualizando el
crontab de root a la ruta real (`ops/backup-to-s3.sh`) y se volvió a
probar. Si algún día el respaldo diario deja de aparecer en S3, revisar
primero que la ruta en `sudo crontab -l` sea la del repo, no una copia
suelta.

## Acceso SSH — la IP del administrador cambia

El security group (`sg-00471b15c3d4aaaaf`) solo permite SSH (puerto 22)
desde **una IP pública específica**, la del administrador al momento de
crear la regla — no desde cualquier IP. Los proveedores de internet
residenciales suelen reasignar la IP pública cada tantos días/semanas, así
que un intento de SSH que antes funcionaba puede empezar a dar
`Operation timed out` sin que nada del servidor haya cambiado.

Diagnóstico rápido:
```bash
curl -s https://checkip.amazonaws.com   # IP publica actual
aws ec2 describe-security-groups --group-ids sg-00471b15c3d4aaaaf \
  --query 'SecurityGroups[0].IpPermissions[?ToPort==`22`].IpRanges[].CidrIp' \
  --output text --profile assets-manager --region us-east-1   # IP permitida
```
Si no coinciden, actualizar la regla (revocar la vieja, autorizar la
nueva) con `aws ec2 revoke-security-group-ingress` /
`authorize-security-group-ingress`. La instancia y el servicio nunca están
"caídos" en este caso — es únicamente el firewall bloqueando la IP nueva.

## Corte (cutover)

- Redirect agregado en `frontend/vercel.json` (dominio viejo de Vercel →
  `https://activos.eup.com.mx`, `permanent: false` a propósito — durante el
  período de gracia de rollback, un redirect temporal es más fácil de
  revertir que uno permanente cacheado agresivamente por los navegadores).
  - Primer intento fallido: mezclar `source: "/(.*)"`  (regex, grupo sin
    nombre) con `destination: ".../:path*"` (segmento con nombre) — Vercel
    lo rechaza (`invalid-route-destination-segment`) y el deploy queda en
    `failure`. Se detectó revisando el commit status del SHA en GitHub
    (`gh api repos/.../commits/<sha>/status`), no desde el dashboard.
    Corregido usando `source: "/:path*"` (segmento con nombre en ambos
    lados) — deploy exitoso, verificado con `curl` que rutas profundas
    (`/dashboard`) redirigen 307 a `activos.eup.com.mx/dashboard`.
  - La raíz (`/`) tardó en reflejar el redirect por cache de CDN de Vercel
    (`x-vercel-cache: HIT`) — normal, se vence sola; hay un "Purge Cache"
    manual en el dashboard si se necesita inmediato.
- Periodo de gracia acordado: **1 semana** con Render/Vercel/Atlas
  disponibles como rollback antes de darlos de baja definitivamente.
- Pendiente del lado del usuario (fuera del alcance de esta sesión, sin
  acceso a esos dashboards): pausar el servicio backend en Render para
  evitar escrituras dobles, y avisar a los empleados.
