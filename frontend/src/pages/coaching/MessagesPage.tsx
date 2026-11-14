import { readableDate } from '../../lib/readableDate';
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../auth/useAuth';
import { useStudents } from '../../api/students';
import { useCoachingQuery, useProfile } from '../../api/coaching';
import { apiClient } from '../../lib/apiClient';
import { useBackdropClose } from '../../lib/useBackdropClose';
import { Card, ErrorState, Skeleton } from '../../components/ui/Primitives';
import { CoachWeekPlanPreview } from '../students/CoachWeekPlanPreview';

interface Attachment { id: string; type: 'IMAGE' | 'VIDEO'; originalFilename: string; }
interface CorrectionRequest {
  id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; sessionName: string;
  exerciseName: string; scheduledDate: string; setNumber: number; originalStatus: string;
  originalLoad: number | string | null; originalReps: number | null; originalRpe: number | string | null;
  proposedLoad: number | string | null; proposedReps: number | null; proposedRpe: number | string | null;
  proposedFields: string[]; reason: string | null; reviewedAt: string | null;
}
interface Message { id: string; senderId: string; body: string; createdAt: string; readAt: string | null; attachments: Attachment[]; correctionRequest: CorrectionRequest | null; }

function CorrectionMessage({ correction }: { correction: CorrectionRequest }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const decision = useMutation({
    mutationFn: async (value: 'APPROVE' | 'REJECT') =>
      apiClient.patch(`/training/corrections/${correction.id}/decision`, { decision: value }),
    onSuccess: () => {
      for (const key of ['coaching', 'training', 'workoutLogs', 'dashboard'])
        void client.invalidateQueries({ queryKey: [key] });
    },
  });
  const original = correction.originalStatus === 'NO_DATA'
    ? 'Sin datos'
    : `${correction.originalLoad ?? '—'} kg · ${correction.originalReps ?? '—'} repeticiones · RPE ${correction.originalRpe ?? '—'}`;
  const proposed = [
    correction.proposedFields.includes('weight') ? `${correction.proposedLoad ?? '—'} kg` : null,
    correction.proposedFields.includes('reps') ? `${correction.proposedReps ?? '—'} repeticiones` : null,
    correction.proposedFields.includes('rpe') ? `RPE ${correction.proposedRpe ?? '—'}` : null,
  ].filter(Boolean).join(' · ');
  const status = correction.status === 'PENDING' ? 'Pendiente de aprobación' : correction.status === 'APPROVED' ? 'Aprobada' : 'Rechazada';
  return <section className="chat-correction" aria-label="Solicitud de corrección de entrenamiento">
    <h3>Solicitud de corrección de entrenamiento</h3>
    <p><strong>{correction.sessionName}</strong> · {readableDate(correction.scheduledDate, false)}</p>
    <dl>
      <dt>Ejercicio</dt><dd>{correction.exerciseName}</dd>
      <dt>Serie</dt><dd>{correction.setNumber}</dd>
      <dt>Registro original</dt><dd>{original}</dd>
      <dt>Corrección solicitada</dt><dd>{proposed}</dd>
      {correction.reason && <><dt>Motivo</dt><dd>{correction.reason}</dd></>}
      <dt>Estado</dt><dd><strong>{status}</strong></dd>
    </dl>
    {user?.role === 'COACH' && correction.status === 'PENDING' && <div className="dialog-actions">
      <button type="button" disabled={decision.isPending} onClick={() => decision.mutate('APPROVE')}>Aprobar</button>
      <button type="button" className="button--danger" disabled={decision.isPending} onClick={() => decision.mutate('REJECT')}>Rechazar</button>
    </div>}
    {decision.isError && <ErrorState message={decision.error.message} />}
  </section>;
}
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
  return error ? <p role="alert">No se pudo cargar el archivo.</p> : url ? <><ZoomableMedia url={url} video={attachment.type === 'VIDEO'} name={attachment.originalFilename} /><a href={url} download={attachment.originalFilename}>Descargar {attachment.originalFilename}</a></> : <p>Cargando archivo…</p>;
}
// Adjunto del chat que se amplía al tocarlo. El video se muestra como
// miniatura (sin controles, para que tocarlo abra el visor en vez de
// reproducirse en el hilo) y solo se monta con controles dentro del visor,
// así se detiene al cerrarlo.
function ZoomableMedia({ url, video, name }: { url: string; video: boolean; name: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const backdropClose = useBackdropClose(dialogRef);
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="chat-media-button" aria-label={`Ampliar ${name}`} onClick={() => { setOpen(true); dialogRef.current?.showModal(); }}>
      {video ? <><video className="chat-media" src={url} preload="metadata" muted playsInline aria-hidden="true" /><span className="chat-media-play" aria-hidden="true">▶</span></> : <img className="chat-media" src={url} alt={name} />}
    </button>
    <dialog ref={dialogRef} {...backdropClose} className="media-dialog" aria-label={name} onClose={() => setOpen(false)}>
      <button type="button" className="media-dialog__close button--neutral" aria-label="Cerrar" onClick={() => dialogRef.current?.close()}>×</button>
      {open && (video ? <video className="media-dialog__media" src={url} controls autoPlay playsInline aria-label={name} /> : <img className="media-dialog__media" src={url} alt={name} />)}
    </dialog>
  </>;
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
  // Un alumno solo conversa con su coach: se ignora `?peer=`, que puede venir
  // de una URL de otra sesión (ej. la del coach, con el id del propio alumno).
  const peer = user?.role === 'STUDENT'
    ? profile.data?.coach?.id
    : params.get('peer') ?? undefined;
  return <section><h1>Mensajes</h1>{!peer && <p className="muted">Selecciona una conversación con tu {user?.role === 'COACH' ? 'alumno' : 'coach'}.</p>}<div className={user?.role === 'COACH' ? 'chat-layout' : ''}>{user?.role === 'COACH' && <CoachContacts />}
    {peer && <Conversation key={peer} peer={peer} />}</div></section>;
}
function Conversation({ peer }: { peer: string }) {
  const { user } = useAuth(); const client = useQueryClient();
  const [page, setPage] = useState(1); const [body, setBody] = useState(''); const [file, setFile] = useState<File>(); const [preview, setPreview] = useState('');
  const query = useCoachingQuery<Message[]>(`/messages/${peer}?page=${page}`, true, 20000);
  // Desplazamiento al último mensaje: siempre al abrir y al enviar; con
  // mensajes nuevos solo si el usuario ya estaba abajo (no interrumpe a quien
  // está leyendo mensajes antiguos). Los datos vienen del más nuevo al más
  // antiguo, así que `query.data[0]` es el último mensaje.
  const threadRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const lastMessageId = query.data?.[0]?.id;
  function scrollToBottom() {
    const thread = threadRef.current;
    if (thread && stickToBottom.current && page === 1) thread.scrollTop = thread.scrollHeight;
  }
  function trackScroll() {
    const thread = threadRef.current;
    if (thread) stickToBottom.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight < 80;
  }
  useEffect(scrollToBottom, [lastMessageId, page]);
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
  }, onSuccess: () => { stickToBottom.current = true; setBody(''); chooseFile(undefined); setPage(1); void client.invalidateQueries({ queryKey: ['coaching'] }); } });
  return <Card><h2>Chat Coach ↔ Alumno</h2>{user?.role === 'COACH' && <CoachWeekPlanPreview studentId={peer} mode="chat-alert" />}{query.isLoading && <Skeleton />}{query.isError && <ErrorState retry={() => void query.refetch()} />}
    <div ref={threadRef} onScroll={trackScroll} onLoadCapture={scrollToBottom} onLoadedMetadataCapture={scrollToBottom} className="chat-thread" aria-label="Mensajes de la conversación">{[...(query.data ?? [])].reverse().map((m) => <article className={`chat-message ${m.senderId === user?.id ? 'chat-message--own' : ''}`} key={m.id}>
      <small>{m.senderId === user?.id ? 'Tú' : 'Contacto'} · {readableDate(m.createdAt)}</small><p>{m.body}</p>
      {m.correctionRequest && <CorrectionMessage correction={m.correctionRequest} />}
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
