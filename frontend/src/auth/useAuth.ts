import { useContext } from 'react';
import { AuthContext } from './authContextObject';
import type { AuthContextValue } from './authContextObject';

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  }
  return context;
}
