/* Quiz model, validation, grading and statistics for QuizForge. */

export type QType = 'single' | 'multi' | 'truefalse' | 'text';
export const QTYPE_LABEL: Record<QType, string> = { single: 'Single choice', multi: 'Select all that apply', truefalse: 'True or false', text: 'Typed answer' };
export interface Question {
  id: string;
  type: QType;
  prompt: string;
  options: string[];        // choice types; ['True','False'] for truefalse
  correct: number[];        // indexes into options
  accepted: string[];       // text answers
  explanation: string;
}
export interface Quiz { id: string; title: string; description: string; questions: Question[]; shuffle: boolean; fuzzy: boolean; demo?: boolean; updated: string }
export type Answer = number[] | string;
export interface Attempt { id: string; quizId: string; date: string; answers: { qid: string; correct: boolean }[] }

export function validateQuestion(q: Question): string[] {
  const e: string[] = [];
  if (!q.prompt.trim()) e.push('Write the question.');
  if (q.type === 'text') {
    if (!q.accepted.some((a) => a.trim())) e.push('Add at least one accepted answer.');
  } else {
    const opts = q.options.map((o) => o.trim());
    if (q.type !== 'truefalse') {
      if (opts.filter(Boolean).length < 2) e.push('Add at least two options.');
      if (opts.some((o) => !o)) e.push('Fill in or remove empty options.');
      const lower = opts.filter(Boolean).map((o) => o.toLowerCase());
      if (new Set(lower).size !== lower.length) e.push('Options must be different from each other.');
    }
    if (q.type === 'multi' ? q.correct.length < 1 : q.correct.length !== 1) e.push(q.type === 'multi' ? 'Mark at least one correct option.' : 'Mark the correct option.');
    if (q.correct.some((i) => i < 0 || i >= q.options.length)) e.push('A correct answer points to a missing option.');
  }
  return e;
}
export function validateQuiz(z: Quiz): string[] {
  const e: string[] = [];
  if (!z.title.trim()) e.push('Give the quiz a title.');
  if (!z.questions.length) e.push('Add at least one question.');
  z.questions.forEach((q, i) => validateQuestion(q).forEach((m) => e.push(`Question ${i + 1}: ${m}`)));
  return e;
}

export const normalize = (s: string) => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export interface Grade { correct: boolean; note?: string }
/** Typed answers ignore case, accents and punctuation; with fuzzy on, one typo is allowed in answers of 5+ letters. */
export function grade(q: Question, a: Answer, fuzzy = false): Grade {
  if (q.type === 'text') {
    const given = normalize(typeof a === 'string' ? a : '');
    if (!given) return { correct: false };
    for (const acc of q.accepted.map(normalize).filter(Boolean)) {
      if (acc === given) return { correct: true };
      if (fuzzy && acc.length >= 5 && distance(acc, given) <= 1) return { correct: true, note: `Accepted — check the spelling: “${q.accepted.find((x) => normalize(x) === acc)}”.` };
    }
    return { correct: false };
  }
  const picked = [...new Set(Array.isArray(a) ? a : [])].sort();
  const want = [...q.correct].sort();
  const correct = picked.length === want.length && picked.every((v, i) => v === want[i]);
  if (!correct && q.type === 'multi') {
    const hits = picked.filter((p) => want.includes(p)).length;
    if (hits && hits === picked.length) return { correct: false, note: `You found ${hits} of ${want.length}.` };
  }
  return { correct };
}

/** Deterministic shuffle so a quiz attempt is stable across re-renders. */
export function shuffled<T>(xs: T[], seed: number): T[] {
  const a = [...xs];
  let s = seed || 1;
  for (let i = a.length - 1; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export function score(answers: Attempt['answers']) {
  const right = answers.filter((a) => a.correct).length;
  return { right, total: answers.length, pct: answers.length ? Math.round((right / answers.length) * 100) : 0 };
}

export interface QStat { qid: string; seen: number; right: number; rate: number; lastWrong: boolean }
export function questionStats(quiz: Quiz, attempts: Attempt[]): QStat[] {
  return quiz.questions.map((q) => {
    const hist = attempts.filter((a) => a.quizId === quiz.id).flatMap((a) => a.answers.filter((x) => x.qid === q.id).map((x) => ({ date: a.date, correct: x.correct })));
    const right = hist.filter((h) => h.correct).length;
    const last = [...hist].sort((a, b) => a.date.localeCompare(b.date)).pop();
    return { qid: q.id, seen: hist.length, right, rate: hist.length ? Math.round((right / hist.length) * 100) : 0, lastWrong: !!last && !last.correct };
  });
}
/** Questions answered wrongly most often (and at least once). */
export const weakest = (stats: QStat[], n = 5) => stats.filter((s) => s.seen && s.right < s.seen).sort((a, b) => a.rate - b.rate || b.seen - a.seen).slice(0, n);

/* ---------- Import / export ---------- */
export function parseQuiz(text: string, newId: () => string): { quiz?: Quiz; errors: string[] } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { errors: ['That file isn’t valid JSON.'] }; }
  const r = raw as Partial<Quiz>;
  if (!r || typeof r !== 'object' || typeof r.title !== 'string' || !Array.isArray(r.questions)) return { errors: ['Expected a QuizForge export with a title and questions.'] };
  const types: QType[] = ['single', 'multi', 'truefalse', 'text'];
  const questions: Question[] = [];
  for (const [i, q] of (r.questions as Partial<Question>[]).entries()) {
    if (!q || !types.includes(q.type as QType) || typeof q.prompt !== 'string') return { errors: [`Question ${i + 1} is missing a type or prompt.`] };
    questions.push({
      id: newId(), type: q.type as QType, prompt: q.prompt,
      options: q.type === 'truefalse' ? ['True', 'False'] : Array.isArray(q.options) ? q.options.map(String) : [],
      correct: Array.isArray(q.correct) ? q.correct.filter((n) => Number.isInteger(n)) : [],
      accepted: Array.isArray(q.accepted) ? q.accepted.map(String) : [],
      explanation: typeof q.explanation === 'string' ? q.explanation : '',
    });
  }
  const quiz: Quiz = { id: newId(), title: r.title, description: typeof r.description === 'string' ? r.description : '', questions, shuffle: r.shuffle !== false, fuzzy: !!r.fuzzy, updated: new Date().toISOString().slice(0, 10) };
  const errors = validateQuiz(quiz);
  return errors.length ? { errors } : { quiz, errors: [] };
}
export function exportQuiz(z: Quiz): string {
  return JSON.stringify({ format: 'quizforge/1', title: z.title, description: z.description, shuffle: z.shuffle, fuzzy: z.fuzzy, questions: z.questions.map(({ id: _id, ...q }) => q) }, null, 2);
}
