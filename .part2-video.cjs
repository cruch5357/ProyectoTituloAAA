const fs=require('fs');
function edit(p,f){fs.writeFileSync(p,f(fs.readFileSync(p,'utf8').replace(/\r\n/g,'\n')));}
for(const file of ['ExerciseFormDialog','ExerciseDetailPage']) edit(`frontend/src/pages/exercises/${file}.tsx`,s=>`import { ExerciseVideo } from '../../components/ui/ExerciseVideo';\nimport { parseExerciseVideo } from '../../lib/exerciseVideo';\n`+s.replace('    event.preventDefault();','    event.preventDefault();\n    if (videoUrl.trim() && !parseExerciseVideo(videoUrl)) return;').replace('Video/enlace (opcional)','Video demostrativo (opcional)').replace('placeholder="https://…"','placeholder="https://www.youtube.com/watch?v=..."').replace(/(\s*)\{(createMutation|updateMutation).isError && \(/,`$1<ExerciseVideo videoUrl={videoUrl.trim()} name={name || 'Ejercicio'} label="Vista previa" />
          <p className="muted">YouTube público o no listado, con reproducción embebida habilitada.</p>
          {$2.isError && (`).replace('videoUrl: videoUrl.trim() || undefined,',file==='ExerciseDetailPage'?'videoUrl: videoUrl.trim() || null,':'videoUrl: videoUrl.trim() || undefined,').replace(/disabled=\{(createMutation|updateMutation).isPending \|\| name.trim\(\).length === 0\}/g,'disabled={$1.isPending || name.trim().length === 0 || (!!videoUrl.trim() && !parseExerciseVideo(videoUrl))}'));
edit('frontend/src/pages/exercises/ExercisesListPage.tsx',s=>s.replace('{exercise.name}','{exercise.name}').replace('</Link>\n                    </td>','</Link>\n                      {exercise.videoUrl && <small className="muted"> · Video disponible</small>}\n                    </td>'));
for(const p of ['frontend/src/pages/student-training/WorkoutLogPage.tsx','frontend/src/pages/student-training/StudentSessionPage.tsx','frontend/src/pages/sessions/SessionDetailPage.tsx']) edit(p,s=>{
 s=`import { ExerciseVideo } from '../../components/ui/ExerciseVideo';\n`+s;
 if(p.includes('StudentSessionPage')) return s.replace('<td>{item.exercise.name}</td>','<td>{item.exercise.name}<ExerciseVideo videoUrl={item.exercise.videoUrl} name={item.exercise.name} /></td>');
 if(p.includes('WorkoutLogPage')) return s.replace('{exercise.order}. {exercise.exercise.name}','{exercise.order}. {exercise.exercise.name}{exercise.exercise.videoUrl ? " · Video disponible" : ""}').replace('          <span>Número de serie</span>',`          <span>Número de serie</span>`).replace('        <label className="field">\n          <span>Número de serie</span>',`        {sessionQuery.data?.exercises.filter((item) => item.id === sessionExerciseId).map((item) => (
          <ExerciseVideo key={item.id} videoUrl={item.exercise.videoUrl} name={item.exercise.name} />
        ))}
        <label className="field">
          <span>Número de serie</span>`);
 return s.replace('{!exercise.isActive ?','{exercise.videoUrl ? " · Video disponible" : ""}\n              {!exercise.isActive ?').replace('      <h3>Agregar ejercicio del catálogo</h3>',`      <h3>Agregar ejercicio del catálogo</h3>
      {exercisesQuery.data?.items.filter((item) => item.id === exerciseId).map((item) => (
        <ExerciseVideo key={item.id} videoUrl={item.videoUrl} name={item.name} />
      ))}`);
});
