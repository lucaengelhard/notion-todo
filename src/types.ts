export interface ToDo {
  filename: string | undefined;
  path: string;
  toDo: string;
  status?: string;
  lines?: number | { start: number; end: number };
}
