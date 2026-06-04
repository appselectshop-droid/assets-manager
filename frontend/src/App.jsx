import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Employees from './pages/Employees';
import EmployeeDetail from './pages/EmployeeDetail';
import Assets from './pages/Assets';
import Assignments from './pages/Assignments';
import Users from './pages/Users';

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token');
  return token ? children : <Navigate to="/login" replace />;
}

function AdminRoute({ children }) {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  return user.role === 'admin' ? children : <Navigate to="/" replace />;
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
          <Route path="users" element={<AdminRoute><Users /></AdminRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
