import { expect, test } from '@playwright/test';
import { checkMobile, snap } from './helpers';

test('build a quiz, play it, review results', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('remember it');
  await page.waitForTimeout(1000);
  await snap(page, 'landing');
  await checkMobile(page, 'landing-mobile');

  await page.getByRole('link', { name: 'Open my quizzes' }).click();
  await page.getByRole('button', { name: 'New quiz' }).click();
  await page.getByLabel('Title', { exact: true }).fill('Planets');
  await page.getByLabel('Question', { exact: true }).fill('Which planet is largest?');
  await page.getByLabel('Option 1', { exact: true }).fill('Jupiter');
  await page.getByLabel('Option 2', { exact: true }).fill('Saturn');
  await page.getByLabel('Option 1 is correct').check();
  await page.getByRole('button', { name: 'Add typed answer' }).click();
  await page.getByLabel('Question', { exact: true }).nth(1).fill('Which planet is closest to the Sun?');
  await page.getByLabel('Accepted answers').fill('Mercury');
  await page.getByLabel('Explanation (optional)').nth(1).fill('Mercury orbits at about 58 million km.');
  await expect(page.getByTestId('quiz-status')).toContainText('Ready to play — 2 questions.');
  await snap(page, 'editor');
  await checkMobile(page, 'editor-mobile');
  await page.reload();
  await expect(page.getByLabel('Title', { exact: true })).toHaveValue('Planets');

  await page.getByRole('button', { name: 'Play' }).click();
  for (let i = 0; i < 2; i++) {
    const prompt = await page.getByTestId('prompt').textContent();
    if (prompt?.includes('largest')) { await page.getByLabel(/Jupiter/).check(); await page.keyboard.press('Enter'); }
    else { await page.getByLabel('Your answer').fill('mercury'); await page.keyboard.press('Enter'); }
    await expect(page.getByTestId('feedback')).toHaveText('Correct!');
    if (i === 0) { await snap(page, 'play'); await checkMobile(page); }
    await page.getByRole('button', { name: /Next question|See results/ }).click();
  }
  await expect(page.getByRole('heading', { level: 1 })).toContainText('2 of 2.');

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Results' }).click();
  await page.getByLabel('Quiz', { exact: true }).selectOption({ label: 'Planets' });
  await expect(page.getByTestId('best')).toHaveText('100%');
  await page.getByLabel('Quiz', { exact: true }).selectOption({ label: 'World capitals' });
  await snap(page, 'results');
});
