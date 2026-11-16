import type { CompetitionType } from '../../api/coaching';
import { competitionTypeClass, competitionTypeLabel } from './competitionType';

export function CompetitionTypeBadge({
  type,
}: {
  type: CompetitionType | null;
}) {
  return (
    <span className={`competition-type-badge ${competitionTypeClass(type)}`}>
      <span aria-hidden="true">◆</span>
      {competitionTypeLabel(type)}
    </span>
  );
}
