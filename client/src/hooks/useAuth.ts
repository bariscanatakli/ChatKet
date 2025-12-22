import { useState, useEffect, useCallback } from 'react';
import type { User } from '../types';

const TOKEN_KEY = 'chatket_token';
const USER_KEY = 'chatket_user';

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem(TOKEN_KEY);
  });

  const [user, setUser] = useState<User | null>(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem(TOKEN_KEY);
  });

  useEffect(() => {
    if (token && user) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      setIsAuthenticated(true);
    } else {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setIsAuthenticated(false);
    }
  }, [token, user]);

  const login = useCallback((accessToken: string, userData: User) => {
    setToken(accessToken);
    setUser(userData);
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
  }, []);

  return {
    token,
    user,
    isAuthenticated,
    login,
    logout,
  };
}
