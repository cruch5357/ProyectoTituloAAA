/** Only these HTTPS YouTube URLs can become an iframe source. */
export function parseExerciseVideo(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port)
      return null;
    const host = url.hostname;
    let id: string | null = null;
    if (host === 'youtu.be')
      id = /^\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ?? null;
    else if (
      [
        'youtube.com',
        'www.youtube.com',
        'youtube-nocookie.com',
        'www.youtube-nocookie.com',
      ].includes(host)
    ) {
      if (url.pathname === '/watch' && !host.includes('nocookie'))
        id = url.searchParams.get('v');
      else
        id =
          /^\/(?:embed|shorts)\/([\w-]{11})\/?$/.exec(url.pathname)?.[1] ??
          null;
    }
    if (!id || !/^[\w-]{11}$/.test(id)) return null;
    return { id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` };
  } catch {
    return null;
  }
}
