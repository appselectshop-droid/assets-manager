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

## Corte (cutover)

- Redirect agregado en `frontend/vercel.json` (dominio viejo de Vercel →
  `https://activos.eup.com.mx`, `permanent: false` a propósito — durante el
  período de gracia de rollback, un redirect temporal es más fácil de
  revertir que uno permanente cacheado agresivamente por los navegadores).
- Periodo de gracia acordado: **1 semana** con Render/Vercel/Atlas
  disponibles como rollback antes de darlos de baja definitivamente.
- Pendiente del lado del usuario (fuera del alcance de esta sesión, sin
  acceso a esos dashboards): pausar el servicio backend en Render para
  evitar escrituras dobles, y avisar a los empleados.
