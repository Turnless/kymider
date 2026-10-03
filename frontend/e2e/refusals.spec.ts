import {
  addressFromUrl,
  applyForLoan,
  button,
  expect,
  grouped,
  nav,
  open,
  openBorrowerLoan,
  routeTo,
  short,
  switchRole,
  test,
} from './fixtures';

/**
 * Refusals as features: what the contract will not do, shown on screen in the
 * contract's own words.
 */

test.describe('default before and after the grace period', () => {
  test('a default called early is refused; after +grace it is accepted', async ({ page }) => {
    // The seeded book: a 1,200,000 loan at 110%, two of six installments
    // paid, the next due in 4 days.
    await open(page, '/app/applications');
    await page.getByRole('button', { name: /^All/ }).click();
    await page.locator('main').getByText('1,200,000', { exact: true }).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(/\/app\/loan\/[0-9a-f]+$/);

    const desk = page.locator('section.card-dark', { hasText: 'Underwriting desk' });
    await expect(desk).toContainText('4 · Repaying');
    await expect(desk).toContainText('Default window');
    await expect(desk).toContainText('Calling it earlier is refused by the contract.');

    // Before the grace period ends: the button is offered, and refused.
    await button(desk, 'Mark default (before grace ends)').click();
    await expect(desk.getByRole('alert')).toContainText(
      'The contract refused: installment is not past its grace period',
    );
    await expect(desk.getByRole('alert')).toContainText('Nothing was written to the ledger.');
    await expect(desk).toContainText('4 · Repaying');

    // Due in 4 days, plus 3 days of grace: one week and an hour on, the
    // window is open (the contract wants strictly past grace).
    await button(page, '+7 d').click();
    await button(page, '+1 h').click();
    await expect(desk).toContainText('Past grace: default can be called');
    await button(desk, 'Mark default').click();
    await expect(desk).toContainText('5 · Defaulted');
    await expect(desk).toContainText('The contract accepted the default because an installment was more than 3 days past due by block time.');
    await expect(desk).toContainText(`${grouped(1_320_000n)} collateral held`);
  });

  test('the same refusal on a loan disbursed in this session, then accepted after +grace', async ({ page }) => {
    await open(page, '/app/overview');
    const loan = await applyForLoan(page, { principal: '5,000', interest: '10', installments: '2' });

    await switchRole(page, 'lender');
    await page.getByRole('button', { name: /^All/ }).click();
    await page.locator('main').getByText(new RegExp(`^${short(loan, 8)}`)).filter({ visible: true }).first().click();
    const desk = page.locator('section.card-dark', { hasText: 'Underwriting desk' });
    // No quote, no tier: the only figure on offer is 150%.
    await button(desk, `Underwrite at 150% · ${grouped(7_500)}`).click();
    await button(desk, 'Disburse').click();
    await expect(desk).toContainText('Disbursed. The first installment clock is running.');

    // Thirty days on, the installment is due today: still inside grace.
    await button(page, '+30 d').click();
    await button(desk, 'Mark default (before grace ends)').click();
    await expect(desk.getByRole('alert')).toContainText('installment is not past its grace period');

    // Three days of grace and a bit: refused no longer.
    await button(page, '+1 d').click();
    await button(page, '+1 d').click();
    await button(page, '+1 d').click();
    await button(page, '+1 h').click();
    await expect(desk).toContainText('Past grace: default can be called');
    await button(desk, 'Mark default').click();
    await expect(desk).toContainText('5 · Defaulted');
    await expect(desk).toContainText(`${grouped(5_500)} unpaid · ${grouped(7_500)} collateral held · 0 payments made`);

    // The borrower sees the same outcome.
    await switchRole(page, 'borrower');
    await openBorrowerLoan(page, loan);
    await expect(page.getByRole('heading', { name: 'Defaulted' })).toBeVisible();
  });
});

test.describe('wrong-party actions', () => {
  test('the borrower is offered no lender action, and the lender desk no repayment', async ({ page }) => {
    await open(page, '/app/overview');
    const loan = await applyForLoan(page, { principal: '10,000', interest: '10', installments: '3' });
    for (const name of [/^Send quote/, /^Underwrite/, /^Disburse/, /^Mark default/, /^Decline/, /^Record repayment/]) {
      await expect(button(page, name)).toHaveCount(0);
    }

    await switchRole(page, 'lender');
    await page.getByRole('button', { name: /^All/ }).click();
    await page.locator('main').getByText(new RegExp(`^${short(loan, 8)}`)).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/app/loan/${loan}$`));
    for (const name of [/^Prove tier/, /^Repay/, /^Prove two repaid loans/, /^Open history to an auditor/]) {
      await expect(button(page, name)).toHaveCount(0);
    }
  });

  test("another lender's loan is not listed for Harbor Bank, and the contract refuses Harbor's quote on it", async ({
    page,
  }) => {
    await open(page, '/app/overview');
    const loan = await applyForLoan(page, {
      lender: 'Atlas Lending · On-chain protocol',
      principal: '10,000',
      interest: '10',
      installments: '3',
    });
    await expect(page.getByText('$10,000 from Atlas Lending')).toBeVisible();

    // Not offered: the lender console (Harbor Bank) does not list it.
    await switchRole(page, 'lender');
    await page.getByRole('button', { name: /^All/ }).click();
    await expect(page.locator('main').getByText(new RegExp(`^${short(loan, 8)}`))).toHaveCount(0);

    // Reached anyway, by address: the desk offers a quote and the contract refuses it.
    await routeTo(page, `/app/loan/${loan}`);
    const desk = page.locator('section.card-dark', { hasText: 'Underwriting desk' });
    await button(desk, 'Send quote').click();
    await expect(desk.getByRole('alert')).toContainText('The contract refused: only the lender may quote');
    await button(desk, /^Underwrite at 150%/).click();
    await expect(desk.getByRole('alert')).toContainText('only the lender may underwrite');
  });

  test("the contract refuses this browser's proof on another borrower's loan", async ({ page }) => {
    // A seeded application to Harbor Bank from another borrower, quoted and proven.
    await open(page, '/app/applications');
    await page.locator('main').getByText('500,000', { exact: true }).filter({ visible: true }).first().click();
    await expect(page.locator('section.card-dark', { hasText: 'Underwriting desk' })).toContainText('Verified');
    const theirs = addressFromUrl(page);

    // Not offered: the borrower's own list does not have it.
    await switchRole(page, 'borrower');
    await nav(page, 'Loans');
    await expect(page.locator('main').getByText(short(theirs, 6), { exact: true })).toHaveCount(0);

    // Reached anyway: the proof goes out under this browser's key and is refused.
    await routeTo(page, `/app/loans/${theirs}`);
    await button(page, /^Prove (tier|again)/).click();
    await expect(page.getByText('The contract refused')).toBeVisible();
    await expect(page.getByText('“only the borrower may prove a tier”')).toBeVisible();
  });

  test('before disbursement the borrower is offered nothing to repay or disclose', async ({ page }) => {
    await open(page, '/app/overview');
    await applyForLoan(page, { principal: '1,000', interest: '10', installments: '3' });
    // Applied, not disbursed: no repayment is offered.
    await expect(button(page, /^Repay/)).toHaveCount(0);
    await expect(page.getByText('Nothing to open until the first payment is made.')).toBeVisible();
    await expect(button(page, 'Open history to an auditor')).toBeDisabled();
    // A history proof needs records other than this loan; with two seeded, the
    // proof button waits for exactly two picks.
    await expect(button(page, 'Prove two repaid loans')).toBeDisabled();
  });
});
