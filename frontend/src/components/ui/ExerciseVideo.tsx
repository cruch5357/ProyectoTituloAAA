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
        {open && <Player embedUrl={video.embedUrl} name={name} />}
      </div>
    </div>
  );
}
function Player({ embedUrl, name }: { embedUrl: string; name: string }) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
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
            onError: () => {
              if (!disposed) {
                window.clearTimeout(timeout);
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
        <p role="alert">
          No se pudo reproducir este video dentro de la aplicación. Comprueba tu
          conexión; el propietario puede haber deshabilitado la reproducción
          embebida. Puedes cerrar el video y volver a intentarlo.
        </p>
      )}
      <iframe
        ref={iframe}
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
