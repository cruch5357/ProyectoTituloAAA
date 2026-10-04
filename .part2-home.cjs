const fs=require('fs');
function edit(p,f){fs.writeFileSync(p,f(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')));}
edit('frontend/src/pages/student-training/StudentHomePage.tsx',s=>`import { PersonalPerformance } from '../../components/ui/PersonalPerformance';\n`+s.replace('  StatCard,\n','').replace('  const evolution = useWorkoutEvolution({});',`  const evolution = useWorkoutEvolution({});
  const inProgress = useWorkoutLogsHistory({ page: 1, limit: 1, state: 'in-progress' });
  const pending = inProgress.data?.items[0];`).replace('      {assignments.isLoading',`      {inProgress.isLoading && <Skeleton label="Buscando entrenamientos en curso…" />}
      {inProgress.isError && <ErrorState retry={() => void inProgress.refetch()} message="No pudimos comprobar si tienes un entrenamiento en curso." />}
      {pending && <section className="hero-card">
        <p className="eyebrow">Entrenamiento en curso</p>
        <h2>{pending.session?.name ?? 'Tu sesión'}</h2>
        <p>{pending.session?.week.block.program.name} · {pending.session?.week.block.name} · Semana {pending.session?.week.number}</p>
        <Link className="button button--primary" to={\`/workout-logs/\${pending.id}\`}>Continuar entrenamiento</Link>
      </section>}
      {assignments.isLoading`).replace('{program && (','{program && !pending && inProgress.isSuccess && (').replace('          <h2>Tu progreso</h2>\n','').replace(/          \{evolution.data && \([\s\S]*?          <Card>/,`          {evolution.data && <PersonalPerformance summary={evolution.data.summary} recent={evolution.data.recentPerformance} registered={history.data?.meta.total} />}
          <Card>`));
for(const [p,query] of [['frontend/src/pages/coach-dashboard/StudentDashboardPage.tsx','dashboardQuery'],['frontend/src/pages/student-training/HistoryPage.tsx','evolutionQuery']]) edit(p,s=>`import { PersonalPerformance } from '../../components/ui/PersonalPerformance';\n`+s.replace(/          \{(?:dashboardQuery.data.workoutsRegistered|evolutionQuery.data.summary.totalWorkouts) === 0 \? \([\s\S]*?\n          \)\}/,`          <PersonalPerformance summary={${query}.data.summary} recent={${query}.data.recentPerformance} ${query==='dashboardQuery'?'registered={dashboardQuery.data.workoutsRegistered}':''} />
          <p className="muted">Fatiga promedio (historial consultado): {formatNumber(${query}.data.summary.averageFatigue)} · Series registradas: {${query}.data.summary.totalSetLogs}</p>`));
edit('frontend/src/pages/students/AthleteWorkspace.tsx',s=>`import { PersonalPerformance } from '../../components/ui/PersonalPerformance';\n`+s.replace('  StatCard,\n','').replace(/      <div className="stat-cards">[\s\S]*?      <\/div>/,'      <PersonalPerformance summary={query.data.summary} recent={query.data.recentPerformance} registered={query.data.workoutsRegistered} />'));
// Native dialog confirmation for rejecting an import batch permanently.
edit('frontend/src/pages/imports/ImportExcelPage.tsx',s=>s.replace("import { useState }", "import { useRef, useState }").replace('  const [selectedFile,','  const rejectDialog = useRef<HTMLDialogElement>(null);\n  const [selectedFile,').replace('className="button--secondary"\n                  onClick={() => rejectMutation.mutate()}','className="button--danger"\n                  onClick={() => rejectDialog.current?.showModal()}').replace('      <div className="page-header">',`      <dialog ref={rejectDialog} className="invite-dialog" aria-label="Confirmar rechazo">
        <h2>Rechazar importación</h2>
        <p>Se rechazará {batch?.originalFilename}. Este lote no podrá confirmarse después. No se eliminarán programas existentes; podrás subir el archivo nuevamente como otro lote.</p>
        <div className="dialog-actions">
          <button type="button" className="button--neutral" onClick={() => rejectDialog.current?.close()}>Cancelar</button>
          <button type="button" className="button--danger" onClick={() => { rejectDialog.current?.close(); rejectMutation.mutate(); }}>Rechazar definitivamente</button>
        </div>
      </dialog>
      <div className="page-header">`).replace('type="button"\n                  onClick={() => confirmMutation.mutate()}','type="button"\n                  className="button--primary"\n                  onClick={() => confirmMutation.mutate()}'));
