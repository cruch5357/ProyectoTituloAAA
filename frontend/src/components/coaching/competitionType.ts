import type { CompetitionType } from '../../api/coaching';

export type CompetitionTypeKey = 'sports' | 'medical' | 'unclassified';

export function competitionTypeKey(
  type: CompetitionType | null,
): CompetitionTypeKey {
  if (type === 'SPORTS') return 'sports';
  if (type === 'MEDICAL') return 'medical';
  return 'unclassified';
}

export function competitionTypeLabel(type: CompetitionType | null): string {
  if (type === 'SPORTS') return 'Deportivo';
  if (type === 'MEDICAL') return 'Médico';
  return 'Sin clasificar';
}

export function competitionTypeClass(type: CompetitionType | null): string {
  return `competition-type--${competitionTypeKey(type)}`;
}
