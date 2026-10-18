import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  model_version?: string;
}

// Repeticiones de la mejor serie (mayor 1RM estimado, Epley) de la sesión
// más reciente: es la referencia por defecto si el coach no indica otras.
function lastTopSetReps(
  history: { date: string; load_kg: number; reps: number }[],
): number | undefined {
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
// servicio solo fechas, cargas y repeticiones (ningún dato personal). Si el
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
        workoutLog: { select: { performedAt: true } },
      },
      orderBy: { workoutLog: { performedAt: 'desc' } },
      take: MAX_SETS,
    });

    const history = sets.map((set) => ({
      date: set.workoutLog.performedAt.toISOString().slice(0, 10),
      load_kg: Number(set.actualLoad),
      reps: set.actualReps,
    }));
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
    return {
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
      modelVersion: body.model_version,
    };
  }
}
