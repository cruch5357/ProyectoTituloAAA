// Player events only: no Data API, API key, account or credentials.
type Player = { destroy: () => void };
type PlayerApi = {
  Player: new (
    iframe: HTMLIFrameElement,
    options: {
      events: { onReady: () => void; onError: () => void };
    },
  ) => Player;
};
declare global {
  interface Window {
    YT?: PlayerApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}
let loading: Promise<PlayerApi> | undefined;
export function loadYoutubePlayer(): Promise<PlayerApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    const previous = window.onYouTubeIframeAPIReady;
    const timer = window.setTimeout(fail, 15000);
    function fail() {
      window.clearTimeout(timer);
      script.remove();
      loading = undefined;
      reject(new Error('No se pudo cargar el reproductor'));
    }
    window.onYouTubeIframeAPIReady = () => {
      window.clearTimeout(timer);
      previous?.();
      if (window.YT?.Player) resolve(window.YT);
      else fail();
    };
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}
