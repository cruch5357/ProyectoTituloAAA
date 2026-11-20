import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StudentsService } from '../students/students.service';

// Cuántas series recientes se envían al modelo: de sobra para calcular la
// tendencia (usa las últimas sesiones) sin mandar todo el historial.
const MAX_SETS = 500;
const DEFAULT_TARGET_REPS = 8;
const REQUEST_TIMEOUT_MS = 3000;

export type SuggestedLoadUnavailableReason =
  'disabled' | 'service_unavailable' | 'insufficient_history';

export interface SuggestedLoadResult {
  available: boolean;
  reason?: SuggestedLoadUnavailableReason;
  minSessions?: number;
  basedOnSessions?: number;
  suggestedLoadKg?: number;
  targetReps?: number;
  lastE1rmKg?: number;
  predictedE1rmKg?: number;
  expectedChangePct?: number;
  lastSession?: { date: string; loadKg: number; reps: number };
  /** Rango de carga (cuantiles 20–80 % del modelo). */
  suggestedLoadRangeKg?: [number, number];
  /** Reglas de esfuerzo aplicadas: `reserve_progression`, `max_effort_hold`. */
  adjustments?: string[];
  modelVersion?: string;
}

interface ServiceResponse {
  available: boolean;
  reason?: SuggestedLoadUnavailableReason;
  min_sessions?: number;
  based_on_sessions?: number;
  suggested_load_kg?: number;
  target_reps?: number;
  last_e1rm_kg?: number;
  predicted_e1rm_kg?: number;
  expected_change_pct?: number;
  last_session?: { date: string; load_kg: number; reps: number };
  suggested_load_range_kg?: [number, number];
  adjustments?: string[];
  model_version?: string;
}

export interface SuggestedLoadHighlight {
  exerciseId: string;
  exerciseName: string;
  sessions: number;
  /** Mejor 1RM estimado de cada sesión, de la más antigua a la más reciente. */
  trend: { date: string; e1rmKg: number }[];
  suggestion: SuggestedLoadResult;
}

export interface SuggestedLoadHighlights {
  enabled: boolean;
  items: SuggestedLoadHighlight[];
}

export interface StudentProgressItem {
  exerciseId: string;
  exerciseName: string;
  sessions: number;
  /** Primera sesión considerada para el cambio de fuerza. */
  since: string;
  firstE1rmKg: number;
  lastE1rmKg: number;
  changePct: number;
  trend: { date: string; e1rmKg: number }[];
  forecast: { predictedE1rmKg: number; expectedChangePct: number } | null;
}

export interface StudentProgress {
  items: StudentProgressItem[];
}

const HIGHLIGHT_LIMIT = 3;
// Con una sola sesión no hay progreso que mostrar.
const MIN_PROGRESS_SESSIONS = 2;
// Series recientes suficientes para ordenar los ejercicios habituales.
const HIGHLIGHT_MAX_SETS = 3000;
const TREND_POINTS = 12;

type HistorySet = {
  date: string;
  load_kg: number;
  reps: number;
  rpe?: number;
};

function toHistorySet(set: {
  actualLoad: unknown;
  actualReps: number | null;
  actualRpe: unknown;
  workoutLog: { performedAt: Date };
}): HistorySet {
  return {
    date: set.workoutLog.performedAt.toISOString().slice(0, 10),
    load_kg: Number(set.actualLoad),
    reps: set.actualReps ?? 0,
    // El RPE activa la autorregulación del modelo; se omite si no se anotó.
    ...(set.actualRpe == null ? {} : { rpe: Number(set.actualRpe) }),
  };
}

const epley = (set: HistorySet) => set.load_kg * (1 + set.reps / 30);

// Mismo criterio de sesión que el modelo: un punto por día, su mejor serie.
function sessionTrend(history: HistorySet[]) {
  const best = new Map<string, number>();
  for (const set of history)
    best.set(set.date, Math.max(best.get(set.date) ?? 0, epley(set)));
  return [...best.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, e1rm]) => ({ date, e1rmKg: Math.round(e1rm * 10) / 10 }));
}

// Repeticiones de la mejor serie (mayor 1RM estimado, Epley) de la sesión
// más reciente: es la referencia por defecto si el coach no indica otras.
function lastTopSetReps(history: HistorySet[]): number | undefined {
  const lastDate = history[0]?.date;
  let best: { e1rm: number; reps: number } | undefined;
  for (const set of history) {
    if (set.date !== lastDate) continue;
    const e1rm = set.load_kg * (1 + set.reps / 30);
    if (!best || e1rm > best.e1rm) best = { e1rm, reps: set.reps };
  }
  return best?.reps;
}

// Carga sugerida para la próxima sesión de un ejercicio (modelo de
// data-science/, opcional). El backend sigue siendo la fuente de verdad de
// la autorización: verifica que alumno y ejercicio sean del coach y envía al
// servicio solo fechas, cargas, repeticiones y RPE (ningún dato personal). Si el
// servicio no está configurado o no responde, devuelve `available: false`
// en vez de fallar: la sugerencia es un apoyo, nunca un requisito.
@Injectable()
export class SuggestedLoadService {
  private readonly logger = new Logger(SuggestedLoadService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly studentsService: StudentsService,
    private readonly config: ConfigService,
  ) {}

  async getSuggestedLoad(
    coachId: string,
    studentId: string,
    exerciseId: string,
    targetReps?: number,
  ): Promise<SuggestedLoadResult> {
    await this.studentsService.getOwnedByCoach(coachId, studentId);
    const exercise = await this.prisma.exercise.findUnique({
      where: { id: exerciseId },
      select: { coachId: true },
    });
    if (!exercise || exercise.coachId !== coachId) {
      throw new NotFoundException('Ejercicio no encontrado');
    }

    const baseUrl = this.config.get<string>('DATA_SCIENCE_URL');
    if (!baseUrl) return { available: false, reason: 'disabled' };

    const sets = await this.prisma.setLog.findMany({
      where: {
        workoutLog: { studentId },
        sessionExercise: { exerciseId },
        actualLoad: { gt: 0 },
        actualReps: { gt: 0 },
      },
      select: {
        actualLoad: true,
        actualReps: true,
        actualRpe: true,
        workoutLog: { select: { performedAt: true } },
      },
      orderBy: { workoutLog: { performedAt: 'desc' } },
      take: MAX_SETS,
    });
    return this.requestSuggestion(
      baseUrl,
      sets.map(toHistorySet),
      { studentId, exerciseId },
      targetReps,
    );
  }

  // Resumen para la portada del alumno: los ejercicios que más entrena, con
  // su tendencia de fuerza y la sugerencia del modelo, sin elegir nada.
  async getHighlights(
    coachId: string,
    studentId: string,
  ): Promise<SuggestedLoadHighlights> {
    await this.studentsService.getOwnedByCoach(coachId, studentId);
    const baseUrl = this.config.get<string>('DATA_SCIENCE_URL');
    if (!baseUrl) return { enabled: false, items: [] };

    const ranked = await this.topExercises(studentId, { coachId });
    const items = await Promise.all(
      ranked.map(async (item) => ({
        exerciseId: item.exerciseId,
        exerciseName: item.exerciseName,
        sessions: item.trend.length,
        trend: item.trend.slice(-TREND_POINTS),
        suggestion: await this.requestSuggestion(baseUrl, item.history, {
          studentId,
          exerciseId: item.exerciseId,
        }),
      })),
    );
    return { enabled: true, items };
  }

  // Progreso para el propio alumno: su fuerza estimada y la previsión del
  // modelo, nunca la carga sugerida (la prescripción es decisión del coach).
  // El progreso no depende del modelo: sin servicio, `forecast` es null.
  async getStudentProgress(studentId: string): Promise<StudentProgress> {
    const baseUrl = this.config.get<string>('DATA_SCIENCE_URL');
    const ranked = (await this.topExercises(studentId, {})).filter(
      (item) => item.trend.length >= MIN_PROGRESS_SESSIONS,
    );
    const items = await Promise.all(
      ranked.map(async (item) => {
        const first = item.trend[0];
        const last = item.trend[item.trend.length - 1];
        const suggestion = baseUrl
          ? await this.requestSuggestion(baseUrl, item.history, {
              studentId,
              exerciseId: item.exerciseId,
            })
          : null;
        return {
          exerciseId: item.exerciseId,
          exerciseName: item.exerciseName,
          sessions: item.trend.length,
          since: first.date,
          firstE1rmKg: first.e1rmKg,
          lastE1rmKg: last.e1rmKg,
          changePct: Math.round((last.e1rmKg / first.e1rmKg - 1) * 1000) / 10,
          trend: item.trend.slice(-TREND_POINTS),
          forecast:
            suggestion?.available && suggestion.predictedE1rmKg !== undefined
              ? {
                  predictedE1rmKg: suggestion.predictedE1rmKg,
                  expectedChangePct: suggestion.expectedChangePct ?? 0,
                }
              : null,
        };
      }),
    );
    return { items };
  }

  // Ejercicios activos que el alumno más ha entrenado, con su historial.
  private async topExercises(
    studentId: string,
    exercise: { coachId?: string },
  ) {
    const sets = await this.prisma.setLog.findMany({
      where: {
        workoutLog: { studentId },
        sessionExercise: { exercise: { ...exercise, isActive: true } },
        actualLoad: { gt: 0 },
        actualReps: { gt: 0 },
      },
      select: {
        actualLoad: true,
        actualReps: true,
        actualRpe: true,
        workoutLog: { select: { performedAt: true } },
        sessionExercise: {
          select: { exercise: { select: { id: true, name: true } } },
        },
      },
      orderBy: { workoutLog: { performedAt: 'desc' } },
      take: HIGHLIGHT_MAX_SETS,
    });

    const byExercise = new Map<
      string,
      { name: string; history: HistorySet[] }
    >();
    for (const set of sets) {
      const { id, name } = set.sessionExercise.exercise;
      const entry = byExercise.get(id) ?? { name, history: [] };
      entry.history.push(toHistorySet(set));
      byExercise.set(id, entry);
    }
    // Primero los más entrenados; si empatan, el entrenado más recientemente.
    return [...byExercise.entries()]
      .map(([exerciseId, entry]) => ({
        exerciseId,
        exerciseName: entry.name,
        history: entry.history.slice(0, MAX_SETS),
        trend: sessionTrend(entry.history),
      }))
      .sort(
        (a, b) =>
          b.trend.length - a.trend.length ||
          b.history[0].date.localeCompare(a.history[0].date),
      )
      .slice(0, HIGHLIGHT_LIMIT);
  }

  private async requestSuggestion(
    baseUrl: string,
    history: HistorySet[],
    context: { studentId: string; exerciseId: string },
    targetReps?: number,
  ): Promise<SuggestedLoadResult> {
    const reps = Math.min(
      15,
      Math.max(1, targetReps ?? lastTopSetReps(history) ?? DEFAULT_TARGET_REPS),
    );

    let body: ServiceResponse;
    try {
      const response = await fetch(
        new URL('/v1/suggested-load', baseUrl).toString(),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ history, target_reps: reps }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      body = (await response.json()) as ServiceResponse;
    } catch (error) {
      this.logger.warn(
        `Servicio de carga sugerida no disponible: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { available: false, reason: 'service_unavailable' };
    }

    if (!body.available) {
      return {
        available: false,
        reason: body.reason ?? 'insufficient_history',
        minSessions: body.min_sessions,
        basedOnSessions: body.based_on_sessions,
      };
    }
    const result: SuggestedLoadResult = {
      available: true,
      suggestedLoadKg: body.suggested_load_kg,
      targetReps: body.target_reps,
      lastE1rmKg: body.last_e1rm_kg,
      predictedE1rmKg: body.predicted_e1rm_kg,
      expectedChangePct: body.expected_change_pct,
      basedOnSessions: body.based_on_sessions,
      lastSession: body.last_session && {
        date: body.last_session.date,
        loadKg: body.last_session.load_kg,
        reps: body.last_session.reps,
      },
      suggestedLoadRangeKg: body.suggested_load_range_kg,
      adjustments: body.adjustments ?? [],
      modelVersion: body.model_version,
    };
    await this.recordPrediction(context, result);
    return result;
  }

  // Guarda la predicción para compararla después con la sesión real
  // (prisma/evaluate-suggested-loads.ts). Nunca afecta la respuesta.
  private async recordPrediction(
    context: { studentId: string; exerciseId: string },
    result: SuggestedLoadResult,
  ) {
    const { lastSession, modelVersion, targetReps } = result;
    if (
      !lastSession ||
      !modelVersion ||
      !targetReps ||
      result.suggestedLoadKg === undefined ||
      result.lastE1rmKg === undefined ||
      result.predictedE1rmKg === undefined
    )
      return;
    const key = {
      ...context,
      lastSessionDate: new Date(`${lastSession.date}T00:00:00.000Z`),
      targetReps,
      modelVersion,
    };
    const range = result.suggestedLoadRangeKg;
    try {
      await this.prisma.suggestedLoadLog.upsert({
        where: {
          studentId_exerciseId_lastSessionDate_targetReps_modelVersion: key,
        },
        create: {
          ...key,
          suggestedLoadKg: new Prisma.Decimal(result.suggestedLoadKg),
          rangeLowKg: range ? new Prisma.Decimal(range[0]) : null,
          rangeHighKg: range ? new Prisma.Decimal(range[1]) : null,
          lastE1rmKg: new Prisma.Decimal(result.lastE1rmKg),
          predictedE1rmKg: new Prisma.Decimal(result.predictedE1rmKg),
          adjustments: result.adjustments ?? [],
        },
        update: {},
      });
    } catch (error) {
      this.logger.warn(
        `No se pudo registrar la predicción: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
