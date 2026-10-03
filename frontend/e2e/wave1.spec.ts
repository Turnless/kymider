import type { Page } from '@playwright/test';
import { button, expect, nav, openConsole, switchRole, test } from './fixtures';

/**
 * The Wave 1 flow still works beside the loans: the borrower commits facts,
 * a lender's claim is answered with a proof, and the lender approves on the
 * verdict alone.
 */

/** The borrower's SolvencyProof instance as the Overview prints it: 0x1234…abcd. */
async function myInstance(page: Page): Promise<RegExp> {
  const text = (await page.locator('h1 + span.mono').textContent())!.trim();
  const m = /^0x([0-9a-f]{4})…([0-9a-f]{4})$/.exec(text);
  expect(m, `instance label "${text}"`).not.toBeNull();
  // The directory prints two more leading digits: 0x123456…abcd.
  return new RegExp(`^0x${m![1]}[0-9a-f]{2}…${m![2]}$`);
}

/** Lender → Solvency claims → the borrower's instance. */
async function openInstance(page: Page, instance: RegExp): Promise<void> {
  await nav(page, 'Solvency claims');
  await expect(page.getByRole('heading', { level: 1, name: 'Directory' })).toBeVisible();
  await page.locator('main').getByText(instance).filter({ visible: true }).click();
  await expect(page).toHaveURL(/\/app\/instance\/[0-9a-f]+$/);
}

test('facts → claim → prove → approve', async ({ page }) => {
  await openConsole(page);
  const instance = await myInstance(page);

  // Facts: 1,000,000 cash less 300,000 debts is 700,000 net worth, short of
  // Harbor Bank's 750,000 bar. Commit 1,200,000 cash instead: 900,000.
  await nav(page, 'Private facts');
  const cash = page.getByRole('textbox').first();
  await expect(cash).toHaveValue('1,000,000');
  await cash.fill('1,200,000');
  await expect(page.getByText('$900,000', { exact: true })).toBeVisible();
  await expect(page.getByText('30.0%', { exact: true })).toBeVisible();
  await button(page, 'Commit facts').click();
  await expect(page.getByText('Matches the committed statement')).toBeVisible();

  // Claim: Harbor Bank's request is waiting on the borrower.
  await nav(page, 'Claims');
  const pending = page.locator('section.card-dark', { hasText: 'Awaiting your proof' });
  await expect(pending).toContainText('Harbor Bank');
  await expect(pending).toContainText('Net worth ≥ $750,000 · DTI ≤ 35%');

  // Prove.
  await button(pending, 'Generate proof').click();
  await expect(pending).toHaveCount(0);
  const harborRow = page.getByRole('row', { name: /Harbor Bank/ });
  await expect(harborRow).toContainText('Pass');

  // Approve, as Harbor Bank, on the verdict alone.
  await switchRole(page, 'lender');
  await openInstance(page, instance);
  const desk = page.locator('section.card-dark', { hasText: 'Underwriting' });
  await expect(desk.getByText('Pass', { exact: true })).toBeVisible();
  await expect(desk).toContainText('Net worth ≥ $750,000 · DTI ≤ 35%');
  await expect(desk.getByText('not disclosed')).toHaveCount(3);
  await button(desk, 'Approve application').click();
  await expect(desk).toContainText('Application approved');

  // A second round on new terms. In the simulation the borrower's answer to
  // a lender's request is proved as part of the request, so the verdict is
  // on the desk straight away; the borrower's Claims screen shows the same.
  await button(desk, 'Underwrite again').click();
  await desk.getByRole('textbox').first().fill('850,000');
  await desk.getByRole('textbox').nth(1).fill('32');
  await button(desk, 'Request claim').click();
  await expect(desk).toContainText('Step 3 of 3');

  await switchRole(page, 'borrower');
  await nav(page, 'Claims');
  const harbor = page.getByRole('row', { name: /Harbor Bank/ });
  await expect(harbor).toContainText('Net worth ≥ $850,000 · DTI ≤ 32%');
  await expect(harbor).toContainText('Pass');

  await switchRole(page, 'lender');
  await openInstance(page, instance);
  await expect(desk).toContainText('Net worth ≥ $850,000 · DTI ≤ 32%');
  await expect(desk.getByText('Pass', { exact: true })).toBeVisible();
  await button(desk, 'Approve application').click();
  await expect(desk).toContainText('Application approved');
});

test('a claim the facts do not clear is answered Fail, and the lender can decline', async ({ page }) => {
  await openConsole(page);
  const instance = await myInstance(page);

  // Committed facts (700,000 net worth) fall short of Harbor Bank's 750,000.
  await nav(page, 'Claims');
  const pending = page.locator('section.card-dark', { hasText: 'Awaiting your proof' });
  await button(pending, 'Generate proof').click();
  await expect(page.getByRole('row', { name: /Harbor Bank/ })).toContainText('Fail');

  await switchRole(page, 'lender');
  await openInstance(page, instance);
  const desk = page.locator('section.card-dark', { hasText: 'Underwriting' });
  await expect(desk.getByText('Fail', { exact: true })).toBeVisible();
  await button(desk, 'Decline').click();
  await expect(desk).toContainText('Application declined');
});
