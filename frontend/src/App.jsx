import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useTabFillExamples from './hooks/useTabFillExamples';
import useConfirmDirtyNavigation from './hooks/useConfirmDirtyNavigation';
import usePwaIdentity from './hooks/usePwaIdentity';
import Login from './pages/Login';
import Layout, { isErpOnlyUser } from './components/Layout';
import Dashboard from './pages/Dashboard';
import Indicadores from './pages/Indicadores';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Assets from './pages/Assets';
import Assignments from './pages/Assignments';
import Users from './pages/Users';
import Audit from './pages/Audit';
import Accessories from './pages/Accessories';
import Stock from './pages/Stock';
import GmailAccounts from './pages/GmailAccounts';
import PlatformAccounts from './pages/PlatformAccounts';
import PlatformAccountsErp from './pages/PlatformAccountsErp';
import ResponsivasArchive from './pages/ResponsivasArchive';
import AccountRequests from './pages/AccountRequests';
import SolicitarCuenta from './pages/SolicitarCuenta';
import SolicitarIngreso from './pages/SolicitarIngreso';
import BajaPersonal from './pages/BajaPersonal';
import OnboardingRequests from './pages/OnboardingRequests';
import OffboardingRequests from './pages/OffboardingRequests';
import SolicitarRecurso from './pages/SolicitarRecurso';
import ResourceRequests from './pages/ResourceRequests';
import Shipments from './pages/Shipments';
import ConfirmarEnvio from './pages/ConfirmarEnvio';
import ReportarTicket from './pages/ReportarTicket';
import MesaDeAyuda from './pages/MesaDeAyuda';
import EmployeeLogin from './pages/EmployeeLogin';
import MisTickets from './pages/MisTickets';
import MisSolicitudes from './pages/MisSolicitudes';
import Manuales from './pages/Manuales';
import ManualMesaDeAyuda from './pages/ManualMesaDeAyuda';
import ManualGestorConstancias from './pages/ManualGestorConstancias';
import ManualVentas from './pages/ManualVentas';
import ManualVentasVendedor from './pages/ManualVentasVendedor';
import ManualVentasTelemarketing from './pages/ManualVentasTelemarketing';
import TicketsLayout from './pages/TicketsLayout';
import TicketsDashboard from './pages/TicketsDashboard';
import TicketsBoard from './pages/TicketsBoard';
import TicketsMonitoreo from './pages/TicketsMonitoreo';
import TicketsChats from './pages/TicketsChats';
import TicketsNotasInternas from './pages/TicketsNotasInternas';
import TicketsBuscar from './pages/TicketsBuscar';
import TicketsSLA from './pages/TicketsSLA';
import TicketsCalificaciones from './pages/TicketsCalificaciones';
import TicketsEscalamiento from './pages/TicketsEscalamiento';
import NetworkLayouts from './pages/NetworkLayouts';
import NetworkLayoutDetail from './pages/NetworkLayoutDetail';
import InternalApps from './pages/InternalApps';
import NotFound from './pages/NotFound';
import HelpBot from './components/HelpBot';
import AmbientBackground from './components/AmbientBackground';
import UpdateToast from './components/UpdateToast';

// A propósito NO redirige a /login: quien llegue sin sesión a una ruta
// privada (ej. alguien que edita la URL del formulario público y le quita
// "/solicitar-cuenta") ve un 404 genérico, no una invitación a iniciar
// sesión. Quien ya sabe que existe /login la sigue usando igual.
function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <NotFound />;
}

function AdminRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user.role === 'admin' ? children : <Navigate to="/" replace />;
}

function GmailManagerRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user.canManageGmailAccounts ? children : <Navigate to="/" replace />;
}

function PlatformManagerRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user.canManagePlatformAccounts ? children : <Navigate to="/" replace />;
}

function PlatformErpManagerRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user.canManagePlatformAccountsErp ? children : <Navigate to="/" replace />;
}

// lider.erp/analista.erp (viewer + solo permiso ERP) también entran a
// Tickets, pero acotados a los de tipo 'erp' — el backend hace el filtrado
// real, esto solo evita que la ruta se vea en blanco/redirija de más.
function TicketsRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return (user.role === 'admin' || isErpOnlyUser(user)) ? children : <Navigate to="/" replace />;
}

function ResponsivaViewerRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const allowed = user.role === 'admin'
    || user.canManageGmailAccounts
    || user.canManagePlatformAccounts
    || user.canManagePlatformAccountsErp;
  return allowed ? children : <Navigate to="/" replace />;
}

// Solo Gmail/Plataformas — ERP tiene su propia página de solicitudes
// (account-requests-erp), separada igual que ya está separada la
// administración de esas cuentas.
function AccountRequestsRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const allowed = user.canManageGmailAccounts || user.canManagePlatformAccounts;
  return allowed ? children : <Navigate to="/" replace />;
}

// Un usuario con SOLO el permiso de Plataformas ERP no debe ver el resto de la
// aplicación (Dashboard, Empleados, Activos, etc.) — únicamente su página de
// cuentas y Responsivas. Si intenta entrar por URL directa, se le regresa ahí.
function NotErpOnlyRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return isErpOnlyUser(user) ? <Navigate to="/platform-accounts-erp" replace /> : children;
}

// Sesión de EMPLEADO (portal Mis Tickets) — separada por completo de la
// sesión de Sistemas (PrivateRoute/token de arriba). Si no hay sesión,
// manda a activarse/iniciar sesión y se acuerda a dónde quería ir
// (?next=), para volver ahí después de entrar — ej. el wizard de Mesa de
// Ayuda manda a /mesa-de-ayuda/reportar-ticket?tipo=software, y eso no
// debe perderse.
function EmployeeRoute({ children }) {
  const location = useLocation();
  const token = localStorage.getItem('employeeToken');
  if (token) return children;
  const next = encodeURIComponent(location.pathname + location.search);
  return <Navigate to={`/mesa-de-ayuda/empleado/login?next=${next}`} replace />;
}

// Todas las rutas de Mesa de Ayuda viven bajo /mesa-de-ayuda/... desde
// 2026-07-23 (antes eran rutas sueltas en la raíz, ej. /reportar-ticket) —
// pedido explícito del usuario: Chrome/Edge no dejan instalar 2 apps
// separadas del mismo origen si ambas cubren scope "/" completo, así que
// Mesa de Ayuda necesitaba un prefijo real y propio para tener su PROPIO
// scope de PWA distinto al del Sistema de Tickets (ver vite.config.js).
// `LegacyRedirect` mantiene vivos los links/QR/favoritos ya compartidos
// con las URLs viejas (sin prefijo) — conserva query string y hash porque
// el wizard de Reportar Ticket depende de "?tipo=..." para saltar
// directo a una categoría.
function LegacyRedirect({ to }) {
  const location = useLocation();
  return <Navigate to={`${to}${location.search}${location.hash}`} replace />;
}

function LegacyConfirmarEnvioRedirect() {
  const location = useLocation();
  // El token es el único segmento dinámico de esta ruta — se reconstruye
  // a mano en vez de usar useParams() porque el token puede llevar
  // caracteres que ya vienen url-encoded en location.pathname.
  const token = location.pathname.split('/').pop();
  return <Navigate to={`/mesa-de-ayuda/confirmar-envio/${token}${location.search}${location.hash}`} replace />;
}

// usePwaIdentity usa useLocation — necesita vivir DENTRO de <BrowserRouter>,
// a diferencia de useTabFillExamples/useConfirmDirtyNavigation (que no
// dependen de la ruta y por eso se llaman directo en App()).
function PwaIdentityManager() {
  usePwaIdentity();
  return null;
}

// Robot de Ayuda + fondo animado — montados una sola vez aquí (no por
// página) para que persistan en TODO el lado de empleado: el portal con
// sesión (antes vivían solo en PortalLayout.jsx/MesaDeAyuda.jsx), las
// páginas públicas sin sesión (Solicitar Cuenta/Recurso/Ingreso) y el
// login/activación (/mesa-de-ayuda/empleado/login, WelcomeScreen dentro de
// /mesa-de-ayuda) — pedido explícito del usuario, tanto para el bot
// (alguien nuevo que ni sabe cómo entrar) como para el fondo animado ("a
// todas las páginas"). A propósito NO se muestran en el panel de Sistemas
// (Layout.jsx y sus rutas bajo "/") ni en /login (ese es otro público,
// otra sesión, otro tema visual). Un solo prefijo desde que todo Mesa de
// Ayuda vive bajo /mesa-de-ayuda/... (2026-07-23) — antes eran ~10
// prefijos sueltos, uno por cada ruta de primer nivel.
const EMPLOYEE_PATH_PREFIXES = ['/mesa-de-ayuda'];

function HelpBotGate() {
  const location = useLocation();
  const show = EMPLOYEE_PATH_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
  return show ? <HelpBot /> : null;
}

function AmbientBackgroundGate() {
  const location = useLocation();
  const show = EMPLOYEE_PATH_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
  return show ? <AmbientBackground /> : null;
}

export default function App() {
  // Un solo listener global (ver el hook) — cubre cualquier campo de
  // cualquier página/pestaña, sin tener que tocar cada formulario.
  useTabFillExamples();
  // Igual: un solo listener global que protege CUALQUIER navegación (sidebar
  // admin, portal de empleado, etc.) mientras haya un panel de editar con
  // cambios sin guardar — ver el hook para el detalle de cómo funciona.
  useConfirmDirtyNavigation();
  return (
    <BrowserRouter>
      <PwaIdentityManager />
      {/* A diferencia del Robot de Ayuda / fondo animado (solo lado de
          empleado), el aviso de actualización aplica a TODA la app —
          panel de Sistemas incluido — así que se monta directo, sin pasar
          por un "Gate" que lo filtre por ruta. */}
      <UpdateToast />
      <AmbientBackgroundGate />
      <HelpBotGate />
      {/* `position: relative; z-index: 1` propio — así TODO lo que
          renderiza cualquier página (con o sin z-index/position propios)
          queda por encima del fondo animado de un solo golpe, sin tener
          que tocar cada página una por una (mismo problema que ya se
          resolvió a mano en MesaDeAyuda.jsx la primera vez: un elemento
          normal sin position no le gana en pintado a un `position: fixed`
          con z-index 0 a menos que también tenga su propio stacking
          context). El Robot de Ayuda (z-index 200, ver HelpBot.module.css)
          sigue por fuera de este wrapper — necesita estar SIEMPRE arriba
          de todo, incluida cualquier página. */}
      <div style={{ position: 'relative', zIndex: 1 }}>
        <Routes>
        <Route path="/login" element={<Login />} />
        {/* Pública, sin login ni sidebar — el link se comparte con quien
            necesite pedir una cuenta/acceso, sin darle acceso al resto de
            la aplicación. */}
        {/* Punto de entrada único para empleados: agrupa en botones todas
            las solicitudes públicas + el acceso al sistema de Tickets. */}
        <Route path="/mesa-de-ayuda" element={<MesaDeAyuda />} />
        <Route path="/mesa-de-ayuda/solicitar-cuenta" element={<SolicitarCuenta />} />
        <Route path="/mesa-de-ayuda/solicitar-ingreso" element={<SolicitarIngreso />} />
        <Route path="/mesa-de-ayuda/solicitar-recurso" element={<SolicitarRecurso />} />
        <Route path="/mesa-de-ayuda/confirmar-envio/:token" element={<ConfirmarEnvio />} />
        {/* Portal de empleado (Mis Tickets) — login separado del de
            Sistemas; reportar un ticket y ver el historial ya requieren
            haber iniciado sesión (antes era anónimo). */}
        <Route path="/mesa-de-ayuda/empleado/login" element={<EmployeeLogin />} />
        <Route path="/mesa-de-ayuda/reportar-ticket" element={<EmployeeRoute><ReportarTicket /></EmployeeRoute>} />
        <Route path="/mesa-de-ayuda/mis-tickets" element={<EmployeeRoute><MisTickets /></EmployeeRoute>} />
        <Route path="/mesa-de-ayuda/mis-solicitudes" element={<EmployeeRoute><MisSolicitudes /></EmployeeRoute>} />
        <Route path="/mesa-de-ayuda/baja-personal" element={<EmployeeRoute><BajaPersonal /></EmployeeRoute>} />
        <Route path="/mesa-de-ayuda/manuales" element={<EmployeeRoute><Manuales /></EmployeeRoute>} />
        <Route path="/mesa-de-ayuda/manuales/mesa-de-ayuda" element={<EmployeeRoute><ManualMesaDeAyuda /></EmployeeRoute>} />
        <Route path="/mesa-de-ayuda/manuales/gestor-constancias-aduaneras" element={<EmployeeRoute><ManualGestorConstancias /></EmployeeRoute>} />
        <Route path="/mesa-de-ayuda/manuales/ventas" element={<EmployeeRoute><ManualVentas /></EmployeeRoute>} />
        <Route path="/mesa-de-ayuda/manuales/ventas/vendedor" element={<EmployeeRoute><ManualVentasVendedor /></EmployeeRoute>} />
        <Route path="/mesa-de-ayuda/manuales/ventas/telemarketing" element={<EmployeeRoute><ManualVentasTelemarketing /></EmployeeRoute>} />
        {/* Redirecciones desde las URLs viejas (sin /mesa-de-ayuda) — para
            cualquier link/QR/favorito ya compartido antes de este cambio
            (2026-07-23). Conservan query string y hash (ver
            LegacyRedirect). Nuevas por completo: nunca existieron antes
            de este refactor. */}
        <Route path="/solicitar-cuenta" element={<LegacyRedirect to="/mesa-de-ayuda/solicitar-cuenta" />} />
        <Route path="/solicitar-ingreso" element={<LegacyRedirect to="/mesa-de-ayuda/solicitar-ingreso" />} />
        <Route path="/solicitar-recurso" element={<LegacyRedirect to="/mesa-de-ayuda/solicitar-recurso" />} />
        <Route path="/confirmar-envio/:token" element={<LegacyConfirmarEnvioRedirect />} />
        <Route path="/empleado/login" element={<LegacyRedirect to="/mesa-de-ayuda/empleado/login" />} />
        <Route path="/reportar-ticket" element={<LegacyRedirect to="/mesa-de-ayuda/reportar-ticket" />} />
        <Route path="/mis-tickets" element={<LegacyRedirect to="/mesa-de-ayuda/mis-tickets" />} />
        <Route path="/mis-solicitudes" element={<LegacyRedirect to="/mesa-de-ayuda/mis-solicitudes" />} />
        <Route path="/baja-personal" element={<LegacyRedirect to="/mesa-de-ayuda/baja-personal" />} />
        <Route path="/manuales" element={<LegacyRedirect to="/mesa-de-ayuda/manuales" />} />
        <Route path="/manuales/mesa-de-ayuda" element={<LegacyRedirect to="/mesa-de-ayuda/manuales/mesa-de-ayuda" />} />
        <Route path="/manuales/gestor-constancias-aduaneras" element={<LegacyRedirect to="/mesa-de-ayuda/manuales/gestor-constancias-aduaneras" />} />
        <Route path="/manuales/ventas" element={<LegacyRedirect to="/mesa-de-ayuda/manuales/ventas" />} />
        <Route path="/manuales/ventas/vendedor" element={<LegacyRedirect to="/mesa-de-ayuda/manuales/ventas/vendedor" />} />
        <Route path="/manuales/ventas/telemarketing" element={<LegacyRedirect to="/mesa-de-ayuda/manuales/ventas/telemarketing" />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<NotErpOnlyRoute><Dashboard /></NotErpOnlyRoute>} />
          <Route path="indicadores" element={<NotErpOnlyRoute><Indicadores /></NotErpOnlyRoute>} />
          <Route path="employees" element={<NotErpOnlyRoute><Employees /></NotErpOnlyRoute>} />
          <Route path="employees/:id" element={<NotErpOnlyRoute><EmployeeDetail /></NotErpOnlyRoute>} />
          <Route path="assets" element={<NotErpOnlyRoute><Assets /></NotErpOnlyRoute>} />
          <Route path="assignments" element={<NotErpOnlyRoute><Assignments /></NotErpOnlyRoute>} />
          <Route path="accessories" element={<NotErpOnlyRoute><Accessories /></NotErpOnlyRoute>} />
          <Route path="stock" element={<NotErpOnlyRoute><Stock /></NotErpOnlyRoute>} />
          <Route path="users"  element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="audit" element={<AdminRoute><Audit /></AdminRoute>} />
          <Route path="gmail-accounts" element={<GmailManagerRoute><GmailAccounts /></GmailManagerRoute>} />
          <Route path="platform-accounts" element={<PlatformManagerRoute><PlatformAccounts /></PlatformManagerRoute>} />
          <Route path="platform-accounts-erp" element={<PlatformErpManagerRoute><PlatformAccountsErp /></PlatformErpManagerRoute>} />
          <Route path="responsivas" element={<ResponsivaViewerRoute><ResponsivasArchive /></ResponsivaViewerRoute>} />
          <Route path="account-requests" element={<AccountRequestsRoute><AccountRequests /></AccountRequestsRoute>} />
          <Route
            path="account-requests-erp"
            element={
              <PlatformErpManagerRoute>
                <AccountRequests
                  types={['platform_erp']}
                  pageTitle="Solicitudes ERP"
                  pageSubtitle="Altas de cuentas ERP pedidas desde el formulario — revisa y aprueba antes de crear cada cuenta."
                />
              </PlatformErpManagerRoute>
            }
          />
          <Route path="onboarding-requests" element={<AdminRoute><OnboardingRequests /></AdminRoute>} />
          <Route path="offboarding-requests" element={<AdminRoute><OffboardingRequests /></AdminRoute>} />
          <Route path="resource-requests" element={<AdminRoute><ResourceRequests /></AdminRoute>} />
          <Route path="shipments" element={<AdminRoute><Shipments /></AdminRoute>} />
          <Route path="tickets" element={<TicketsRoute><TicketsLayout /></TicketsRoute>}>
            <Route index element={<TicketsDashboard />} />
            <Route path="general" element={<TicketsBoard />} />
            <Route path="monitoreo" element={<TicketsMonitoreo />} />
            <Route path="chats" element={<TicketsChats />} />
            <Route path="notas" element={<TicketsNotasInternas />} />
            <Route path="buscar" element={<TicketsBuscar />} />
            <Route path="sla" element={<TicketsSLA />} />
            <Route path="calificaciones" element={<TicketsCalificaciones />} />
            <Route path="escalamiento" element={<TicketsEscalamiento />} />
            <Route path="aplicaciones" element={<AdminRoute><InternalApps /></AdminRoute>} />
          </Route>
          <Route path="network-layouts" element={<AdminRoute><NetworkLayouts /></AdminRoute>} />
          <Route path="network-layouts/:id" element={<AdminRoute><NetworkLayoutDetail /></AdminRoute>} />
        </Route>
        {/* Cualquier otra ruta que no exista — mismo 404 genérico. */}
        <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
