import { useEffect, useId, useRef, useState } from 'react';
import { parseExerciseVideo } from '../../lib/exerciseVideo';
import { loadYoutubePlayer } from '../../lib/youtubePlayer';

export function ExerciseVideo({
  videoUrl,
  name,
  label = 'Ver técnica',
}: {
  videoUrl?: string | null;
  name: string;
  label?: string;
}) {
  // Replacing a URL unmounts its player, stopping playback and clearing errors.
  return (
    <Video key={videoUrl ?? ''} videoUrl={videoUrl} name={name} label={label} />
  );
}
function Video({
  videoUrl,
  name,
  label,
}: {
  videoUrl?: string | null;
  name: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const video = parseExerciseVideo(videoUrl);
  if (!videoUrl)
    return <p className="muted">Este ejercicio no tiene video demostrativo.</p>;
  if (!video)
    return <p className="field-error">El video configurado no es válido.</p>;
  return (
    <div className="exercise-video">
      <button
        type="button"
        className="button--secondary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        {open ? 'Ocultar video' : label}
      </button>
      <div id={id}>
        {open && (
          <Player
            embedUrl={video.embedUrl}
            watchUrl={`https://www.youtube.com/watch?v=${video.id}`}
            name={name}
          />
        )}
      </div>
    </div>
  );
}
// Códigos de la API de YouTube: 101/150 = el dueño no permite reproducir el
// video incrustado en otras páginas (frecuente en Shorts y videos de marcas,
// sobre todo en celulares). La app no puede saltarse esa restricción.
const EMBED_NOT_ALLOWED = [101, 150];
function Player({
  embedUrl,
  watchUrl,
  name,
}: {
  embedUrl: string;
  watchUrl: string;
  name: string;
}) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorCode, setErrorCode] = useState<number | null>(null);
  useEffect(() => {
    let disposed = false;
    let player: { destroy: () => void } | undefined;
    const timeout = window.setTimeout(() => {
      if (!disposed) setState('error');
    }, 20000);
    void loadYoutubePlayer()
      .then((api) => {
        if (disposed || !iframe.current) return;
        player = new api.Player(iframe.current, {
          events: {
            onReady: () => {
              if (!disposed) {
                window.clearTimeout(timeout);
                setState('ready');
              }
            },
            onError: (event?: { data?: number }) => {
              if (!disposed) {
                window.clearTimeout(timeout);
                setErrorCode(event?.data ?? null);
                setState('error');
              }
            },
          },
        });
      })
      .catch(() => {
        if (!disposed) setState('error');
      });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      player?.destroy();
    };
  }, []);
  return (
    <div className="exercise-video__player">
      {state === 'loading' && <p role="status">Cargando video…</p>}
      {state === 'error' && (
        <div className="exercise-video__fallback">
          <p role="alert">
            {errorCode !== null && EMBED_NOT_ALLOWED.includes(errorCode)
              ? 'No se pudo reproducir este video dentro de la aplicación: su dueño no permite verlo en otras páginas (pasa con muchos Shorts y videos de marcas). Puedes verlo directamente en YouTube.'
              : 'No se pudo reproducir este video dentro de la aplicación. Comprueba tu conexión e inténtalo de nuevo, o míralo directamente en YouTube.'}
          </p>
          <a
            className="button"
            href={watchUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver en YouTube ↗
          </a>
        </div>
      )}
      <iframe
        ref={iframe}
        hidden={state === 'error'}
        title={`Video demostrativo: ${name}`}
        loading="lazy"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        allow="fullscreen; encrypted-media; picture-in-picture"
        onError={() => setState('error')}
        src={`${embedUrl}?autoplay=0&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(window.location.origin)}`}
      />
    </div>
  );
}
