import { createContext, useContext, useState, useEffect } from 'react';
import API from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('insightmesh_token');
    const savedUser = localStorage.getItem('insightmesh_user');
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('insightmesh_token');
        localStorage.removeItem('insightmesh_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const { data } = await API.post('/api/auth/login', { email, password });
    localStorage.setItem('insightmesh_token', data.token);
    localStorage.setItem('insightmesh_user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const register = async (email, password) => {
    const { data } = await API.post('/api/auth/register', { email, password });
    localStorage.setItem('insightmesh_token', data.token);
    localStorage.setItem('insightmesh_user', JSON.stringify(data.user));
    setUser(data.user);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('insightmesh_token');
    localStorage.removeItem('insightmesh_user');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
