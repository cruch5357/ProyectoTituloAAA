import { Link, Navigate, useParams } from 'react-router-dom';
import { useWorkoutLog } from '../../api/workoutLogs';
import { ErrorState, Skeleton } from '../../components/ui/Primitives';
import { readableDate } from '../../lib/readableDate';
import { WorkoutCompletionStatusBadge } from './WorkoutCompletionStatusBadge';
import './training.css';

/** Historical records remain readable; new execution lives exclusively in TrainingSessionPage. */
export function WorkoutLogPage() {
 const { id }=useParams(); const query=useWorkoutLog(id);
 if(query.isLoading)return <Skeleton label="Cargando entrenamiento…" />;
 if(query.isError)return <ErrorState message={query.error.message} retry={()=>void query.refetch()} />;
 const log=query.data;if(!log)return null;
 if(log.structuredExecution)return <Navigate to={`/training/sessions/${log.sessionId}`} replace />;
 return <section className="training-recorder"><Link to="/history">← Historial</Link><h1>Registro histórico</h1><p>{readableDate(log.performedAt)} · {log.session?.name}</p><WorkoutCompletionStatusBadge status={log.completionStatus} /><p className="training-notice">Registro conservado del sistema anterior, de solo lectura. Los nuevos entrenamientos se registran desde tu ciclo activo.</p>{log.prescriptionSource==='legacy-current'&&<p>Este registro no conserva una copia de su prescripción original.</p>}
 {log.setLogs?.map(s=><article className="training-exercise" key={s.id}><h2>{s.sessionExercise?.exercise.name ?? 'Ejercicio'} · Serie {s.setNumber}</h2><p>Realizado: {s.actualLoad??'—'} kg · {s.actualReps??'—'} reps · RPE {s.actualRpe??'—'}</p>{s.comments&&<p>{s.comments}</p>}</article>)}
 {!log.setLogs?.length&&<p>Sin series registradas.</p>}{log.comments&&<p>{log.comments}</p>}<Link to="/training">Ir a mi entrenamiento →</Link></section>;
}
