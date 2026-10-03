import { fileURLToPath } from 'node:url';
import type { Locator, Page } from '@playwright/test';
import {
  applyForLoan,
  button,
  expect,
  nav,
  open,
  openBorrowerLoan,
  openConsole,
  openLenderLoan,
  switchRole,
  test,
} from './fixtures';

/**
 * The Wave 2 deck screenshots, made from the running console:
 *
 *   npm run shots   →   hackathon/wave2/deck/shots/0N-*.jpg
 *
 * 1440×900 at 2× device pixels, JPEG. Each shot is cropped to the part of the
 * screen the slide is about. Runs only in the `shots` project, never under
 * `npm run e2e`.
 */

const OUT = fileURLToPath(new URL('../../hackathon/wave2/deck/shots/', import.meta.url));
const QUALITY = 82;
const PAD = 16;

/** Wait for fonts and any entrance animation (the `.rise` class) to settle. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(700);
}

/** Viewport screenshot. */
async function shot(page: Page, name: string): Promise<void> {
  await settle(page);
  await page.screenshot({ path: OUT + name, type: 'jpeg', quality: QUALITY });
}

/**
 * Screenshot of the union of `parts`, padded, in page coordinates. Grows to
 * the full main-column width, so a crop never cuts a card in half sideways.
 */
async function crop(page: Page, name: string, parts: Locator[], opts: { fullWidth?: boolean } = {}): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await settle(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  const boxes = await Promise.all(parts.map((p) => p.boundingBox()));
  const ok = boxes.filter((b): b is NonNullable<typeof b> => b !== null);
  expect(ok.length, `${name}: every part is on screen`).toBe(parts.length);
  let x0 = Math.min(...ok.map((b) => b.x)) - PAD;
  let x1 = Math.max(...ok.map((b) => b.x + b.width)) + PAD;
  const y0 = Math.max(0, Math.min(...ok.map((b) => b.y)) + scrollY - PAD);
  const y1 = Math.max(...ok.map((b) => b.y + b.height)) + scrollY + PAD;
  if (opts.fullWidth) {
    const main = (await page.locator('main').boundingBox())!;
    x0 = main.x;
    x1 = main.x + main.width;
  }
  x0 = Math.max(0, x0);
  await page.screenshot({
    path: OUT + name,
    type: 'jpeg',
    quality: QUALITY,
    fullPage: true,
    clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 },
  });
}

test('deck screenshots @shots', async ({ page }) => {
  test.slow();

  // 01 · Landing.
  await open(page, '/');
  await shot(page, '01-landing.jpg');

  // 02 · Borrower Loans: the 110% / 150% hero, for the 10,000 the demo asks.
  await openConsole(page);
  await nav(page, 'Loans');
  await page.getByLabel('Interest, flat').fill('10');
  const loansHeader = page.locator('main header');
  const loansHero = page.locator('main section.card-dark').first();
  await expect(loansHero).toContainText('$11,000');
  await crop(page, '02-borrower-loans.jpg', [loansHeader, loansHero], { fullWidth: true });

  // 03 · Prove tier: apply, the lender quotes, then the borrower's step.
  const loan = await applyForLoan(page, { principal: '10,000', interest: '10', installments: '3' });
  await switchRole(page, 'lender');
  await openLenderLoan(page, loan);
  await button(page, 'Send quote').click();
  await expect(page.getByText('Net worth ≥ $500,000 · DTI ≤ 40%')).toBeVisible();
  await switchRole(page, 'borrower');
  await openBorrowerLoan(page, loan);
  const step = page.locator('main section.card-dark', { hasText: 'Your step · Prove tier' });
  await expect(step).toContainText('Your committed facts clear the bar');
  // The step and the terms card beside it.
  const terms = page.locator('main section.card', { hasText: 'Total owed' });
  await crop(page, '03-prove-tier.jpg', [page.locator('main header'), step, terms], { fullWidth: true });
  await button(step, 'Prove tier').click();
  await expect(page.getByText('On the ledger now:')).toBeVisible();

  // 04 · Lender desk at underwriting: VERIFIED, 11,000 at 110%.
  await switchRole(page, 'lender');
  await openLenderLoan(page, loan);
  const desk = page.locator('main section.card-dark', { hasText: 'Underwriting desk' });
  await expect(desk).toContainText('11,000110%');
  const visibility = page.locator('main section', { hasText: 'What you can see, and what you cannot' });
  await crop(page, '04-lender-underwrite.jpg', [page.locator('main header'), desk, visibility], {
    fullWidth: true,
  });

  // 05 · Ask for 150% anyway: the contract refuses.
  await button(desk, 'Ask for 150% anyway · 15,000').click();
  const refusal = desk.getByRole('alert');
  await expect(refusal).toContainText('collateral does not match the tier');
  const pitch = desk.locator('div', { has: page.getByText('3 · Underwrite') }).last();
  await crop(page, '05-refusal-150.jpg', [pitch]);

  // Underwrite, disburse, repay all three (one late), record.
  await button(desk, 'Underwrite at 110% · 11,000').click();
  await button(desk, 'Disburse').click();
  await switchRole(page, 'borrower');
  await openBorrowerLoan(page, loan);
  await button(page, '+31 days').click();
  await button(page, 'Repay $3,667').click();
  await expect(page.getByRole('heading', { name: 'Installment 2 of 3' })).toBeVisible();
  await button(page, 'Repay $3,667').click();
  await button(page, '+30 days').click();
  await button(page, 'Repay $3,666').click();
  await expect(page.getByRole('heading', { name: 'Repaid in full' })).toBeVisible();
  await switchRole(page, 'lender');
  await openLenderLoan(page, loan);
  await button(desk, 'Record repayment in the directory').click();
  await expect(desk).toContainText('Recorded in the directory');

  // 06 · The repaid loan: the private payment log beside the public record.
  await switchRole(page, 'borrower');
  await openBorrowerLoan(page, loan);
  const ledgersTitle = page.getByRole('heading', { name: 'Two ledgers for one loan' });
  const log = page.locator('main section', { has: page.getByRole('heading', { name: 'Payment log' }) });
  const ledgers = log.locator('xpath=..');
  await expect(log.getByText('Late', { exact: true })).toBeVisible();
  await crop(page, '06-repaid-history.jpg', [ledgersTitle, ledgers], { fullWidth: true });

  // 07 · Auditor: the disclosure verifies against the chain.
  await button(page, 'Open history to an auditor').click();
  const disclosure = (await page.locator('pre').textContent())!;
  await switchRole(page, 'auditor');
  await page.getByLabel('Disclosure JSON').fill(disclosure);
  await button(page, 'Verify against the chain').click();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  // Collapse the pasted JSON so the verdict and the replayed chain lead.
  await page.getByLabel('Disclosure JSON').evaluate((el) => {
    (el as HTMLTextAreaElement).scrollTop = 0;
  });
  await shot(page, '07-auditor.jpg');

  // 08 · Live chain.
  await nav(page, 'Live chain');
  await expect(page.getByRole('heading', { level: 1, name: 'Live chain' })).toBeVisible();
  await shot(page, '08-live.jpg');
});
