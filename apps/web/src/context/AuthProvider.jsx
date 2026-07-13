import { createContext, useContext } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  const me = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => api.get('/auth/me'),
    retry: false,
  });

  const login = useMutation({
    mutationFn: (creds) => api.post('/auth/login', creds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });

  const signup = useMutation({
    mutationFn: (creds) => api.post('/auth/signup', creds),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  });

  const logout = useMutation({
    mutationFn: () => api.post('/auth/logout'),
    onSuccess: () => {
      queryClient.clear();
      queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
    },
  });

  const value = {
    user: me.data?.user ?? null,
    workspaces: me.data?.workspaces ?? [],
    status: me.status,
    isLoading: me.isLoading,
    isAuthenticated: !!me.data?.user,
    login,
    signup,
    logout,
    refresh: () => queryClient.invalidateQueries({ queryKey: ['auth', 'me'] }),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
