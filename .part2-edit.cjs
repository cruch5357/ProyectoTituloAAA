const fs = require('fs');
function edit(p, fn) {const s=fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n'); fs.writeFileSync(p,fn(s));}
edit('frontend/src/theme/ThemeProvider.tsx',s=>s.replace('  useSyncExternalStore,\n','').replace("export type ThemePreference = 'light' | 'dark' | 'system';","export type ThemePreference = 'light' | 'dark';").replace("preference: 'system'","preference: 'light'").replace(/function subscribeToSystemTheme[\s\S]*?function readPreference/, 'function readPreference').replace("? saved : 'system'","? saved : window.matchMedia(systemQuery).matches ? 'dark' : 'light'").replace("return 'system';","return window.matchMedia(systemQuery).matches ? 'dark' : 'light';").replace(/  const systemDark =[\s\S]*?  useEffect\(\(\) => \{/, '  const resolvedTheme = preference;\n  useEffect(() => {').replace('    document.documentElement.dataset.theme = resolvedTheme;',`    document.documentElement.dataset.theme = resolvedTheme;
    const color = getComputedStyle(document.documentElement).getPropertyValue('--color-background').trim();
    if (color) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);`).replace(/  useEffect\(\(\) => \{\n    try[\s\S]*?  }, \[preference\]\);/,`  function chooseTheme(value: ThemePreference) {
    setPreference(value);
    try { localStorage.setItem('ui-theme', value); } catch { /* Optional visual preference. */ }
  }`).replace('resolvedTheme, setPreference }}>','resolvedTheme, setPreference: chooseTheme }}>').replace('const { preference, resolvedTheme, setPreference }','const { resolvedTheme, setPreference }').replace(/      <button\n        type="button"\n        className="theme-system"[\s\S]*?<\/button>\n/,'').replace(/export function ThemeSelect[\s\S]*/,''));
edit('frontend/src/styles/components.css',s=>s.replace(/button.theme-system[\s\S]*$/,''));
edit('frontend/src/index.css',s=>s+`
/* Semantic action hierarchy, shared by native buttons and links. */
button.button--secondary, .button.button--secondary,
button.button--neutral, .button.button--neutral {
  background: var(--color-surface); color: var(--color-text);
  border-color: var(--color-border); font-weight: 500;
}
button.button--ghost, .button.button--ghost {
  background: transparent; color: var(--color-text-secondary); border-color: transparent;
}
button.button--secondary:hover:not(:disabled), button.button--neutral:hover:not(:disabled),
button.button--ghost:hover:not(:disabled) { background: var(--color-primary-soft); }
button.button--secondary .icon { color: var(--color-primary); }
button.button--danger, .button.button--danger {
  color: var(--color-danger); border-color: var(--color-danger);
  background: var(--color-surface);
}
button.button--danger:hover:not(:disabled), .button.button--danger:hover {
  color: var(--color-danger); border-color: var(--color-danger);
  background: color-mix(in srgb, var(--color-danger) 18%, var(--color-surface));
}
.exercise-video { width: 100%; min-width: 0; grid-column: 1 / -1; }
.exercise-video iframe { width: 100%; aspect-ratio: 16 / 9; border: 0; border-radius: var(--radius-md); display: block; }
.exercise-video__player { margin-top: var(--space-3); }
`);
edit('frontend/src/layouts/MainLayout.tsx',s=>s.replace('<button type="submit">Buscar','<button type="submit" className="button--secondary">Buscar'));
for(const p of ['frontend/src/pages/exercises/ExerciseFormDialog.tsx','frontend/src/pages/programs/ProgramFormDialog.tsx','frontend/src/pages/students/InviteStudentDialog.tsx']) edit(p,s=>s.replace('<button type="button" onClick={closeDialog}>','<button type="button" className="button--neutral" onClick={closeDialog}>'));
for(const p of ['backend/src/session-exercises/session-exercise.mapper.ts','backend/src/workout-logs/workout-log.mapper.ts']) edit(p,s=>s.replace('  muscleGroup: string | null;','  muscleGroup: string | null;\n  videoUrl: string | null;').replace(/(\s+)isActive: (sessionExercise|setLog.sessionExercise).exercise.isActive,/g,'$1videoUrl: $2.exercise.videoUrl,$1isActive: $2.exercise.isActive,'));
edit('frontend/src/types/sessionExercise.ts',s=>s.replace('  muscleGroup: string | null;','  muscleGroup: string | null;\n  videoUrl?: string | null;'));
edit('frontend/src/types/workoutLog.ts',s=>s.replace('    muscleGroup: string | null;','    muscleGroup: string | null;\n    videoUrl?: string | null;'));
// Keep legacy HTTPS links valid in storage; only explicitly supported providers may embed.
for(const p of ['backend/src/exercises/dto/create-exercise.dto.ts','backend/src/exercises/dto/update-exercise.dto.ts']) edit(p,s=>s.replace('@IsUrl()',"@IsUrl({ protocols: ['https'], require_protocol: true })").replace('videoUrl?: string;', 'videoUrl?: string | null;'));
edit('frontend/src/api/exercises.ts',s=>s.replace('videoUrl?: string;', 'videoUrl?: string | null;'));
