import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useWorkoutLog, useAddSetLogs, useFinishWorkoutLog } from '../../api/workoutLogs';
import { useUpdateSetLog } from '../../api/setLogs';
import { useStudentSessionDetail } from '../../api/studentTraining';
import { ApiError } from '../../lib/apiClient';
import type { SetLog, WorkoutCompletionStatus } from '../../types/workoutLog';
import { WorkoutCompletionStatusBadge } from './WorkoutCompletionStatusBadge';

// Pantalla de ejecución de un entrenamiento (PROMPT 10, RF-22/RF-23):
// registrar series reales por ejercicio (con su prescripción embebida para
// comparar "prescrito vs. realizado") y finalizar la sesión con su resumen.
// NUNCA modifica SessionExercise/la prescripción: solo crea/edita filas de
// SetLog/WorkoutLog (la rama de EJECUCIÓN, completamente separada).
export function WorkoutLogPage() {
  const { id } = useParams<{ id: string }>();
  const workoutLogQuery = useWorkoutLog(id);

  if (workoutLogQuery.isLoading) {
    return <p>Cargando entrenamiento…</p>;
  }

  if (workoutLogQuery.isError) {
    const message =
      workoutLogQuery.error instanceof ApiError
        ? workoutLogQuery.error.message
        : 'No se pudo cargar el entrenamiento.';
    return (
      <section>
        <p role="alert" className="field-error">
          {message}
        </p>
      </section>
    );
  }

  if (!workoutLogQuery.data) {
    return null;
  }

  const workoutLog = workoutLogQuery.data;
  const isFinished = workoutLog.durationMinutes !== null;

  return (
    <section>
      <p>
        <Link to={`/student/sessions/${workoutLog.sessionId}`}>
          ← Volver a la sesión
        </Link>
      </p>

      <h1>Entrenamiento del {new Date(workoutLog.performedAt).toLocaleString()}</h1>
      {workoutLog.session && (
        <p>
          {workoutLog.session.name} — {workoutLog.session.week.block.program.name}{' '}
          (Bloque {workoutLog.session.week.block.name}, semana{' '}
          {workoutLog.session.week.number})
        </p>
      )}
      <p>
        <WorkoutCompletionStatusBadge status={workoutLog.completionStatus} />{' '}
        {isFinished ? '(finalizado)' : '(en curso)'}
      </p>
      <p>
        <Link to="/history">Ver mi historial completo →</Link>
      </p>

      <h2>Series registradas</h2>

      {(!workoutLog.setLogs || workoutLog.setLogs.length === 0) && (
        <p>Todavía no registraste ninguna serie.</p>
      )}

      {workoutLog.setLogs && workoutLog.setLogs.length > 0 && (
        <table className="students-table">
          <thead>
            <tr>
              <th>Ejercicio</th>
              <th>Serie</th>
              <th>Prescrito (reps / RPE / RIR)</th>
              <th>Reps</th>
              <th>Carga</th>
              <th>RPE</th>
              <th>RIR</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {workoutLog.setLogs.map((setLog) => (
              <SetLogRow key={setLog.id} setLog={setLog} workoutLogId={workoutLog.id} />
            ))}
          </tbody>
        </table>
      )}

      {workoutLog.setLogs && workoutLog.setLogs.length > 0 && (
        <ExerciseEvolutionLinks setLogs={workoutLog.setLogs} />
      )}

      {!isFinished && (
        <AddSetLogForm workoutLogId={workoutLog.id} sessionId={workoutLog.sessionId} />
      )}

      <FinishWorkoutLogForm
        workoutLogId={workoutLog.id}
        completionStatus={workoutLog.completionStatus}
        overallRpe={workoutLog.overallRpe}
        fatigue={workoutLog.fatigue}
        comments={workoutLog.comments}
        durationMinutes={workoutLog.durationMinutes}
        isFinished={isFinished}
      />
    </section>
  );
}

function formatPrescribed(setLog: SetLog): string {
  const se = setLog.sessionExercise;
  if (!se) return '—';
  const reps =
    se.targetRepsMin !== null && se.targetRepsMax !== null
      ? se.targetRepsMin === se.targetRepsMax
        ? String(se.targetRepsMin)
        : `${se.targetRepsMin}-${se.targetRepsMax}`
      : '—';
  return `${reps} reps / RPE ${se.targetRpe ?? '—'} / RIR ${se.targetRir ?? '—'}`;
}

function SetLogRow({
  setLog,
  workoutLogId,
}: {
  setLog: SetLog;
  workoutLogId: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <>
      <tr>
        <td>{setLog.sessionExercise?.exercise.name ?? '—'}</td>
        <td>{setLog.setNumber}</td>
        <td>{formatPrescribed(setLog)}</td>
        <td>{setLog.actualReps ?? '—'}</td>
        <td>{setLog.actualLoad ?? '—'}</td>
        <td>{setLog.actualRpe ?? '—'}</td>
        <td>{setLog.actualRir ?? '—'}</td>
        <td>
          <button type="button" onClick={() => setEditing((current) => !current)}>
            {editing ? 'Cerrar' : 'Editar'}
          </button>
        </td>
      </tr>
      {editing && (
        <tr>
          <td colSpan={8}>
            <EditSetLogForm
              setLog={setLog}
              workoutLogId={workoutLogId}
              onDone={() => setEditing(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function EditSetLogForm({
  setLog,
  workoutLogId,
  onDone,
}: {
  setLog: SetLog;
  workoutLogId: string;
  onDone: () => void;
}) {
  const updateMutation = useUpdateSetLog(workoutLogId);
  const [actualReps, setActualReps] = useState(
    setLog.actualReps !== null ? String(setLog.actualReps) : '',
  );
  const [actualLoad, setActualLoad] = useState(
    setLog.actualLoad !== null ? String(setLog.actualLoad) : '',
  );
  const [actualRpe, setActualRpe] = useState(
    setLog.actualRpe !== null ? String(setLog.actualRpe) : '',
  );
  const [actualRir, setActualRir] = useState(
    setLog.actualRir !== null ? String(setLog.actualRir) : '',
  );
  const [comments, setComments] = useState(setLog.comments ?? '');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await updateMutation.mutateAsync({
        id: setLog.id,
        payload: {
          actualReps: actualReps ? Number(actualReps) : undefined,
          actualLoad: actualLoad ? Number(actualLoad) : undefined,
          actualRpe: actualRpe ? Number(actualRpe) : undefined,
          actualRir: actualRir ? Number(actualRir) : undefined,
          comments: comments.trim() || undefined,
        },
      });
      onDone();
    } catch {
      // El error queda disponible en updateMutation.error; la ventana de 24h
      // (RF-24) puede rechazar la edición con un mensaje del backend.
    }
  }

  return (
    <form onSubmit={handleSubmit} className="prescription-form">
      <label className="field">
        <span>Reps</span>
        <input
          type="number"
          min={0}
          value={actualReps}
          onChange={(event) => setActualReps(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Carga</span>
        <input
          type="number"
          min={0}
          step="0.01"
          value={actualLoad}
          onChange={(event) => setActualLoad(event.target.value)}
        />
      </label>
      <label className="field">
        <span>RPE (0-10)</span>
        <input
          type="number"
          min={0}
          max={10}
          step={0.5}
          value={actualRpe}
          onChange={(event) => setActualRpe(event.target.value)}
        />
      </label>
      <label className="field">
        <span>RIR</span>
        <input
          type="number"
          min={0}
          value={actualRir}
          onChange={(event) => setActualRir(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Notas</span>
        <input
          type="text"
          maxLength={500}
          value={comments}
          onChange={(event) => setComments(event.target.value)}
        />
      </label>

      {updateMutation.isError && (
        <p role="alert" className="field-error">
          {updateMutation.error instanceof ApiError
            ? updateMutation.error.message
            : 'No se pudo guardar la serie.'}
        </p>
      )}

      <button type="submit" disabled={updateMutation.isPending}>
        {updateMutation.isPending ? 'Guardando…' : 'Guardar serie'}
      </button>
    </form>
  );
}

function AddSetLogForm({
  workoutLogId,
  sessionId,
}: {
  workoutLogId: string;
  sessionId: string;
}) {
  const sessionQuery = useStudentSessionDetail(sessionId);
  const workoutLogQuery = useWorkoutLog(workoutLogId);
  const addMutation = useAddSetLogs(workoutLogId);

  const [sessionExerciseId, setSessionExerciseId] = useState('');
  const [setNumber, setSetNumber] = useState('1');
  const [actualReps, setActualReps] = useState('');
  const [actualLoad, setActualLoad] = useState('');
  const [actualRpe, setActualRpe] = useState('');
  const [actualRir, setActualRir] = useState('');
  const [comments, setComments] = useState('');

  const nextSetNumberByExercise = useMemo(() => {
    const counts = new Map<string, number>();
    for (const setLog of workoutLogQuery.data?.setLogs ?? []) {
      counts.set(
        setLog.sessionExerciseId,
        (counts.get(setLog.sessionExerciseId) ?? 0) + 1,
      );
    }
    return counts;
  }, [workoutLogQuery.data?.setLogs]);

  function handleSelectExercise(id: string) {
    setSessionExerciseId(id);
    const alreadyLogged = nextSetNumberByExercise.get(id) ?? 0;
    setSetNumber(String(alreadyLogged + 1));
  }

  function resetForm() {
    setSessionExerciseId('');
    setSetNumber('1');
    setActualReps('');
    setActualLoad('');
    setActualRpe('');
    setActualRir('');
    setComments('');
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await addMutation.mutateAsync([
        {
          sessionExerciseId,
          setNumber: Number(setNumber),
          actualReps: actualReps ? Number(actualReps) : undefined,
          actualLoad: actualLoad ? Number(actualLoad) : undefined,
          actualRpe: actualRpe ? Number(actualRpe) : undefined,
          actualRir: actualRir ? Number(actualRir) : undefined,
          comments: comments.trim() || undefined,
        },
      ]);
      resetForm();
    } catch {
      // El error queda disponible en addMutation.error.
    }
  }

  return (
    <section>
      <h2>Registrar una serie</h2>
      <form onSubmit={handleSubmit} className="prescription-form">
        <label className="field">
          <span>Ejercicio</span>
          <select
            required
            value={sessionExerciseId}
            onChange={(event) => handleSelectExercise(event.target.value)}
            disabled={sessionQuery.isLoading || addMutation.isPending}
          >
            <option value="">Selecciona un ejercicio…</option>
            {sessionQuery.data?.exercises.map((exercise) => (
              <option key={exercise.id} value={exercise.id}>
                {exercise.order}. {exercise.exercise.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Número de serie</span>
          <input
            type="number"
            min={1}
            required
            value={setNumber}
            onChange={(event) => setSetNumber(event.target.value)}
            disabled={addMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Reps realizadas</span>
          <input
            type="number"
            min={0}
            value={actualReps}
            onChange={(event) => setActualReps(event.target.value)}
            disabled={addMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Carga</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={actualLoad}
            onChange={(event) => setActualLoad(event.target.value)}
            disabled={addMutation.isPending}
          />
        </label>

        <label className="field">
          <span>RPE (0-10)</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={actualRpe}
            onChange={(event) => setActualRpe(event.target.value)}
            disabled={addMutation.isPending}
          />
        </label>

        <label className="field">
          <span>RIR</span>
          <input
            type="number"
            min={0}
            value={actualRir}
            onChange={(event) => setActualRir(event.target.value)}
            disabled={addMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Notas</span>
          <input
            type="text"
            maxLength={500}
            value={comments}
            onChange={(event) => setComments(event.target.value)}
            disabled={addMutation.isPending}
          />
        </label>

        {addMutation.isError && (
          <p role="alert" className="field-error">
            {addMutation.error instanceof ApiError
              ? addMutation.error.message
              : 'No se pudo registrar la serie.'}
          </p>
        )}

        <button
          type="submit"
          disabled={addMutation.isPending || sessionExerciseId.length === 0}
        >
          {addMutation.isPending ? 'Registrando…' : 'Registrar serie'}
        </button>
      </form>
    </section>
  );
}

function FinishWorkoutLogForm({
  workoutLogId,
  completionStatus,
  overallRpe,
  fatigue,
  comments,
  durationMinutes,
  isFinished,
}: {
  workoutLogId: string;
  completionStatus: WorkoutCompletionStatus;
  overallRpe: number | null;
  fatigue: number | null;
  comments: string | null;
  durationMinutes: number | null;
  isFinished: boolean;
}) {
  const finishMutation = useFinishWorkoutLog(workoutLogId);
  const [status, setStatus] = useState<WorkoutCompletionStatus>(
    isFinished ? completionStatus : 'COMPLETED',
  );
  const [duration, setDuration] = useState(
    durationMinutes !== null ? String(durationMinutes) : '',
  );
  const [rpe, setRpe] = useState(overallRpe !== null ? String(overallRpe) : '');
  const [fatigueValue, setFatigueValue] = useState(
    fatigue !== null ? String(fatigue) : '',
  );
  const [commentsValue, setCommentsValue] = useState(comments ?? '');

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await finishMutation.mutateAsync({
        completionStatus: status,
        durationMinutes: Number(duration),
        overallRpe: rpe ? Number(rpe) : undefined,
        fatigue: fatigueValue ? Number(fatigueValue) : undefined,
        comments: commentsValue.trim() || undefined,
      });
    } catch {
      // El error queda disponible en finishMutation.error (por ejemplo, si
      // ya pasó la ventana de 24 horas de RF-24).
    }
  }

  return (
    <section>
      <h2>{isFinished ? 'Resumen de la sesión' : 'Finalizar entrenamiento'}</h2>
      <form onSubmit={handleSubmit} className="prescription-form">
        <label className="field">
          <span>Cumplimiento</span>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as WorkoutCompletionStatus)
            }
            disabled={finishMutation.isPending}
          >
            <option value="COMPLETED">Completado</option>
            <option value="PARTIAL">Parcial</option>
            <option value="SKIPPED">Omitido</option>
          </select>
        </label>

        <label className="field">
          <span>Duración (minutos)</span>
          <input
            type="number"
            min={0}
            required
            value={duration}
            onChange={(event) => setDuration(event.target.value)}
            disabled={finishMutation.isPending}
          />
        </label>

        <label className="field">
          <span>RPE general (0-10)</span>
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={rpe}
            onChange={(event) => setRpe(event.target.value)}
            disabled={finishMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Fatiga (0-10)</span>
          <input
            type="number"
            min={0}
            max={10}
            value={fatigueValue}
            onChange={(event) => setFatigueValue(event.target.value)}
            disabled={finishMutation.isPending}
          />
        </label>

        <label className="field">
          <span>Comentarios</span>
          <input
            type="text"
            maxLength={1000}
            value={commentsValue}
            onChange={(event) => setCommentsValue(event.target.value)}
            disabled={finishMutation.isPending}
          />
        </label>

        {finishMutation.isError && (
          <p role="alert" className="field-error">
            {finishMutation.error instanceof ApiError
              ? finishMutation.error.message
              : 'No se pudo finalizar el entrenamiento.'}
          </p>
        )}

        {finishMutation.isSuccess && (
          <p role="status">Resumen guardado.</p>
        )}

        <button type="submit" disabled={finishMutation.isPending}>
          {finishMutation.isPending
            ? 'Guardando…'
            : isFinished
              ? 'Actualizar resumen'
              : 'Finalizar entrenamiento'}
        </button>
      </form>
    </section>
  );
}

// "Ver evolución de este ejercicio" (RF-25, PROMPT 11): un link por cada
// ejercicio DISTINTO ya registrado en este entrenamiento, hacia "Mi
// historial" con ese ejercicio pre-seleccionado. Se arma a partir de los
// `setLogs` que YA están en pantalla -- no se inventa ningún selector de
// ejercicios nuevo ni se pide un endpoint adicional.
function ExerciseEvolutionLinks({ setLogs }: { setLogs: SetLog[] }) {
  const distinctExercises = new Map<string, string>();
  for (const setLog of setLogs) {
    const exercise = setLog.sessionExercise?.exercise;
    if (exercise) {
      distinctExercises.set(exercise.id, exercise.name);
    }
  }

  if (distinctExercises.size === 0) {
    return null;
  }

  return (
    <p>
      Ver evolución:{' '}
      {Array.from(distinctExercises.entries()).map(([id, name], index) => (
        <span key={id}>
          {index > 0 && ' · '}
          <Link
            to={`/history?exerciseId=${id}&exerciseName=${encodeURIComponent(name)}`}
          >
            {name}
          </Link>
        </span>
      ))}
    </p>
  );
}
