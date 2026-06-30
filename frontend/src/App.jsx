import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
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

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user.role === 'admin' ? children : <Navigate to="/" replace />;
}

function GmailManagerRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user.canManageGmailAccounts ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Employees />} />
          <Route path="employees/:id" element={<EmployeeDetail />} />
          <Route path="assets" element={<Assets />} />
          <Route path="assignments" element={<Assignments />} />
          <Route path="accessories" element={<Accessories />} />
          <Route path="stock" element={<Stock />} />
          <Route path="users"  element={<AdminRoute><Users /></AdminRoute>} />
          <Route path="audit" element={<AdminRoute><Audit /></AdminRoute>} />
          <Route path="gmail-accounts" element={<GmailManagerRoute><GmailAccounts /></GmailManagerRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
