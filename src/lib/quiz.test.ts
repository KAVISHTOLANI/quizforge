import { describe, expect, it } from 'vitest';
import { exportQuiz, grade, normalize, parseQuiz, questionStats, score, shuffled, validateQuestion, validateQuiz, weakest, type Question, type Quiz } from './quiz';

const q = (p: Partial<Question>): Question => ({ id: 'q', type: 'single', prompt: 'P?', options: ['A', 'B', 'C'], correct: [1], accepted: [], explanation: '', ...p });

describe('validation', () => {
  it('checks each question type', () => {
    expect(validateQuestion(q({}))).toEqual([]);
    expect(validateQuestion(q({ prompt: ' ' }))).toContain('Write the question.');
    expect(validateQuestion(q({ options: ['A', ''] }))).toEqual(expect.arrayContaining(['Add at least two options.', 'Fill in or remove empty options.']));
    expect(validateQuestion(q({ options: ['Yes', 'yes'] }))).toContain('Options must be different from each other.');
    expect(validateQuestion(q({ correct: [0, 1] }))).toContain('Mark the correct option.');
    expect(validateQuestion(q({ type: 'multi', correct: [] }))).toContain('Mark at least one correct option.');
    expect(validateQuestion(q({ type: 'text', accepted: [''] }))).toContain('Add at least one accepted answer.');
    expect(validateQuiz({ id: 'z', title: '', description: '', questions: [q({ prompt: '' })], shuffle: true, fuzzy: false, updated: '' })).toEqual(['Give the quiz a title.', 'Question 1: Write the question.']);
  });
});

describe('grading', () => {
  it('grades choices exactly, with partial notes for select-all', () => {
    expect(grade(q({}), [1]).correct).toBe(true);
    expect(grade(q({}), [0]).correct).toBe(false);
    const m = q({ type: 'multi', correct: [0, 2] });
    expect(grade(m, [2, 0]).correct).toBe(true);
    expect(grade(m, [0])).toEqual({ correct: false, note: 'You found 1 of 2.' });
    expect(grade(m, [0, 1]).note).toBeUndefined();
  });
  it('normalises typed answers and allows one typo when fuzzy', () => {
    const t = q({ type: 'text', accepted: ['São Paulo', 'Sao Paulo'] });
    expect(normalize('  SÃO-paulo! ')).toBe('sao paulo');
    expect(grade(t, 'sao paulo').correct).toBe(true);
    expect(grade(t, 'sao paolo').correct).toBe(false);
    expect(grade(t, 'sao paolo', true)).toMatchObject({ correct: true });
    expect(grade(q({ type: 'text', accepted: ['Oslo'] }), 'Olso', true).correct).toBe(false);
    expect(grade(t, '').correct).toBe(false);
  });
});

describe('stats and order', () => {
  it('shuffles deterministically without losing items', () => {
    const a = shuffled([1, 2, 3, 4, 5], 42);
    expect(shuffled([1, 2, 3, 4, 5], 42)).toEqual(a);
    expect([...a].sort()).toEqual([1, 2, 3, 4, 5]);
  });
  it('scores and finds weak questions', () => {
    const quiz: Quiz = { id: 'z', title: 'T', description: '', shuffle: false, fuzzy: false, updated: '', questions: [q({ id: 'a' }), q({ id: 'b' }), q({ id: 'c' })] };
    const attempts = [
      { id: '1', quizId: 'z', date: '2026-01-01', answers: [{ qid: 'a', correct: true }, { qid: 'b', correct: false }, { qid: 'c', correct: false }] },
      { id: '2', quizId: 'z', date: '2026-01-02', answers: [{ qid: 'a', correct: true }, { qid: 'b', correct: false }, { qid: 'c', correct: true }] },
    ];
    expect(score(attempts[0].answers)).toEqual({ right: 1, total: 3, pct: 33 });
    const stats = questionStats(quiz, attempts);
    expect(stats.map((s) => s.rate)).toEqual([100, 0, 50]);
    expect(stats[1].lastWrong).toBe(true);
    expect(weakest(stats).map((s) => s.qid)).toEqual(['b', 'c']);
  });
});

describe('import and export', () => {
  it('round-trips and validates', () => {
    let n = 0;
    const id = () => `id${++n}`;
    const quiz: Quiz = { id: 'z', title: 'Capitals', description: 'd', shuffle: true, fuzzy: true, updated: '', questions: [q({ type: 'truefalse', options: ['True', 'False'], correct: [0] })] };
    const back = parseQuiz(exportQuiz(quiz), id);
    expect(back.errors).toEqual([]);
    expect(back.quiz!.questions[0]).toMatchObject({ type: 'truefalse', correct: [0] });
    expect(parseQuiz('{', id).errors[0]).toMatch(/valid JSON/);
    expect(parseQuiz('{"title":"x","questions":[{"type":"essay","prompt":"?"}]}', id).errors[0]).toMatch(/Question 1/);
    expect(parseQuiz('{"title":"x","questions":[{"type":"single","prompt":"?","options":["a","b"],"correct":[]}]}', id).errors).toEqual(['Question 1: Mark the correct option.']);
  });
});
