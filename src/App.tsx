import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DemoTag, EmptyState, Field, Landing, NotFound, Notice, PageHead, Shell, downloadText, readFileText, uid, useFlash, usePersistentState, useRoute } from './shared/ui';
import { formatDay, todayISO } from './shared/dates';
import { QTYPE_LABEL, exportQuiz, grade, parseQuiz, questionStats, score, shuffled, validateQuestion, validateQuiz, weakest, type Answer, type Attempt, type QType, type Question, type Quiz } from './lib/quiz';

const KEY = 'quizforge:store';
const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/quizzes', label: 'Quizzes' },
  { to: '/stats', label: 'Results' },
];

interface Store { quizzes: Quiz[]; attempts: Attempt[] }

const mk = (type: QType, prompt: string, opts: string[], correct: number[], accepted: string[] = [], explanation = ''): Question =>
  ({ id: uid('q'), type, prompt, options: type === 'truefalse' ? ['True', 'False'] : opts, correct, accepted, explanation });
function demo(): Store {
  const t = todayISO();
  const capitals: Quiz = {
    id: 'demo-capitals', demo: true, updated: t, shuffle: true, fuzzy: true, title: 'World capitals', description: 'Eight questions mixing choices and typed answers.',
    questions: [
      mk('single', 'What is the capital of Australia?', ['Sydney', 'Canberra', 'Melbourne', 'Perth'], [1], [], 'Canberra was purpose-built as a compromise between Sydney and Melbourne.'),
      mk('text', 'What is the capital of Canada?', [], [], ['Ottawa'], 'Ottawa, in Ontario, has been the capital since 1857.'),
      mk('truefalse', 'Istanbul is the capital of Turkey.', [], [1], [], 'False — the capital is Ankara.'),
      mk('multi', 'Which of these cities are national capitals?', ['Nairobi', 'Lagos', 'Lima', 'Zurich'], [0, 2], [], 'Nairobi (Kenya) and Lima (Peru). Lagos and Zurich are large cities but not capitals.'),
      mk('single', 'Which country has Wellington as its capital?', ['New Zealand', 'Australia', 'South Africa', 'Ireland'], [0], [], ''),
      mk('text', 'What is the capital of Portugal?', [], [], ['Lisbon', 'Lisboa'], ''),
      mk('truefalse', 'Brasília has been Brazil’s capital since 1960.', [], [0], [], 'True — it replaced Rio de Janeiro.'),
      mk('single', 'What is the capital of Morocco?', ['Casablanca', 'Marrakesh', 'Rabat', 'Fez'], [2], [], 'Rabat, on the Atlantic coast.'),
    ],
  };
  const web: Quiz = {
    id: 'demo-web', demo: true, updated: t, shuffle: false, fuzzy: false, title: 'Web basics', description: 'HTML, CSS and HTTP fundamentals.',
    questions: [
      mk('single', 'Which HTML element should wrap a page’s primary content?', ['<section>', '<main>', '<div id="content">', '<article>'], [1], [], 'There should be one <main> per page; screen readers can jump straight to it.'),
      mk('multi', 'Which HTTP status codes mean success?', ['200', '201', '301', '404'], [0, 1], [], '2xx codes are success; 3xx redirect; 4xx are client errors.'),
      mk('truefalse', 'A CSS id selector is more specific than a class selector.', [], [0], [], ''),
      mk('text', 'Which HTML attribute gives an image its text alternative?', [], [], ['alt'], 'Use alt="" for purely decorative images.'),
      mk('single', 'Which HTTP method should not change data on the server?', ['POST', 'PUT', 'GET', 'DELETE'], [2], [], 'GET is meant to be safe and idempotent.'),
    ],
  };
  const answers = (z: Quiz, wrong: number[]) => z.questions.map((q, i) => ({ qid: q.id, correct: !wrong.includes(i) }));
  return {
    quizzes: [capitals, web],
    attempts: [
      { id: 'a1', quizId: capitals.id, date: `${t}T09:00`, answers: answers(capitals, [0, 3, 7]) },
      { id: 'a2', quizId: capitals.id, date: `${t}T18:00`, answers: answers(capitals, [3]) },
      { id: 'a3', quizId: web.id, date: `${t}T12:00`, answers: answers(web, [1, 2]) },
    ],
  };
}

export default function App() {
  const [route] = useRoute();
  const [store, setStore] = usePersistentState<Store>(KEY, demo);
  const ctx = { store, setStore };
  let page: ReactNode;
  const m = /^\/(edit|play)\/(.+)$/.exec(route);
  if (route === '/') page = <Home />;
  else if (route === '/quizzes') page = <Library {...ctx} />;
  else if (route === '/stats') page = <Stats {...ctx} />;
  else if (m) {
    const quiz = store.quizzes.find((z) => z.id === m[2]);
    page = !quiz ? <NotFound /> : m[1] === 'edit' ? <Editor key={quiz.id} quiz={quiz} {...ctx} /> : <Player key={quiz.id} quiz={quiz} {...ctx} />;
  } else page = <NotFound />;
  return (
    <Shell name="QuizForge" wordmark={['Quiz', 'Forge']} nav={NAV} route={route.startsWith('/edit') || route.startsWith('/play') ? '/quizzes' : route} cta={{ to: '/quizzes', label: 'My quizzes' }} footerNote="Quizzes and results are saved in this browser. Export a quiz to share it.">
      {page}
    </Shell>
  );
}

type Ctx = { store: Store; setStore: (s: Store | ((s: Store) => Store)) => void };
const go = (to: string) => { window.location.hash = to; };

/* ---------- Home ---------- */
function HeroPreview() {
  return (
    <div className="hero-qf">
      <p className="small mono muted">Question 4 of 8 · World capitals</p>
      <div className="qf-progress" aria-hidden="true"><i style={{ width: '50%' }} /></div>
      <p className="qf-prompt">Which of these cities are national capitals?</p>
      <p className="small muted">Select all that apply</p>
      <ul className="opts static">
        {[['Nairobi', 'right'], ['Lagos', ''], ['Lima', 'right'], ['Zurich', 'wrong']].map(([o, s]) => <li key={o} className={`opt ${s}`}><span className="box" aria-hidden="true">{s ? (s === 'right' ? '✓' : '✕') : ''}</span>{o}</li>)}
      </ul>
      <p className="explain small">Nairobi (Kenya) and Lima (Peru). Zurich is a large city but not a capital.</p>
    </div>
  );
}
function Home() {
  return (
    <Landing
      eyebrow="Quiz builder"
      title={<>Write it, take it, <em>remember it.</em></>}
      lead="Build quizzes with single-choice, select-all, true-or-false and typed-answer questions. Take them with instant feedback and explanations, then drill the questions you keep missing."
      primary={{ href: '#/quizzes', label: 'Open my quizzes' }}
      secondary={{ href: '#/play/demo-capitals', label: 'Try the demo quiz' }}
      previewLabel="Taking a quiz"
      preview={<HeroPreview />}
      steps={[
        { title: 'Write questions', body: 'Four question types, explanations, and validation that catches missing answers before you play.' },
        { title: 'Take the quiz', body: 'One question at a time, shuffled if you like, with feedback the moment you check.' },
        { title: 'Fix the gaps', body: 'Retry just the ones you missed, and see which questions trip you up over time.' },
      ]}
      features={[
        { title: 'Forgiving typed answers', body: 'Case, accents and punctuation don’t matter; optionally allow one typo.' },
        { title: 'Partial credit hints', body: 'Select-all questions tell you how many you found.' },
        { title: 'Keyboard friendly', body: 'Number keys pick options and Enter checks or moves on.' },
        { title: 'Share as JSON', body: 'Export a quiz and import it on another device or for a friend.' },
      ]}
      closing={{ title: <>Retrieval beats <em>re-reading.</em></>, action: { href: '#/quizzes', label: 'Build a quiz' } }}
    />
  );
}

/* ---------- Library ---------- */
function Library({ store, setStore }: Ctx) {
  const [flash, setFlash] = useFlash();
  function create() {
    const z: Quiz = { id: uid('z'), title: 'Untitled quiz', description: '', questions: [mk('single', '', ['', ''], [])], shuffle: true, fuzzy: false, updated: todayISO() };
    setStore((s) => ({ ...s, quizzes: [z, ...s.quizzes] }));
    go(`/edit/${z.id}`);
  }
  async function onImport(f?: File) {
    if (!f) return;
    if (f.size > 1024 * 1024) return setFlash({ kind: 'error', text: 'That file is over 1 MB.' });
    const { quiz, errors } = parseQuiz(await readFileText(f), () => uid('q'));
    if (!quiz) return setFlash({ kind: 'error', text: `Couldn’t import: ${errors.slice(0, 3).join(' ')}` });
    setStore((s) => ({ ...s, quizzes: [quiz, ...s.quizzes] }));
    setFlash({ kind: 'success', text: `Imported “${quiz.title}” with ${quiz.questions.length} questions.` });
  }
  const hasDemo = store.quizzes.some((z) => z.demo);
  return (
    <div className="stack">
      <PageHead eyebrow="Quizzes" title={<>Your <em>quizzes.</em></>} actions={<><button type="button" className="btn btn-primary" onClick={create}>New quiz</button><label className="btn file-btn">Import JSON<input type="file" accept="application/json,.json" className="sr-only" onChange={(e) => { onImport(e.target.files?.[0]); e.target.value = ''; }} /></label></>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {hasDemo && <div className="row-between"><p><DemoTag /> <span className="small muted">Two sample quizzes with some practice history.</span></p><button type="button" className="btn btn-sm btn-ghost" onClick={() => { const ids = store.quizzes.filter((z) => z.demo).map((z) => z.id); setStore({ quizzes: store.quizzes.filter((z) => !z.demo), attempts: store.attempts.filter((a) => !ids.includes(a.quizId)) }); }}>Clear demo quizzes</button></div>}
      {store.quizzes.length ? (
        <div className="quiz-grid">
          {store.quizzes.map((z) => {
            const errs = validateQuiz(z);
            const tries = store.attempts.filter((a) => a.quizId === z.id);
            const best = tries.reduce((m, a) => Math.max(m, score(a.answers).pct), 0);
            return (
              <article key={z.id} className="card stack quiz-card" aria-labelledby={`t-${z.id}`}>
                <h2 id={`t-${z.id}`} className="h3">{z.title}</h2>
                {z.description && <p className="small muted">{z.description}</p>}
                <p className="small mono">{z.questions.length} question{z.questions.length === 1 ? '' : 's'} · {tries.length ? `best ${best}%` : 'not taken yet'}</p>
                {errs.length > 0 && <p className="small warn-text">{errs.length} thing{errs.length === 1 ? '' : 's'} to fix before playing</p>}
                <div className="row-gap">
                  <button type="button" className="btn btn-primary btn-sm" disabled={errs.length > 0} onClick={() => go(`/play/${z.id}`)}>Play</button>
                  <button type="button" className="btn btn-sm" onClick={() => go(`/edit/${z.id}`)}>Edit</button>
                  <button type="button" className="btn btn-sm btn-ghost" disabled={errs.length > 0} onClick={() => downloadText(`${z.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'quiz'}.json`, exportQuiz(z), 'application/json')}>Export</button>
                </div>
              </article>
            );
          })}
        </div>
      ) : <EmptyState title="No quizzes yet" actions={<button type="button" className="btn btn-primary" onClick={create}>New quiz</button>}>Create one or import a QuizForge JSON file.</EmptyState>}
    </div>
  );
}

/* ---------- Editor ---------- */
function QuestionEditor({ q, n, total, onChange, onMove, onRemove, onDuplicate }: { q: Question; n: number; total: number; onChange: (q: Question) => void; onMove: (d: -1 | 1) => void; onRemove: () => void; onDuplicate: () => void }) {
  const errs = validateQuestion(q);
  const set = (p: Partial<Question>) => onChange({ ...q, ...p });
  function setType(type: QType) {
    if (type === 'truefalse') set({ type, options: ['True', 'False'], correct: q.correct.length === 1 && q.correct[0] < 2 ? q.correct : [0] });
    else if (type === 'text') set({ type, accepted: q.accepted.length ? q.accepted : q.correct.map((i) => q.options[i]).filter(Boolean) });
    else set({ type, options: q.type === 'truefalse' || q.type === 'text' ? (q.options.length >= 2 && q.type !== 'truefalse' ? q.options : ['', '']) : q.options, correct: type === 'single' ? q.correct.slice(0, 1) : q.correct });
  }
  const toggle = (i: number) => set({ correct: q.type === 'multi' ? (q.correct.includes(i) ? q.correct.filter((x) => x !== i) : [...q.correct, i]) : [i] });
  return (
    <section className={`card stack qedit ${errs.length ? 'has-errs' : ''}`} aria-labelledby={`qh-${q.id}`}>
      <div className="row-between">
        <h2 id={`qh-${q.id}`} className="h3">Question {n}</h2>
        <div className="row-gap">
          <button type="button" className="icon-btn" aria-label={`Move question ${n} up`} disabled={n === 1} onClick={() => onMove(-1)}>↑</button>
          <button type="button" className="icon-btn" aria-label={`Move question ${n} down`} disabled={n === total} onClick={() => onMove(1)}>↓</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onDuplicate}>Duplicate</button>
          <button type="button" className="btn btn-sm btn-ghost" aria-label={`Delete question ${n}`} onClick={onRemove}>Delete</button>
        </div>
      </div>
      <div className="form-grid two">
        <Field label="Type">{(p) => <select {...p} value={q.type} onChange={(e) => setType(e.target.value as QType)}>{(Object.keys(QTYPE_LABEL) as QType[]).map((t) => <option key={t} value={t}>{QTYPE_LABEL[t]}</option>)}</select>}</Field>
        <div />
      </div>
      <Field label="Question">{(p) => <textarea {...p} rows={2} value={q.prompt} onChange={(e) => set({ prompt: e.target.value })} />}</Field>
      {q.type === 'text' ? (
        <Field label="Accepted answers" hint="One per line. Case, accents and punctuation are ignored.">{(p) => <textarea {...p} rows={2} value={q.accepted.join('\n')} onChange={(e) => set({ accepted: e.target.value.split('\n') })} />}</Field>
      ) : (
        <fieldset className="opt-edit">
          <legend className="small">{q.type === 'multi' ? 'Options — tick every correct one' : 'Options — choose the correct one'}</legend>
          {q.options.map((o, i) => (
            <div key={i} className="opt-row">
              <input type={q.type === 'multi' ? 'checkbox' : 'radio'} name={`c-${q.id}`} checked={q.correct.includes(i)} onChange={() => toggle(i)} aria-label={`Option ${i + 1} is correct`} />
              {q.type === 'truefalse' ? <span>{o}</span> : <input value={o} aria-label={`Option ${i + 1}`} onChange={(e) => set({ options: q.options.map((x, j) => (j === i ? e.target.value : x)) })} />}
              {q.type !== 'truefalse' && <button type="button" className="icon-btn" aria-label={`Remove option ${i + 1}`} disabled={q.options.length <= 2} onClick={() => set({ options: q.options.filter((_, j) => j !== i), correct: q.correct.filter((c) => c !== i).map((c) => (c > i ? c - 1 : c)) })}>✕</button>}
            </div>
          ))}
          {q.type !== 'truefalse' && q.options.length < 8 && <div><button type="button" className="btn btn-sm" onClick={() => set({ options: [...q.options, ''] })}>Add option</button></div>}
        </fieldset>
      )}
      <Field label="Explanation (optional)" hint="Shown after answering.">{(p) => <textarea {...p} rows={2} value={q.explanation} onChange={(e) => set({ explanation: e.target.value })} />}</Field>
      {errs.length > 0 && <ul className="q-errs" aria-label={`Problems with question ${n}`}>{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
    </section>
  );
}

function Editor({ quiz, setStore }: { quiz: Quiz } & Ctx) {
  const update = (z: Quiz) => setStore((s) => ({ ...s, quizzes: s.quizzes.map((x) => (x.id === z.id ? { ...z, updated: todayISO(), demo: false } : x)) }));
  const errs = validateQuiz(quiz);
  const setQ = (i: number, q: Question) => update({ ...quiz, questions: quiz.questions.map((x, j) => (j === i ? q : x)) });
  function move(i: number, d: -1 | 1) { const qs = [...quiz.questions]; [qs[i], qs[i + d]] = [qs[i + d], qs[i]]; update({ ...quiz, questions: qs }); }
  return (
    <div className="stack">
      <PageHead eyebrow="Edit quiz" title={<>{quiz.title.trim() || 'Untitled quiz'}</>} description="Changes save as you type." actions={<><button type="button" className="btn btn-primary" disabled={errs.length > 0} onClick={() => go(`/play/${quiz.id}`)}>Play</button><button type="button" className="btn btn-ghost" onClick={() => { if (window.confirm(`Delete “${quiz.title}” and its results?`)) { setStore((s) => ({ quizzes: s.quizzes.filter((z) => z.id !== quiz.id), attempts: s.attempts.filter((a) => a.quizId !== quiz.id) })); go('/quizzes'); } }}>Delete quiz</button></>} />
      {errs.length ? <Notice kind="warn"><span data-testid="quiz-status">{errs.length} thing{errs.length === 1 ? '' : 's'} to fix before you can play.</span></Notice> : <Notice kind="success"><span data-testid="quiz-status">Ready to play — {quiz.questions.length} question{quiz.questions.length === 1 ? '' : 's'}.</span></Notice>}
      <section className="card stack" aria-labelledby="set-t">
        <h2 id="set-t" className="h3">Quiz settings</h2>
        <div className="form-grid two">
          <Field label="Title" error={quiz.title.trim() ? null : 'Give the quiz a title.'}>{(p) => <input {...p} value={quiz.title} maxLength={80} onChange={(e) => update({ ...quiz, title: e.target.value })} />}</Field>
          <Field label="Description">{(p) => <input {...p} value={quiz.description} maxLength={160} onChange={(e) => update({ ...quiz, description: e.target.value })} />}</Field>
        </div>
        <div className="row-gap">
          <label className="check"><input type="checkbox" checked={quiz.shuffle} onChange={(e) => update({ ...quiz, shuffle: e.target.checked })} /> Shuffle questions and options</label>
          <label className="check"><input type="checkbox" checked={quiz.fuzzy} onChange={(e) => update({ ...quiz, fuzzy: e.target.checked })} /> Allow one typo in typed answers</label>
        </div>
      </section>
      {quiz.questions.map((q, i) => (
        <QuestionEditor key={q.id} q={q} n={i + 1} total={quiz.questions.length} onChange={(nq) => setQ(i, nq)} onMove={(d) => move(i, d)}
          onRemove={() => update({ ...quiz, questions: quiz.questions.filter((x) => x.id !== q.id) })}
          onDuplicate={() => { const qs = [...quiz.questions]; qs.splice(i + 1, 0, { ...q, id: uid('q') }); update({ ...quiz, questions: qs }); }} />
      ))}
      <div className="row-gap">
        {(Object.keys(QTYPE_LABEL) as QType[]).map((t) => <button key={t} type="button" className="btn btn-sm" onClick={() => update({ ...quiz, questions: [...quiz.questions, mk(t, '', t === 'truefalse' ? [] : t === 'text' ? [] : ['', ''], t === 'truefalse' ? [0] : [])] })}>Add {QTYPE_LABEL[t].toLowerCase()}</button>)}
      </div>
    </div>
  );
}

/* ---------- Player ---------- */
interface Play { order: string[]; i: number; answers: { qid: string; given: Answer; correct: boolean; note?: string }[]; seed: number; checked: boolean }
function Player({ quiz, setStore }: { quiz: Quiz } & Ctx) {
  const start = (ids?: string[]): Play => { const seed = Math.floor(Math.random() * 1e9) + 1; const base = ids ?? quiz.questions.map((q) => q.id); return { order: quiz.shuffle ? shuffled(base, seed) : base, i: 0, answers: [], seed, checked: false }; };
  const [play, setPlay] = useState<Play>(() => start());
  const [pick, setPick] = useState<number[]>([]);
  const [text, setText] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => { const h = (e: KeyboardEvent) => keyRef.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);
  useEffect(() => { if (play.i > 0) heading.current?.focus(); }, [play.i, play.order]);
  const errs = validateQuiz(quiz);
  const done = play.i >= play.order.length;
  const q = !done ? quiz.questions.find((x) => x.id === play.order[play.i]) : undefined;
  const optOrder = useMemo(() => (q && quiz.shuffle && q.type !== 'truefalse' ? shuffled(q.options.map((_, i) => i), play.seed + play.i) : q?.options.map((_, i) => i) ?? []), [q, quiz.shuffle, play.seed, play.i]);
  if (errs.length) return <div className="stack"><PageHead eyebrow="Play" title={quiz.title} /><Notice kind="warn">This quiz has problems to fix first. <a href={`#/edit/${quiz.id}`}>Open the editor</a>.</Notice></div>;
  const current = play.answers[play.i];

  function check() {
    if (!q || play.checked) return;
    const given: Answer = q.type === 'text' ? text : pick;
    if (q.type === 'text' ? !text.trim() : !pick.length) return;
    const g = grade(q, given, quiz.fuzzy);
    const answers = [...play.answers, { qid: q.id, given, correct: g.correct, note: g.note }];
    setPlay({ ...play, answers, checked: true });
    if (answers.length === play.order.length && play.order.length === quiz.questions.length) setStore((s) => ({ ...s, attempts: [...s.attempts, { id: uid('a'), quizId: quiz.id, date: new Date().toISOString().slice(0, 16), answers: answers.map(({ qid, correct }) => ({ qid, correct })) }] }));
  }
  function next() { setPlay({ ...play, i: play.i + 1, checked: false }); setPick([]); setText(''); }
  keyRef.current = (e: KeyboardEvent) => {
    if (!q || e.metaKey || e.ctrlKey || e.altKey) return;
    const t = e.target as HTMLElement;
    const typing = t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text');
    if (e.key === 'Enter') {
      if (t.tagName === 'BUTTON' || t.tagName === 'A') return; // native activation
      e.preventDefault();
      if (play.checked) next(); else check();
      return;
    }
    if (typing || play.checked || q.type === 'text') return;
    const n = Number(e.key);
    if (n >= 1 && n <= optOrder.length) { e.preventDefault(); const idx = optOrder[n - 1]; setPick(q.type === 'multi' ? (pick.includes(idx) ? pick.filter((x) => x !== idx) : [...pick, idx]) : [idx]); }
  };

  if (done) {
    const s = score(play.answers.map(({ qid, correct }) => ({ qid, correct })));
    const missed = play.answers.filter((a) => !a.correct).map((a) => a.qid);
    const answerText = (qq: Question, a: Answer) => (qq.type === 'text' ? String(a) || '—' : (a as number[]).map((i) => qq.options[i]).join(', ') || '—');
    return (
      <div className="stack">
        <PageHead eyebrow={quiz.title} title={<>{s.right} of {s.total}. <em>{s.pct >= 80 ? 'Well done.' : s.pct >= 50 ? 'Good progress.' : 'Keep at it.'}</em></>} actions={<><button type="button" className="btn btn-primary" onClick={() => setPlay(start())}>Take it again</button>{missed.length > 0 && <button type="button" className="btn" onClick={() => setPlay(start(missed))}>Retry the {missed.length} missed</button>}</>} />
        {play.order.length < quiz.questions.length && <Notice kind="info">Practice round — only full attempts are saved to your results.</Notice>}
        <ol className="review">
          {play.answers.map((a, i) => { const qq = quiz.questions.find((x) => x.id === a.qid)!; return (
            <li key={i} className={`card stack ${a.correct ? 'ok' : 'miss'}`}>
              <p className="row-between"><strong>{qq.prompt}</strong><span className={`badge ${a.correct ? 'badge-ok' : 'badge-err'}`}>{a.correct ? 'Correct' : 'Missed'}</span></p>
              <p className="small">You answered: {answerText(qq, a.given)}{!a.correct && <> · Correct: {qq.type === 'text' ? qq.accepted.filter(Boolean)[0] : qq.correct.map((c) => qq.options[c]).join(', ')}</>}</p>
              {qq.explanation && <p className="small muted">{qq.explanation}</p>}
            </li>
          ); })}
        </ol>
      </div>
    );
  }

  const choiceState = (idx: number) => (!play.checked ? '' : q!.correct.includes(idx) ? 'right' : pick.includes(idx) ? 'wrong' : '');
  return (
    <div className="stack">
      <div className="row-between"><p className="eyebrow">{quiz.title}</p><button type="button" className="btn btn-sm btn-ghost" onClick={() => go('/quizzes')}>Quit</button></div>
      <p className="small mono muted">Question {play.i + 1} of {play.order.length}</p>
      <div className="qf-progress" role="progressbar" aria-label="Quiz progress" aria-valuemin={0} aria-valuemax={play.order.length} aria-valuenow={play.answers.length}><i style={{ width: `${(play.answers.length / play.order.length) * 100}%` }} /></div>
      <section className="card stack play-card" aria-labelledby="prompt">
        <h1 id="prompt" className="qf-prompt" data-testid="prompt" tabIndex={-1} ref={heading}>{q!.prompt}</h1>
        <p className="small muted">{QTYPE_LABEL[q!.type]}{q!.type !== 'text' && ' · number keys select'}</p>
        {q!.type === 'text' ? (
          <Field label="Your answer">{(p) => <input {...p} type="text" autoFocus autoComplete="off" value={text} disabled={play.checked} onChange={(e) => setText(e.target.value)} />}</Field>
        ) : (
          <fieldset className="opts-fs"><legend className="sr-only">Options</legend>
            <ul className="opts">
              {optOrder.map((idx, n) => (
                <li key={idx}>
                  <label className={`opt ${choiceState(idx)} ${pick.includes(idx) ? 'picked' : ''}`}>
                    <input type={q!.type === 'multi' ? 'checkbox' : 'radio'} name="opt" checked={pick.includes(idx)} disabled={play.checked} onChange={() => setPick(q!.type === 'multi' ? (pick.includes(idx) ? pick.filter((x) => x !== idx) : [...pick, idx]) : [idx])} />
                    <span className="key" aria-hidden="true">{n + 1}</span>{q!.options[idx]}
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <div aria-live="polite">
          {play.checked && current && (
            <div className="stack">
              <Notice kind={current.correct ? 'success' : 'error'}><span data-testid="feedback">{current.correct ? 'Correct!' : q!.type === 'text' ? `Not quite — the answer is “${q!.accepted.filter(Boolean)[0]}”.` : 'Not quite — the correct answer is highlighted.'}</span>{current.note && <> {current.note}</>}</Notice>
              {q!.explanation && <p className="explain">{q!.explanation}</p>}
            </div>
          )}
        </div>
        <div>{play.checked ? <button type="button" className="btn btn-primary" autoFocus onClick={next}>{play.i + 1 === play.order.length ? 'See results' : 'Next question'}</button> : <button type="button" className="btn btn-primary" disabled={q!.type === 'text' ? !text.trim() : !pick.length} onClick={check}>Check answer</button>}</div>
      </section>
    </div>
  );
}

/* ---------- Stats ---------- */
function Stats({ store }: Ctx) {
  const [qid, setQid] = useState(store.quizzes[0]?.id ?? '');
  const quiz = store.quizzes.find((z) => z.id === qid);
  if (!store.quizzes.length) return <div className="stack"><PageHead eyebrow="Results" title={<>How it’s <em>going.</em></>} /><EmptyState title="No quizzes yet">Create a quiz and take it to see results.</EmptyState></div>;
  const tries = quiz ? store.attempts.filter((a) => a.quizId === quiz.id).sort((a, b) => b.date.localeCompare(a.date)) : [];
  const stats = quiz ? questionStats(quiz, store.attempts) : [];
  const weak = weakest(stats);
  const best = tries.reduce((m, a) => Math.max(m, score(a.answers).pct), 0);
  return (
    <div className="stack">
      <PageHead eyebrow="Results" title={<>How it’s <em>going.</em></>} />
      <div className="card filters"><Field label="Quiz" className="grow">{(p) => <select {...p} value={qid} onChange={(e) => setQid(e.target.value)}>{store.quizzes.map((z) => <option key={z.id} value={z.id}>{z.title}</option>)}</select>}</Field></div>
      {quiz && (tries.length ? (
        <>
          <div className="stats">
            <div className="stat"><span className="stat-label">Attempts</span><span className="stat-value">{tries.length}</span></div>
            <div className="stat"><span className="stat-label">Best</span><span className="stat-value" data-testid="best">{best}%</span></div>
            <div className="stat"><span className="stat-label">Latest</span><span className="stat-value">{score(tries[0].answers).pct}%</span></div>
          </div>
          <div className="grid-2">
            <section className="card stack" aria-labelledby="wk-t">
              <h2 id="wk-t" className="h3">Questions to practise</h2>
              {weak.length ? <ul className="weak">{weak.map((w) => <li key={w.qid}><span>{quiz.questions.find((q) => q.id === w.qid)?.prompt}</span><span className="mono small">{w.right}/{w.seen} right</span></li>)}</ul> : <p className="small muted">Nothing missed yet.</p>}
              {weak.length > 0 && <div><a className="btn btn-sm" href={`#/play/${quiz.id}`}>Practise now</a></div>}
            </section>
            <div className="table-wrap card flush">
              <table className="table">
                <caption className="sr-only">Attempts for {quiz.title}</caption>
                <thead><tr><th scope="col">When</th><th scope="col" className="num">Score</th></tr></thead>
                <tbody>{tries.map((a) => { const s = score(a.answers); return <tr key={a.id}><th scope="row">{formatDay(a.date.slice(0, 10))} {a.date.slice(11, 16)}</th><td className="num">{s.right}/{s.total} · {s.pct}%</td></tr>; })}</tbody>
              </table>
            </div>
          </div>
        </>
      ) : <EmptyState title="Not taken yet" actions={<a className="btn btn-primary" href={`#/play/${quiz.id}`}>Take it now</a>}>Results appear after your first full attempt.</EmptyState>)}
    </div>
  );
}
