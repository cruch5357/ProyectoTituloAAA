import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Icon } from '../components/ui/Icon';
export type ThemePreference = 'light' | 'dark';
const ThemeContext = createContext<{
  preference: ThemePreference;
  resolvedTheme: 'light' | 'dark';
  setPreference: (value: ThemePreference) => void;
}>({ preference: 'light', resolvedTheme: 'light', setPreference: () => {} });
const systemQuery = '(prefers-color-scheme: dark)';
function readPreference(): ThemePreference {
  try {
    const saved = localStorage.getItem('ui-theme');
    return saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia(systemQuery).matches
        ? 'dark'
        : 'light';
  } catch {
    return window.matchMedia(systemQuery).matches ? 'dark' : 'light';
  }
}
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const resolvedTheme = preference;
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    const color = getComputedStyle(document.documentElement)
      .getPropertyValue('--color-background')
      .trim();
    if (color)
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', color);
  }, [resolvedTheme]);
  function chooseTheme(value: ThemePreference) {
    setPreference(value);
    try {
      localStorage.setItem('ui-theme', value);
    } catch {
      /* Optional visual preference. */
    }
  }
  return (
    <ThemeContext.Provider
      value={{ preference, resolvedTheme, setPreference: chooseTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
export function ThemeToggle() {
  const { resolvedTheme, setPreference } = useContext(ThemeContext);
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
    </div>
  );
}
