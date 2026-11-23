export interface SectionBuilder<T> {
  heading: string | null;
  items: T[];
  firstItemLineNumber: number | null;
}
