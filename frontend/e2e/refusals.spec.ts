import {
  acceptOffer,
  actAsLender,
  addressFromUrl,
  applyForLoan,
  button,
  expect,
  grouped,
  nav,
  open,
  openBorrowerLoan,
  openLenderLoan,
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
    // No offer before a quote; then none at 150% until the borrower answers it.
    await expect(button(desk, `Offer at 150% · ${grouped(7_500)}`)).toBeDisabled();
    await button(desk, 'Send quote').click();
    await expect(desk.getByText(/^On the ledger\. Expires /)).toBeVisible();
    await expect(button(desk, `Offer at 150% · ${grouped(7_500)}`)).toBeDisabled();

    // The borrower chooses 150% without proving.
    await switchRole(page, 'borrower');
    await openBorrowerLoan(page, loan);
    await button(page, "Don't prove; accept 150% terms").click();
    await expect(page.getByRole('heading', { name: 'Proof waived. Waiting for Harbor Bank to offer 150%' })).toBeVisible();

    await switchRole(page, 'lender');
    await openLenderLoan(page, loan);
    await expect(desk.getByText('Proof waived', { exact: true })).toBeVisible();
    await button(desk, `Offer at 150% · ${grouped(7_500)}`).click();
    await acceptOffer(page, loan, { lender: 'Harbor Bank', collateral: '$7,500', ratio: '150%' });
    await switchRole(page, 'lender');
    await openLenderLoan(page, loan);
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
    // The directory never records a default; the console reads it from the Loan.
    await expect(page.locator('main')).toContainText('defaulted (from the Loan)');

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
    for (const name of [/^Send quote/, /^Offer at/, /^Disburse/, /^Mark default/, /^Decline/, /^Record repayment/]) {
      await expect(button(page, name)).toHaveCount(0);
    }

    await switchRole(page, 'lender');
    await page.getByRole('button', { name: /^All/ }).click();
    await page.locator('main').getByText(new RegExp(`^${short(loan, 8)}`)).filter({ visible: true }).first().click();
    await expect(page).toHaveURL(new RegExp(`/app/loan/${loan}$`));
    for (const name of [/^Prove tier/, /^Accept$/, /^Repay/, /^Prove two repaid loans/, /^Open history to an auditor/]) {
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
    // Unquoted, so no offer is open to anyone ("quote first").
    await expect(button(desk, /^Offer at 150%/)).toBeDisabled();
    await expect(desk.getByTestId('offer-blocked')).toContainText('quote first');

    await expect(page.locator('main')).not.toContainText('Atlas Lending (you)');

    // From Atlas Lending's seat (the lender rail's picker) it is listed, and the quote goes through.
    await actAsLender(page, 'Atlas Lending');
    await openLenderLoan(page, loan);
    await expect(page.locator('main')).toContainText('Atlas Lending (you)');
    await button(desk, 'Send quote').click();
    await expect(desk.getByText(/^On the ledger\. Expires /)).toBeVisible();
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

/**
 * The bypass a review found in the previous contract: after the borrower
 * proved VERIFIED, the lender re-quoted (which reset the tier) and then
 * underwrote at 150%; or quoted with a 2-second expiry so the tier lapsed.
 * Each is now refused by the contract, and an offer binds only once the
 * borrower accepts it.
 */
test.describe('a lender cannot impose 150% on a verified borrower', () => {
  test('re-quoting after VERIFIED is refused, 150% is refused, and a short quote is refused', async ({ page }) => {
    await open(page, '/app/overview');
    const loan = await applyForLoan(page, { principal: '10,000', interest: '10', installments: '3' });

    await switchRole(page, 'lender');
    await openLenderLoan(page, loan);
    const desk = page.locator('section.card-dark', { hasText: 'Underwriting desk' });

    // A quote that would lapse within minutes: refused before any proof exists.
    await desk.getByLabel('Valid for').fill('0');
    await button(desk, 'Send quote').click();
    await expect(desk.getByRole('alert')).toContainText('The contract refused: quote must hold at least 30 minutes');
    await desk.getByLabel('Valid for').fill('72');
    await button(desk, 'Send quote').click();
    await expect(desk.getByText(/^On the ledger\. Expires /)).toBeVisible();

    await switchRole(page, 'borrower');
    await openBorrowerLoan(page, loan);
    await button(page, 'Prove tier').click();
    await expect(page.getByText('On the ledger now:')).toContainText('Verified · 110%');

    // The two-click bypass: Replace quote, then 150%. Both refused; the tier stands.
    await switchRole(page, 'lender');
    await openLenderLoan(page, loan);
    await button(desk, 'Replace quote').click();
    await expect(desk.getByRole('alert')).toContainText('The contract refused: a verified tier is live until it lapses');
    await expect(desk.getByText('Verified', { exact: true })).toBeVisible();
    await button(desk, `Ask for 150% anyway · ${grouped(15_000)}`).click();
    await expect(desk.getByRole('alert')).toContainText('collateral does not match the tier');
    await expect(button(desk, `Offer at 110% · ${grouped(11_000)}`)).toBeVisible();
    await expect(page.getByText('Quote 1 of 3')).toBeVisible();
  });

  test("the lender cannot offer 150% during the borrower's proof window: refused, then the proof lands at 110%", async ({
    page,
  }) => {
    await open(page, '/app/overview');
    const loan = await applyForLoan(page, { principal: '10,000', interest: '10', installments: '3' });

    // The lender quotes, then tries to get in ahead of the borrower's proof.
    await switchRole(page, 'lender');
    await openLenderLoan(page, loan);
    const desk = page.locator('section.card-dark', { hasText: 'Underwriting desk' });
    await button(desk, 'Send quote').click();
    await expect(desk.getByText(/^On the ledger\. Expires /)).toBeVisible();

    // The regular offer button is off, with the reason.
    await expect(button(desk, `Offer at 150% · ${grouped(15_000)}`)).toBeDisabled();
    await expect(desk.getByTestId('offer-blocked')).toContainText('the borrower can prove until the quote lapses');

    // Forced through anyway: the contract refuses, and nothing is written.
    await button(desk, `Offer 150% before they prove · ${grouped(15_000)}`).click();
    await expect(desk.getByRole('alert')).toContainText(
      'The contract refused: the borrower can prove until the quote lapses',
    );
    await expect(desk).toContainText('1 · Quote the 110% bar');
    // So is replacing the quote before the borrower answers it.
    await button(desk, 'Replace quote').click();
    await expect(desk.getByRole('alert')).toContainText('the borrower can prove until the quote lapses');
    await expect(page.getByText('Quote 1 of 3')).toBeVisible();

    // The borrower proves against the quote they were given.
    await switchRole(page, 'borrower');
    await openBorrowerLoan(page, loan);
    await expect(page.getByText('Your proof window is open until the quote lapses')).toBeVisible();
    await button(page, 'Prove tier').click();
    await expect(page.getByText('On the ledger now:')).toContainText('Verified · 110%');

    // Now 110% is the only figure the lender can offer, and the borrower accepts it.
    await switchRole(page, 'lender');
    await openLenderLoan(page, loan);
    await button(desk, `Offer at 110% · ${grouped(11_000)}`).click();
    await acceptOffer(page, loan, { lender: 'Harbor Bank', collateral: '$11,000', ratio: '110%' });
    await expect(page.getByText('$11,000', { exact: true }).first()).toBeVisible();
  });

  test('a 150% offer the borrower declines binds no one; the lender may offer it again', async ({ page }) => {
    await open(page, '/app/overview');
    const loan = await applyForLoan(page, { principal: '10,000', interest: '10', installments: '3' });

    await switchRole(page, 'lender');
    await openLenderLoan(page, loan);
    const desk = page.locator('section.card-dark', { hasText: 'Underwriting desk' });
    await button(desk, 'Send quote').click();
    await expect(desk.getByText(/^On the ledger\. Expires /)).toBeVisible();

    // The quote lapses unanswered; only then is 150% on the table.
    await button(page, '+7 d').click();
    await button(desk, `Offer at 150% · ${grouped(15_000)}`).click();
    await expect(desk).toContainText('Waiting for the borrower to accept');
    await expect(button(desk, 'Disburse')).toHaveCount(0);

    await switchRole(page, 'borrower');
    await openBorrowerLoan(page, loan);
    await expect(page.getByRole('heading', { name: 'Harbor Bank offers $15,000 collateral (150%)' })).toBeVisible();
    await expect(page.getByText('only you can make it binding')).toBeVisible();
    await button(page, /^Decline$/).click();
    // The application is open again; the lapsed quote means the lender quotes again (within the cap).
    await expect(page.getByText('Your step · Prove tier')).toBeVisible();
    await expect(page.getByText(/The lender has to quote again\./)).toBeVisible();
  });
});
