import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { apiClient } from '../../lib/apiClient';
import { StudentHomePage } from './StudentHomePage';
const session = { id:'a:s', sessionId:'s', assignmentId:'a', name:'Día de fuerza', blockName:'Fuerza', weekNumber:1, dayNumber:1, date:'2026-10-21', status:'PARTIAL', recordedSets:1,totalSets:4,exerciseCount:1,muscleGroups:['quadriceps'] };
function setup(empty=false) { vi.spyOn(apiClient,'get').mockResolvedValue({ data:{today:'2026-10-21',assignments:empty?[]:[{id:'a',name:'Fuerza',weekCount:2,currentWeek:{weekNumber:1},finishedSessions:0,totalSessions:4}],sessions:empty?[]:[session],nextSession:empty?null:session,pendingSession:null},error:null,meta:{} }); }
beforeEach(()=>vi.restoreAllMocks());
describe('Inicio basado en bloques',()=>{
 it('ofrece registrar la sesión directamente y muestra progreso real',async()=>{setup();renderWithProviders(<StudentHomePage training />);expect(await screen.findByRole('link',{name:/Continuar entrenamiento/})).toHaveAttribute('href','/training/sessions/s?assignmentId=a');expect(screen.getByText('Parcial')).toBeInTheDocument();expect(screen.queryByText('Mis programas')).not.toBeInTheDocument();});
 it('muestra un estado vacío honesto',async()=>{setup(true);renderWithProviders(<StudentHomePage />);expect(await screen.findByText('Tu próximo ciclo empieza aquí')).toBeInTheDocument();});
 it('reutiliza las imágenes musculares del catálogo',async()=>{setup();renderWithProviders(<StudentHomePage />);expect(await screen.findByText('Qué vas a trabajar')).toBeInTheDocument();expect(screen.getByRole('img',{name:/Zona muscular/})).toHaveAttribute('src',expect.stringContaining('.webp'));});
});
