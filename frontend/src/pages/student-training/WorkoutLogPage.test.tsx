import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithRoute } from '../../test/renderWithProviders';
import { apiClient, ApiError } from '../../lib/apiClient';
import { WorkoutLogPage } from './WorkoutLogPage';
beforeEach(()=>vi.restoreAllMocks());
describe('Compatibilidad del historial',()=>{
 it('conserva registros anteriores sin permitir agregar series',async()=>{vi.spyOn(apiClient,'get').mockResolvedValue({data:{id:'old',sessionId:'s',performedAt:'2026-10-20',completionStatus:'PARTIAL',prescriptionSource:'legacy-current',setLogs:[{id:'set',setNumber:1,actualLoad:97.5,actualReps:5,actualRpe:8,sessionExercise:{exercise:{name:'Sentadilla'}}}]},error:null,meta:{}});renderWithRoute(<WorkoutLogPage />,{path:'/workout-logs/:id',route:'/workout-logs/old'});expect(await screen.findByText('Registro histórico')).toBeInTheDocument();expect(screen.getByText(/97.5 kg/)).toBeInTheDocument();expect(screen.queryByRole('button',{name:/agregar|añadir/i})).not.toBeInTheDocument();});
 it('muestra error de acceso sin datos privados',async()=>{vi.spyOn(apiClient,'get').mockRejectedValue(new ApiError(404,'Registro no encontrado'));renderWithRoute(<WorkoutLogPage />,{path:'/workout-logs/:id',route:'/workout-logs/old'});expect(await screen.findByRole('alert')).toHaveTextContent('Registro no encontrado');});
});
