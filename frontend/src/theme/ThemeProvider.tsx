import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
export type ThemePreference = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{
  preference: ThemePreference;
  setPreference: (value: ThemePreference) => void;
}>({ preference: 'system', setPreference: () => {} });
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
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      document.documentElement.dataset.theme =
        preference === 'system'
          ? media.matches
            ? 'dark'
            : 'light'
          : preference;
    };
    apply();
    try {
      localStorage.setItem('ui-theme', preference);
    } catch {
      /* Optional visual preference. */
    }
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preference]);
  return (
    <ThemeContext.Provider value={{ preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
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
