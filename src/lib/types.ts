export type Status = "rascunho" | "revisao" | "pronto";

export interface Chapter {
  id: string;
  title: string;
  body: string;
  notes: string;
  status: Status;
}

export interface Book {
  id: string;
  title: string;
  cover: string | null;
  cur: number;
  updatedAt: number;
  chapters: Chapter[];
}

export interface Prefs {
  theme: "light" | "dark";
  goal: number;
  width: 0 | 1 | 2;
  font: 0 | 1 | 2;
}

export type View = "library" | "editor";
export type Panel = "palette" | "index" | "notes" | "help";
