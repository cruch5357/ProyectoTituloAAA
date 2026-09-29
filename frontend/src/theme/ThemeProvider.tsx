import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { Icon } from '../components/ui/Icon';
export type ThemePreference = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{
  preference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setPreference: (value: ThemePreference) => void;
}>({ preference: 'system', resolvedTheme: 'light', setPreference: () => {} });
const systemQuery = '(prefers-color-scheme: dark)';
function subscribeToSystemTheme(listener: () => void) {
  const media = window.matchMedia(systemQuery);
  media.addEventListener('change', listener);
  return () => media.removeEventListener('change', listener);
}
function getSystemDark() {
  return window.matchMedia(systemQuery).matches;
}
function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem('ui-theme');
    return saved === 'light' || saved === 'dark' ? saved : 'system';
  } catch {
    return 'system';
  }
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const systemDark = useSyncExternalStore(
    subscribeToSystemTheme,
    getSystemDark,
    () => false,
  );
  const resolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);
  useEffect(() => {
    try {
      if (preference === 'system') localStorage.removeItem('ui-theme');
      else localStorage.setItem('ui-theme', preference);
    } catch {
      /* Optional visual preference. */
    }
  }, [preference]);
  return (
    <ThemeContext.Provider value={{ preference, resolvedTheme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeToggle() {
  const { preference, resolvedTheme, setPreference } = useContext(ThemeContext);
  const isDark = resolvedTheme === 'dark';
  return (
    <div className="theme-controls" role="group" aria-label="Apariencia">
      <button
        type="button"
        className="theme-toggle"
        role="switch"
        aria-checked={isDark}
        aria-label="Modo oscuro"
        title={isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        onClick={() => setPreference(isDark ? 'light' : 'dark')}
      >
        <span className="theme-toggle__thumb" aria-hidden="true" />
        <Icon name="sun" />
        <Icon name="moon" />
      </button>
      <button
        type="button"
        className="theme-system"
        aria-pressed={preference === 'system'}
        title="Seguir la preferencia de tu dispositivo"
        onClick={() => setPreference('system')}
      >
        Sistema
      </button>
    </div>
  );
}
export function ThemeSelect() {
  const { preference, setPreference } = useContext(ThemeContext);
  return (
    <label className="theme-select">
      <span>Tema</span>
      <select
        aria-label="Tema visual"
        value={preference}
        onChange={(e) => setPreference(e.target.value as ThemePreference)}
      >
        <option value="system">Sistema</option>
        <option value="light">Claro</option>
        <option value="dark">Oscuro</option>
      </select>
    </label>
  );
}
