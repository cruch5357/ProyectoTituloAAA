const paths = {
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  home: 'm3 10 9-7 9 7v10H3V10m6 10v-7h6v7',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m18 0v-2a4 4 0 0 0-3-3.87M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m8-7a4 4 0 0 1 0 8',
  program: 'M4 4h16v16H4V4m4 4h8m-8 4h8m-8 4h5',
  exercise: 'm6 6 12 12M3 8l5-5M2 5l3-3m11 19 5-5m-2 6 3-3',
  calendar: 'M4 5h16v16H4V5m0 5h16M8 3v4m8-4v4',
  chart: 'M4 3v17h17M8 15l4-5 4 2 5-7',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  collapse: 'M4 4h16v16H4V4m5 0v16m7-12-4 4 4 4',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  empty: 'M4 7h16v14H4V7m3 0V3h10v4m-9 5h8m-8 4h5',
} as const;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  className = '',
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      className={`icon ${className}`}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
