import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
const { PrismaClient } = require('../../backend/node_modules/@prisma/client');
const argon2 = require('../../backend/node_modules/argon2');
const db = new PrismaClient(); const base='http://localhost:3101/api/v1';
const suffix=randomUUID(), password=`Test-${suffix}`; let coach:any, student:any, other:any, source:any;
test.beforeAll(async()=>{
 const hash=await argon2.hash(password);
 coach=await db.user.create({data:{name:'Coach asignaciones',email:`coach-${suffix}@example.invalid`,role:'COACH',passwordHash:hash}});
 student=await db.user.create({data:{name:'Alumno asignaciones',email:`student-${suffix}@example.invalid`,role:'STUDENT',coachId:coach.id,passwordHash:hash}});
 other=await db.user.create({data:{name:'Otro alumno',email:`other-student-${suffix}@example.invalid`,role:'STUDENT',coachId:coach.id,passwordHash:hash}});
 const exercise=await db.exercise.create({data:{name:'Sentadilla congelada',coachId:coach.id,muscleGroups:['quadriceps'],muscleGroup:'Cuádriceps'}});
 source=await db.block.create({data:{name:'Ciclo Fuerza',coachId:coach.id,order:1,weeks:{create:[1,2,3].map(n=>({number:n,order:n,sessions:{create:n===2?[]:[1,2].map(d=>({name:`Sesión ${n}-${d}`,order:d,sessionExercises:{create:{exerciseId:exercise.id,order:1,targetSets:4,modifiers:[{name:'Low Bar',category:'Variante'}],programmedSets:{create:[1,2,3,4].map(order=>({order,weight:100,reps:5,rpe:7,priority:'low'}))}}}}))}}))}},include:{weeks:{include:{sessions:true}}}});
});
test.afterAll(async()=>{
 if(coach){const students=[student?.id,other?.id].filter(Boolean);await db.workoutLog.deleteMany({where:{studentId:{in:students}}});await db.programAssignment.deleteMany({where:{studentId:{in:students}}});await db.program.deleteMany({where:{coachId:coach.id}});await db.block.deleteMany({where:{coachId:coach.id}});await db.exercise.deleteMany({where:{coachId:coach.id}});await db.auditLog.deleteMany({where:{actorId:{in:[coach.id,...students]}}});await db.user.deleteMany({where:{id:{in:students}}});await db.user.delete({where:{id:coach.id}});}await db.$disconnect();
});
async function auth(request:any,email:string){const r=await request.post(`${base}/auth/login`,{data:{email,password}});expect(r.ok()).toBeTruthy();return {Authorization:`Bearer ${(await r.json()).data.accessToken}`};}
async function login(page:any,email:string){await page.goto('/login');await page.getByLabel('Correo',{exact:true}).fill(email);await page.getByLabel('Contraseña',{exact:true}).fill(password);await page.getByRole('button',{name:'Ingresar',exact:true}).click();await expect(page).not.toHaveURL(/login/);}
test('asignar, entrenar, calendario, snapshot, persistencia, restricciones y reemplazo',async({page,request,browser})=>{
 test.setTimeout(180000);
 const headers=await auth(request,coach.email), sh=await auth(request,student.email), oh=await auth(request,other.email);
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 for(const data of [{},{blockId:source.id,startDate:'2026-02-30',dayOffsets:[1,3]},{blockId:source.id,startDate:today,dayOffsets:[1,1]}]) expect((await request.post(`${base}/students/${student.id}/block-assignments`,{headers,data})).status()).toBe(400);
 await login(page,coach.email);await page.goto(`/students/${student.id}?tab=program`);await page.getByRole('button',{name:'Asignar bloque',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Asignar bloque',exact:true});await dialog.getByLabel('Bloque reusable').selectOption(source.id);await dialog.getByLabel('Fecha de inicio').fill(today);await dialog.getByLabel('Posición del día 2').selectOption('3');await dialog.getByRole('button',{name:'Confirmar asignación'}).click();await expect(dialog).not.toBeVisible();await expect(page.getByText('Ciclo activo',{exact:true})).toBeVisible();
 const overview=(await (await request.get(`${base}/training/me`,{headers:sh})).json()).data;expect(overview.sessions).toHaveLength(4);const sessions=overview.sessions;expect(sessions[0].date).toBe(today);
 const add=(n:number)=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
 expect(sessions.map((s:any)=>s.date)).toEqual([today,add(2),add(14),add(16)]);
 expect((await request.post(`${base}/students/${student.id}/block-assignments`,{headers,data:{blockId:source.id,startDate:today,dayOffsets:[1,3]}})).status()).toBe(409);
 expect((await request.get(`${base}/training/sessions/${sessions[0].sessionId}`,{headers:oh})).status()).toBe(404);
 await db.block.update({where:{id:source.id},data:{name:'Plantilla editada'}});await db.exercise.updateMany({where:{coachId:coach.id},data:{name:'Catálogo editado',muscleGroups:['chest']}});
 let detail=(await (await request.get(`${base}/training/sessions/${sessions[0].sessionId}`,{headers:sh})).json()).data;expect(detail.blockName).toBe('Ciclo Fuerza');expect(detail.exercises[0].name).toBe('Low Bar Sentadilla congelada');expect(detail.exercises[0].muscleGroups).toEqual(['quadriceps']);
 expect((await request.patch(`${base}/sessions/${detail.id}`,{headers,data:{name:'No modificar'}})).status()).toBe(404);
 const studentContext=await browser.newContext();const sp=await studentContext.newPage();await login(sp,student.email);await sp.goto('/home');await expect(sp.getByRole('img',{name:'Zona muscular: Cuádriceps'})).toBeVisible();expect(await sp.getByRole('link',{name:'Mis programas',exact:true}).count()).toBe(0);
 await sp.getByRole('link',{name:/Ver entrenamiento/}).click();await expect(sp.locator('.performed-set')).toHaveCount(4);await sp.getByRole('button',{name:'✓ Como prescrito',exact:true}).first().click();const weight=sp.getByLabel('Peso serie 1 de Low Bar Sentadilla congelada',{exact:true});await expect(weight).toHaveValue('100');await weight.fill('97.5');await sp.getByRole('button',{name:'Guardar progreso',exact:true}).click();await expect(sp.getByText('Registro guardado.',{exact:true})).toBeVisible();await expect(sp.locator('.training-session-header')).toContainText('Parcial');await sp.reload();await expect(weight).toHaveValue('97.5');await expect(sp.locator('.set-prescription').first()).toContainText('100 kg');expect(await sp.getByRole('button',{name:/añadir serie|agregar serie/i}).count()).toBe(0);
 detail=(await (await request.get(`${base}/training/sessions/${sessions[0].sessionId}`,{headers:sh})).json()).data;
 expect((await request.patch(`${base}/training/sessions/${detail.id}`,{headers:sh,data:{revision:detail.revision,finish:false,sets:[{sessionExerciseId:detail.exercises[0].id,setNumber:5,status:'RECORDED',reps:5}]}})).status()).toBe(400);
 expect((await request.patch(`${base}/training/sessions/${detail.id}`,{headers:sh,data:{revision:0,finish:false,sets:[]}})).status()).toBe(409);
 await expect(db.setLog.create({data:{workoutLogId:detail.workoutLogId,sessionExerciseId:detail.exercises[0].id,setNumber:5,actualReps:5}})).rejects.toThrow();
 expect((await request.post(`${base}/sessions/${detail.id}/workout-logs`,{headers:sh})).status()).toBe(409);
 await sp.getByRole('button',{name:'Finalizar sesión',exact:true}).click();await sp.getByRole('dialog',{name:'Confirmar registro'}).getByRole('button',{name:'Confirmar',exact:true}).click();await expect(sp.locator('.performed-set--SKIPPED')).toHaveCount(3);
 await sp.goto(`/training/sessions/${sessions[1].sessionId}`);await sp.getByRole('button',{name:'Omitir sesión',exact:true}).click();await sp.getByRole('dialog',{name:'Confirmar registro'}).getByRole('button',{name:'Confirmar',exact:true}).click();await expect(sp.locator('.training-session-header')).toContainText('Omitido');
 await sp.goto(`/training/sessions/${sessions[2].sessionId}`);await expect(sp.locator('.performed-set')).toHaveCount(4);for(const button of await sp.getByRole('button',{name:'✓ Como prescrito',exact:true}).all())await button.click();await sp.getByRole('button',{name:'Finalizar sesión',exact:true}).click();await sp.getByRole('dialog',{name:'Confirmar registro'}).getByRole('button',{name:'Confirmar',exact:true}).click();await expect(sp.locator('.training-session-header')).toContainText('Completado');await sp.reload();await expect(sp.locator('.performed-set--RECORDED')).toHaveCount(4);
 await sp.goto('/calendar');await sp.getByRole('link',{name:/Sesión 1-1/}).click();await expect(sp).toHaveURL(new RegExp(sessions[0].sessionId));
 await expect(sp.locator('.performed-set')).toHaveCount(4);await sp.setViewportSize({width:390,height:844});await expect(sp.locator('.training-session-header')).toBeVisible();expect(await sp.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBeTruthy();await sp.screenshot({path:'test-results/student-training-mobile.png',fullPage:true});
 await page.goto(`/students/${student.id}?tab=calendar`);await page.getByRole('link',{name:/Sesión 1-1/}).click();await expect(page.locator('.training-session-header')).toContainText('Parcial');expect(await page.getByRole('button',{name:'Guardar progreso'}).count()).toBe(0);
 const assigned=await request.post(`${base}/students/${student.id}/block-assignments`,{headers,data:{blockId:source.id,startDate:add(7),dayOffsets:[1,3],replaceActive:true}});expect(assigned.ok()).toBeTruthy();expect(await db.programAssignment.count({where:{studentId:student.id,status:'ACTIVE'}})).toBe(1);expect(await db.workoutLog.count({where:{studentId:student.id}})).toBe(3);
 expect((await request.patch(`${base}/training/sessions/${detail.id}`,{headers:sh,data:{revision:detail.revision+1,finish:true,sets:[]}})).status()).toBe(409);
 await sp.goto('/my-programs');await expect(sp).toHaveURL(/\/training$/);await studentContext.close();
});
test('compatibilidad anterior, días vacíos, snapshot independiente y cambio de inicio protegido',async({request})=>{
 const headers=await auth(request,coach.email), sh=await auth(request,other.email);
 const legacy=await db.program.create({data:{coachId:coach.id,name:'Anterior',blocks:{create:{name:'Base antigua',order:1,weeks:{create:{number:1,order:1,sessions:{create:{name:'Sesión antigua',order:1,dayOfWeek:1}}}}}}},include:{blocks:{include:{weeks:{include:{sessions:true}}}}}});
 const legacyAssignment=await db.programAssignment.create({data:{programId:legacy.id,studentId:other.id,startDate:new Date('2026-01-05')}});
 const legacySession=legacy.blocks[0].weeks[0].sessions[0];await db.workoutLog.create({data:{studentId:other.id,sessionId:legacySession.id,programAssignmentId:legacyAssignment.id,durationMinutes:30,completionStatus:'SKIPPED'}});
 const detail=(await (await request.get(`${base}/training/sessions/${legacySession.id}`,{headers:sh})).json()).data;expect(detail.readOnly).toBe(true);expect(detail.legacy).toBe(true);
 const empty=await db.block.create({data:{coachId:coach.id,name:'Movilidad sin series',order:1,weeks:{create:{number:1,order:1,sessions:{create:{name:'Descanso activo',order:1}}}}}});
 const response=await request.post(`${base}/students/${other.id}/block-assignments`,{headers,data:{blockId:empty.id,startDate:'2020-01-01',dayOffsets:[1],replaceActive:true}});expect(response.ok()).toBe(true);const assignment=(await response.json()).data;
 expect((await request.patch(`${base}/program-assignments/${assignment.id}/start-date`,{headers,data:{startDate:'2020-01-02'}})).status()).toBe(409);
 const overview=(await (await request.get(`${base}/training/me`,{headers:sh})).json()).data;expect(overview.pendingSession.name).toBe('Descanso activo');const id=overview.sessions[0].sessionId;
 const finish=await request.patch(`${base}/training/sessions/${id}`,{headers:sh,data:{revision:0,sets:[],finish:true}});expect(finish.ok()).toBe(true);expect((await finish.json()).data.status).toBe('SKIPPED');
 expect((await request.delete(`${base}/block-library/${empty.id}`,{headers})).ok()).toBe(true);expect((await request.get(`${base}/training/sessions/${id}`,{headers:sh})).ok()).toBe(true);
 expect(await db.workoutLog.count({where:{studentId:other.id}})).toBe(2);
});
