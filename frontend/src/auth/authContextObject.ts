import { createContext } from 'react';
import type { PublicUser } from '../types/user';
import type { LoginPayload } from '../api/auth';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: PublicUser | null;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
}

// Objeto de contexto separado del componente `AuthProvider` (ver
// AuthContext.tsx) para que React Fast Refresh funcione correctamente: un
// archivo que exporta tanto un componente como un valor no-componente
// dispara una advertencia de oxlint (react/only-export-components).
export const AuthContext = createContext<AuthContextValue | undefined>(
  undefined,
);
