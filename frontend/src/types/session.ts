export interface Session {
  id: string;
  weekId: string;
  name: string;
  dayOfWeek: number | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}
