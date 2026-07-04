import en from "./en.json";

// Single English content source (no locale machinery).
export type Dict = typeof en;
export const t: Dict = en;
