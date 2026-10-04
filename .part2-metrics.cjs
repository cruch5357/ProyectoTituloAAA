const fs=require('fs');
function edit(p,f){fs.writeFileSync(p,f(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')));}
for(const p of ['backend/src/dashboard/dashboard-student.service.ts','backend/src/workout-logs/workout-logs.service.ts']) edit(p,s=>s.replace('  WorkoutSummaryMetrics,','  WorkoutSummaryMetrics,\n  RecentPerformance,\n  computeRecentPerformance,').replace('  summary: WorkoutSummaryMetrics;','  summary: WorkoutSummaryMetrics;\n  recentPerformance: RecentPerformance;').replace('    const summary = await computeWorkoutSummaryMetrics(this.prisma, where);','    const [summary, recentPerformance] = await Promise.all([computeWorkoutSummaryMetrics(this.prisma, where), computeRecentPerformance(this.prisma, where)]);').replace('return { summary, exerciseEvolution };','return { summary, recentPerformance, exerciseEvolution };').replace('      workoutsRegistered,\n      summary,','      workoutsRegistered,\n      recentPerformance,\n      summary,').replace('      countRegisteredWorkouts(this.prisma, where),','      countRegisteredWorkouts(this.prisma, where),\n      computeRecentPerformance(this.prisma, where),').replace('      student,\n      workoutsRegistered,','      student,\n      recentPerformance,\n      workoutsRegistered,'));
edit('backend/src/workout-logs/dto/list-workout-logs-query.dto.ts',s=>s.replace('  IsDateString,','  IsDateString,\n  IsIn,').replace('export class ListWorkoutLogsQueryDto {',`export class ListWorkoutLogsQueryDto {
  @ApiPropertyOptional({ enum: ['in-progress'] })
  @IsOptional()
  @IsIn(['in-progress'])
  state?: 'in-progress';
`));
edit('backend/src/workout-logs/workout-logs.service.ts',s=>s.replace('        sessionId: query.sessionId,\n      }),','        sessionId: query.sessionId,\n      }),\n      ...(query.state === \'in-progress\' ? { durationMinutes: null } : {}),'));
edit('frontend/src/api/workoutLogs.ts',s=>s.replace('  sessionId?: string;','  sessionId?: string;\n  state?: \'in-progress\';').replace('queryKey: workoutLogsKeys.bySession(sessionId),\n      });\n      queryClient.setQueryData','queryKey: workoutLogsKeys.all,\n      });\n      queryClient.setQueryData').replace('queryKey: workoutLogsKeys.bySession(updated.sessionId),','queryKey: workoutLogsKeys.all,'));
edit('frontend/src/types/workoutEvolution.ts',s=>s.replace('  summary: WorkoutSummaryMetrics;','  summary: WorkoutSummaryMetrics;\n  recentPerformance?: RecentPerformance;')+`
export interface RecentPerformance {
  from: string;
  to: string;
  averageOverallRpe: number | null;
  effortPoints: { performedAt: string; overallRpe: number }[];
  workoutsRegistered: number;
  lastActivityAt: string | null;
}
`);
edit('frontend/src/types/dashboard.ts',s=>s.replace('import type { WorkoutSummaryMetrics }','import type { RecentPerformance, WorkoutSummaryMetrics }').replace('  student: PublicUser;','  student: PublicUser;\n  recentPerformance?: RecentPerformance;'));
edit('frontend/src/pages/coach-dashboard/DashboardPage.tsx',s=>s.replace("import { Card, EmptyState, Skeleton }","import { EmptyState, Skeleton }").replace(/function formatNumber[\s\S]*?\n}\n/,'').replace(/            <div className="stat-card">\n              <span className="stat-card__label">Frecuencia[\s\S]*?(?=          <\/div>)/,'').replace(/      <div className="dashboard-grid planning-grid">[\s\S]*?      <h2>Actividad reciente<\/h2>/,`      <p className="dialog-actions"><Link className="button button--secondary" to="/students">Ver alumnos</Link><Link className="button button--secondary" to="/programs">Revisar asignaciones</Link></p>
      <h2>Actividad reciente</h2>`).replace('Métricas agregadas de tus alumnos, calculadas únicamente a partir de los\n        entrenamientos que realmente registraron.','Alumnos, asignaciones y actividad registrada de tu equipo. Consulta el perfil de cada alumno para revisar su rendimiento personal.'));
// The published group summary stays compatible for now; UI no longer consumes its personal averages.
edit('backend/src/dashboard/dashboard-summary.service.ts',s=>s.replace('  summary: WorkoutSummaryMetrics;','  /** @deprecated Personal averages are not meaningful for groups. Use the student endpoint. */\n  summary: WorkoutSummaryMetrics;'));
