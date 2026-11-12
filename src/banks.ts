// The built-in question banks: every CSV under assets/questions/, bundled as text. The class client build
// (vite build --mode class) swaps this module for src/banks-none.ts, so a student's page carries no question
// and no answer: the classroom server deals the questions and judges the answers.

/** The bundled CSV text by file path. A missing file is simply absent, so a topic with no file has no questions. */
export const FILES: Record<string, string> = import.meta.glob('../assets/questions/**/*.csv', { query: '?raw', import: 'default', eager: true });
