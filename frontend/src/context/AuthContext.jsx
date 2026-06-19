import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem('spreetail_user');
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('spreetail_token');
    if (token) {
      authApi.me()
        .then((res) => {
          setUser(res.data.user);
          localStorage.setItem('spreetail_user', JSON.stringify(res.data.user));
        })
        .catch(() => {
          localStorage.removeItem('spreetail_token');
          localStorage.removeItem('spreetail_user');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = (token, userData) => {
    localStorage.setItem('spreetail_token', token);
    localStorage.setItem('spreetail_user', JSON.stringify(userData));
    setUser(userData);
  };

  const logout = () => {
    localStorage.removeItem('spreetail_token');
    localStorage.removeItem('spreetail_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
