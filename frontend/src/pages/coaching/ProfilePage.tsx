import { useProfile, useCoachingMutation } from '../../api/coaching';
import { useAuth } from '../../auth/useAuth';
import { MyCoach } from '../../components/coaching/Planning';
import { Card, ErrorState, Skeleton } from '../../components/ui/Primitives';

export function ProfilePage() {
  const query = useProfile();
  const mutation = useCoachingMutation();
  const { logout } = useAuth();
  if (query.isLoading) return <Skeleton />;
  if (query.isError) return <ErrorState retry={() => void query.refetch()} />;
  if (!query.data) return null;
  const { name, email, role, profile } = query.data;
  return <section><h1>Mi perfil</h1><Card><span className="avatar">{(profile?.displayName || name).slice(0, 1)}</span><h2>{name}</h2><p>{email} · {role === 'COACH' ? 'Coach' : 'Alumno'}</p>
    <form className="coaching-form" onSubmit={(e) => {
      e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget));
      const data = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === '' ? null : value]));
      mutation.mutate({ path: '/profile/me', data });
    }}>
      {([['displayName', 'Nombre visible', 'text', 100], ['phone', 'Teléfono', 'tel', 30], ['birthDate', 'Fecha de nacimiento', 'date', 10], ['city', 'Ciudad', 'text', 100], ['sport', 'Deporte', 'text', 100], ['avatarUrl', 'URL del avatar (HTTPS)', 'url', 1000]] as const).map(([key, label, type, maxLength]) => <label className="field" key={key}>{label}<input name={key} type={type} maxLength={maxLength} defaultValue={key === 'birthDate' ? profile?.[key]?.slice(0, 10) ?? '' : profile?.[key] ?? ''} /></label>)}
      <label className="field">Biografía<textarea name="bio" maxLength={1000} defaultValue={profile?.bio ?? ''} /></label>
      <button disabled={mutation.isPending}>Guardar perfil</button>{mutation.isError && <ErrorState message={mutation.error.message} />}{mutation.isSuccess && <p role="status">Perfil guardado.</p>}
    </form></Card>{role === 'STUDENT' && <MyCoach />}<button onClick={() => void logout()}>Cerrar sesión</button></section>;
}
