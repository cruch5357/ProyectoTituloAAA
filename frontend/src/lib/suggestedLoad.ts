import type {
  SuggestedLoad,
  SuggestedLoadAdjustment,
} from '../types/dashboard';

const kg = (value: number) =>
  value.toLocaleString('es-CL', { maximumFractionDigits: 1 });

// Por qué el modelo ajustó la sugerencia según el esfuerzo registrado (RPE).
const ADJUSTMENT_TEXT: Record<SuggestedLoadAdjustment, string> = {
  reserve_progression:
    'Sube un disco: completó todas las series con margen (RPE 8 o menos).',
  max_effort_hold:
    'No sube: la última sesión fue a esfuerzo máximo (RPE 9,5 o más).',
};

export function adjustmentText(adjustment: SuggestedLoadAdjustment) {
  return ADJUSTMENT_TEXT[adjustment] ?? null;
}

// "Rango probable: 52,5–57,5 kg"; null si el modelo no entregó rango o es un solo valor.
export function rangeText(suggestion: SuggestedLoad) {
  const range = suggestion.suggestedLoadRangeKg;
  if (!range || range[0] === range[1]) return null;
  return `Rango probable: ${kg(range[0])}–${kg(range[1])} kg`;
}
