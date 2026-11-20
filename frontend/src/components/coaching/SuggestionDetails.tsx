import type { SuggestedLoad } from '../../types/dashboard';
import { adjustmentText, rangeText } from '../../lib/suggestedLoad';

// Rango probable y ajustes por esfuerzo de una sugerencia del modelo. Lo
// comparten la portada del atleta y la tarjeta del Perfil Estadístico.
export function SuggestionDetails({
  suggestion,
}: {
  suggestion: SuggestedLoad;
}) {
  const range = rangeText(suggestion);
  const reasons = (suggestion.adjustments ?? [])
    .map(adjustmentText)
    .filter((text): text is string => Boolean(text));
  if (!range && !reasons.length) return null;
  return (
    <div className="suggestion-details">
      {range && <p className="suggestion-details__range">{range}</p>}
      {reasons.map((reason) => (
        <p key={reason} className="suggestion-details__reason">
          {reason}
        </p>
      ))}
    </div>
  );
}
