import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GroupDetail from './pages/GroupDetail';
import ExpenseDetail from './pages/ExpenseDetail';
import ImportWizard from './pages/ImportWizard';
import BalanceSummary from './pages/BalanceSummary';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-500/30 border-t-brand-500 rounded-full animate-spin" />
          <p className="text-white/40 text-sm">Loading...</p>
        </div>
      </div>
    );
  }
  return user ? children : <Navigate to="/login" replace />;
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Navigate to="/" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/groups/:groupId" element={<ProtectedRoute><GroupDetail /></ProtectedRoute>} />
          <Route path="/groups/:groupId/balances" element={<ProtectedRoute><BalanceSummary /></ProtectedRoute>} />
          <Route path="/groups/:groupId/import" element={<ProtectedRoute><ImportWizard /></ProtectedRoute>} />
          <Route path="/expenses/:expenseId" element={<ProtectedRoute><ExpenseDetail /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
