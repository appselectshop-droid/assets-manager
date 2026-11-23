// Endpoint del conector MCP de Assets Manager (2026-11-23, pedido explícito
// del usuario: "crea la opción para conectar un MCP a Claude de esta
// aplicación"). Transporte Streamable HTTP en modo stateless (sin sesiones:
// cada POST crea su propio servidor), respuestas JSON (sin SSE) para que
// nginx no tenga que manejar streaming.
//
// Autenticación con una llave creada en ⚙️ Configuración → Conexión con Claude
// (ver routes/mcpKeys.js):
//   - Header `Authorization: Bearer amk_…`  → Claude Code / Claude Desktop.
//   - URL `/api/mcp/k/amk_…`                → conectores personalizados de
//     claude.ai, que no permiten mandar headers propios.
// SOLO LECTURA: ver mcp/tools.js.
const router = require('express').Router();
const crypto = require('crypto');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const McpKey = require('../models/McpKey');
const { TOOLS } = require('../mcp/tools');

const hashKey = (k) => crypto.createHash('sha256').update(k).digest('hex');

// Límite por llave, en memoria (se reinicia con cada despliegue).
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 120;
const hits = new Map();
function rateLimited(id) {
  const now = Date.now();
  const arr = (hits.get(id) || []).filter((t) => now - t < WINDOW_MS);
  arr.push(now);
  hits.set(id, arr);
  return arr.length > MAX_PER_WINDOW;
}

function rpcError(res, status, message) {
  return res.status(status).json({ jsonrpc: '2.0', error: { code: -32001, message }, id: null });
}

async function authKey(req, res, next) {
  try {
    const bearer = (req.headers.authorization || '').match(/^Bearer\s+(\S+)$/i)?.[1];
    const raw = req.params.key || bearer;
    if (!raw || !raw.startsWith('amk_')) return rpcError(res, 401, 'Falta la llave de acceso (Authorization: Bearer amk_…)');
    const key = await McpKey.findOne({ keyHash: hashKey(raw) });
    if (!key || key.revokedAt) return rpcError(res, 401, 'Llave inválida o revocada');
    if (key.expiresAt && key.expiresAt < new Date()) return rpcError(res, 401, 'La llave ya venció');
    if (!key.modules.length) return rpcError(res, 403, 'La llave no tiene ningún módulo autorizado');
    if (rateLimited(String(key._id))) return rpcError(res, 429, 'Demasiadas solicitudes, espera un minuto');
    req.mcpKey = key;
    McpKey.updateOne({ _id: key._id }, { $set: { lastUsedAt: new Date(), lastUsedIp: req.ip } }).catch(() => {});
    next();
  } catch (err) {
    rpcError(res, 500, err.message);
  }
}

function buildServer(key) {
  const modules = key.modules;
  const tools = TOOLS.filter((t) => modules.includes(t.module));
  const server = new Server(
    { name: 'assets-manager', version: '1.0.0' },
    {
      capabilities: { tools: {} },
      instructions: 'Datos internos de Assets Manager (Select Shop MB): activos de TI y asignaciones, empleados, tickets y solicitudes de Mesa de Ayuda, y pagos recurrentes de TI. Solo lectura. Fechas en formato YYYY-MM-DD.',
    },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { readOnlyHint: true, openWorldHint: false },
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const tool = tools.find((t) => t.name === request.params.name);
    let ok = true;
    try {
      if (!tool) {
        ok = false;
        return { isError: true, content: [{ type: 'text', text: `Herramienta no disponible para esta llave: ${request.params.name}` }] };
      }
      const result = await tool.run(request.params.arguments || {}, { modules });
      if (result?.error) ok = false;
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 1) }], isError: !!result?.error };
    } catch (err) {
      ok = false;
      return { isError: true, content: [{ type: 'text', text: `Error: ${err.message}` }] };
    } finally {
      McpKey.updateOne({ _id: key._id }, {
        $inc: { useCount: 1 },
        $push: { recentCalls: { $each: [{ tool: request.params.name, at: new Date(), ok }], $slice: -25 } },
      }).catch(() => {});
    }
  });

  return server;
}

async function handle(req, res) {
  const server = buildServer(req.mcpKey);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    if (!res.headersSent) rpcError(res, 500, err.message);
  }
}

const notAllowed = (req, res) => res.status(405).set('Allow', 'POST').json({
  jsonrpc: '2.0', error: { code: -32000, message: 'Método no permitido (servidor sin sesiones: usa POST)' }, id: null,
});

router.post('/', authKey, handle);
router.post('/k/:key', authKey, handle);
router.get(['/', '/k/:key'], notAllowed);
router.delete(['/', '/k/:key'], notAllowed);

module.exports = router;
module.exports.hashKey = hashKey;
