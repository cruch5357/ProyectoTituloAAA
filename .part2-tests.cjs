const fs=require('fs');
function edit(p,f){fs.writeFileSync(p,f(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')));}
edit('backend/src/workout-logs/workout-logs.service.spec.ts',s=>s.replace('findMany: jest.fn(),','findMany: jest.fn().mockResolvedValue([]),'));
edit('backend/src/dashboard/dashboard-student.service.spec.ts',s=>s.replace('groupBy: jest.Mock }','groupBy: jest.Mock; findMany: jest.Mock }').replace('groupBy: jest.fn()','groupBy: jest.fn(), findMany: jest.fn().mockResolvedValue([])'));
edit('backend/src/session-exercises/session-exercises.controller.spec.ts',s=>s.replace('muscleGroup: null,','muscleGroup: null,\n      videoUrl: null,'));
edit('backend/src/workout-logs/workout-logs.controller.spec.ts',s=>s.replace('      exerciseEvolution: null,',`      recentPerformance: { from: new Date(), to: new Date(), averageOverallRpe: null, effortPoints: [], workoutsRegistered: 0, lastActivityAt: null },
      exerciseEvolution: null,`));
edit('frontend/src/pages/imports/ImportExcelPage.test.tsx',s=>s.replace("    expect(postSpy).toHaveBeenCalledWith('/imports/excel/batch-1/reject');",`    expect(postSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('button--neutral');
    expect(screen.getByRole('button', { name: 'Rechazar definitivamente' })).toHaveClass('button--danger');
    await user.click(screen.getByRole('button', { name: 'Rechazar definitivamente' }));
    expect(postSpy).toHaveBeenCalledWith('/imports/excel/batch-1/reject');`));
edit('frontend/src/pages/coach-dashboard/StudentDashboardPage.tsx',s=>s.replace('          <PersonalPerformance',`          {dashboardQuery.data.workoutsRegistered === 0 && <p>Este alumno todavía no tiene entrenamientos registrados en este rango.</p>}
          <PersonalPerformance`));
edit('frontend/src/pages/student-training/HistoryPage.tsx',s=>s.replace('          <PersonalPerformance',`          {evolutionQuery.data.summary.totalWorkouts === 0 && <p>Todavía no tienes entrenamientos finalizados en este rango para calcular una evolución.</p>}
          <PersonalPerformance`));
edit('frontend/src/pages/coach-dashboard/DashboardPage.test.tsx',s=>s.replace("    expect(screen.getByText('45 min')).toBeInTheDocument();",`    expect(screen.getByText('45 min')).toBeInTheDocument();
    for (const label of ['Fatiga promedio', 'RPE promedio', 'Frecuencia (por semana)', 'Duración promedio (min)']) expect(screen.queryByText(label)).not.toBeInTheDocument();`));
