import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout, { isErpOnlyUser } from './components/Layout';
import Dashboard from './pages/Dashboard';
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
import OnboardingRequests from './pages/OnboardingRequests';
import SolicitarRecurso from './pages/SolicitarRecurso';
import ResourceRequests from './pages/ResourceRequests';
import NotFound from './pages/NotFound';

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

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Pública, sin login ni sidebar — el link se comparte con quien
            necesite pedir una cuenta/acceso, sin darle acceso al resto de
            la aplicación. */}
        <Route path="/solicitar-cuenta" element={<SolicitarCuenta />} />
        <Route path="/solicitar-ingreso" element={<SolicitarIngreso />} />
        <Route path="/solicitar-recurso" element={<SolicitarRecurso />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<NotErpOnlyRoute><Dashboard /></NotErpOnlyRoute>} />
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
          <Route path="resource-requests" element={<AdminRoute><ResourceRequests /></AdminRoute>} />
        </Route>
        {/* Cualquier otra ruta que no exista — mismo 404 genérico. */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
