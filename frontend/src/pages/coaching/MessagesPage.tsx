import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useStudents } from '../../api/students';
import { useCoachingQuery, useProfile } from '../../api/coaching';
import { apiClient } from '../../lib/apiClient';
import { Card, ErrorState, Skeleton } from '../../components/ui/Primitives';

interface Attachment { id: string; type: 'IMAGE' | 'VIDEO'; originalFilename: string; }
interface Message { id: string; senderId: string; body: string; createdAt: string; readAt: string | null; attachments: Attachment[]; }
export function MediaPreview({ url, video, name }: { url: string; video: boolean; name: string }) {
  return video ? <video className="chat-media" src={url} controls preload="metadata" aria-label={name} /> : <img className="chat-media" src={url} alt={name} />;
}
function PrivateAttachment({ attachment }: { attachment: Attachment }) {
  const [url, setUrl] = useState(''); const [error, setError] = useState(false);
  useEffect(() => {
    let disposed = false; let objectUrl = '';
    void apiClient.blob(`/messages/attachments/${attachment.id}`).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch(() => { if (!disposed) setError(true); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [attachment.id]);
  return error ? <p role="alert">No se pudo cargar el archivo.</p> : url ? <><MediaPreview url={url} video={attachment.type === 'VIDEO'} name={attachment.originalFilename} /><a href={url} download={attachment.originalFilename}>Descargar {attachment.originalFilename}</a></> : <p>Cargando archivo…</p>;
}
function CoachContacts() {
  const [page, setPage] = useState(1); const [search, setSearch] = useState('');
  const query = useStudents({ page, limit: 20, search });
  return <Card><h2>Conversaciones</h2><label className="field">Buscar alumno<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} /></label>
    {query.isLoading && <Skeleton />}{query.isError && <ErrorState retry={() => void query.refetch()} />}
    <ul className="nested-list">{query.data?.items.map((s) => <li key={s.id}><Link to={`/messages?peer=${s.id}`}>{s.name}</Link></li>)}</ul>
    {query.data?.items.length === 0 && <p>Sin alumnos disponibles.</p>}
    <div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Anterior</button><button disabled={page >= (query.data?.meta.totalPages ?? 1)} onClick={() => setPage(page + 1)}>Siguiente</button></div>
  </Card>;
}
export function MessagesPage() {
  const { user } = useAuth(); const [params] = useSearchParams(); const profile = useProfile();
  const peer = params.get('peer') ?? profile.data?.coach?.id;
  return <section><h1>Mensajes</h1><div className={user?.role === 'COACH' ? 'chat-layout' : ''}>{user?.role === 'COACH' && <CoachContacts />}
    {peer ? <Conversation key={peer} peer={peer} /> : <p>Selecciona una conversación con tu {user?.role === 'COACH' ? 'alumno' : 'coach'}.</p>}</div></section>;
}
function Conversation({ peer }: { peer: string }) {
  const { user } = useAuth(); const client = useQueryClient();
  const [page, setPage] = useState(1); const [body, setBody] = useState(''); const [file, setFile] = useState<File>(); const [preview, setPreview] = useState('');
  const query = useCoachingQuery<Message[]>(`/messages/${peer}?page=${page}`, true, 20000);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const [fileError, setFileError] = useState('');
  function chooseFile(next?: File) {
    setFileError('');
    if (next && !['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'].includes(next.type)) { setFileError('Selecciona una imagen JPG, PNG o WebP, o un video MP4 o WebM.'); return; }
    if (next && next.size > (next.type.startsWith('video/') ? 50 : 8) * 1024 * 1024) { setFileError('El archivo supera el tamaño permitido.'); return; }
    setFile(next); setPreview(next ? URL.createObjectURL(next) : '');
  }
  useEffect(() => { if (query.isSuccess) void apiClient.patch(`/messages/${peer}/read`).catch(() => {}); }, [peer, query.dataUpdatedAt, query.isSuccess]);
  const send = useMutation({ mutationFn: async () => {
    const data = new FormData(); data.append('body', body); if (file) data.append('file', file);
    return apiClient.postFile(`/messages/${peer}`, data);
  }, onSuccess: () => { setBody(''); chooseFile(undefined); setPage(1); void client.invalidateQueries({ queryKey: ['coaching'] }); } });
  return <Card><h2>Chat Coach ↔ Alumno</h2>{query.isLoading && <Skeleton />}{query.isError && <ErrorState retry={() => void query.refetch()} />}
    <div className="chat-thread" aria-label="Mensajes de la conversación">{[...(query.data ?? [])].reverse().map((m) => <article className={`chat-message ${m.senderId === user?.id ? 'chat-message--own' : ''}`} key={m.id}>
      <small>{m.senderId === user?.id ? 'Tú' : 'Contacto'} · {new Date(m.createdAt).toLocaleString('es-CL')}</small><p>{m.body}</p>
      {m.attachments.map((a) => <PrivateAttachment key={a.id} attachment={a} />)}<small>{m.senderId === user?.id ? m.readAt ? 'Leído' : 'Enviado' : ''}</small>
    </article>)}</div>
    {query.isSuccess && query.data.length === 0 && <p>Comienza la conversación.</p>}
    <div className="pagination"><button disabled={page === 1} onClick={() => setPage(page - 1)}>Más recientes</button><button disabled={(query.data?.length ?? 0) < 30} onClick={() => setPage(page + 1)}>Más antiguos</button></div>
    <form onSubmit={(e) => { e.preventDefault(); send.mutate(); }}><label className="field">Mensaje<textarea maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} /></label>
      <label className="field">Adjuntar imagen/video (8 MB / 50 MB)<input key={file ? 'selected' : 'empty'} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={(e) => chooseFile(e.target.files?.[0])} /></label>
      {preview && file && <><MediaPreview url={preview} video={file.type.startsWith('video/')} name={file.name} /><button type="button" onClick={() => chooseFile(undefined)}>Quitar archivo</button></>}
      {fileError && <p role="alert">{fileError}</p>}
      <button disabled={send.isPending || !query.isSuccess || (!body.trim() && !file)}>{send.isPending ? 'Enviando…' : 'Enviar mensaje'}</button>{send.isError && <ErrorState message={send.error.message} />}
    </form></Card>;
}
