import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

describe('QuizForge', () => {
  it('plays the web quiz in order with feedback and a summary', async () => {
    window.location.hash = '/play/demo-web';
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByTestId('prompt')).toHaveTextContent('primary content');
    await user.click(screen.getByLabelText(/<main>/));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByTestId('feedback')).toHaveTextContent('Correct!');
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    // Select-all with one of two right: partial note.
    await user.click(screen.getByLabelText(/^1?200$/));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    expect(screen.getByTestId('feedback').parentElement).toHaveTextContent('You found 1 of 2.');
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.keyboard('1');
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('feedback')).toHaveTextContent('Correct!');
    await user.keyboard('{Enter}');
    await user.type(screen.getByLabelText('Your answer'), 'ALT{Enter}');
    expect(screen.getByTestId('feedback')).toHaveTextContent('Correct!');
    await user.click(screen.getByRole('button', { name: 'Next question' }));
    await user.click(screen.getByLabelText(/POST/));
    await user.click(screen.getByRole('button', { name: 'Check answer' }));
    await user.click(screen.getByRole('button', { name: 'See results' }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('3 of 5.');
    await user.click(screen.getByRole('button', { name: 'Retry the 2 missed' }));
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
  });

  it('validates questions in the editor and blocks play until fixed', async () => {
    window.location.hash = '/quizzes';
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'New quiz' }));
    expect(await screen.findByTestId('quiz-status')).toHaveTextContent('to fix before you can play');
    expect(screen.getByRole('list', { name: 'Problems with question 1' })).toHaveTextContent('Write the question.');
    expect(screen.getByRole('button', { name: 'Play' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Question'), { target: { value: 'Largest ocean?' } });
    fireEvent.change(screen.getByLabelText('Option 1'), { target: { value: 'Pacific' } });
    fireEvent.change(screen.getByLabelText('Option 2'), { target: { value: 'Atlantic' } });
    await user.click(screen.getByLabelText('Option 1 is correct'));
    expect(screen.getByTestId('quiz-status')).toHaveTextContent('Ready to play — 1 question.');
    await user.click(screen.getByRole('button', { name: 'Add typed answer' }));
    expect(screen.getByTestId('quiz-status')).toHaveTextContent('2 things to fix');
    await user.click(screen.getByRole('button', { name: 'Delete question 2' }));
    await user.click(screen.getByRole('button', { name: 'Play' }));
    expect(await screen.findByTestId('prompt')).toHaveTextContent('Largest ocean?');
  });

  it('imports a quiz and rejects bad files', async () => {
    window.location.hash = '/quizzes';
    const user = userEvent.setup();
    render(<App />);
    const input = screen.getByLabelText('Import JSON');
    await user.upload(input, new File(['nope'], 'bad.json', { type: 'application/json' }));
    expect(await screen.findByText(/valid JSON/)).toBeInTheDocument();
    const good = JSON.stringify({ title: 'Rivers', questions: [{ type: 'text', prompt: 'Longest river in the UK?', accepted: ['Severn'] }] });
    await user.upload(input, new File([good], 'rivers.json', { type: 'application/json' }));
    expect(await screen.findByText('Imported “Rivers” with 1 questions.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Rivers' })).toBeInTheDocument();
  });

  it('shows results and weak questions', () => {
    window.location.hash = '/stats';
    render(<App />);
    expect(screen.getByTestId('best')).toHaveTextContent('88%');
    const weak = screen.getByRole('heading', { name: 'Questions to practise' }).parentElement!;
    expect(within(weak).getByText('Which of these cities are national capitals?')).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});
