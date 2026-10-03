import {
  applyForLoan,
  button,
  dollars,
  expect,
  grouped,
  nav,
  openBorrowerLoan,
  openConsole,
  openLenderLoan,
  switchRole,
  test,
} from './fixtures';

/**
 * The README's "Judge fast path", end to end, in one browser session:
 *
 *   borrower applies and proves a tier → lender asks for 150% and the contract
 *   refuses → lender underwrites at 110% → disburse → borrower repays every
 *   installment, one of them late → lender records the repayment → borrower
 *   proves two repaid loans on a new application → borrower discloses the
 *   history → the auditor verifies it, and a tampered copy is rejected.
 *
 * Every figure asserted is derived from the terms entered here, the way the
 * contract derives it: 110% and 150% of the principal, principal plus flat
 * interest, installments rounded up with the last one smaller.
 */

const PRINCIPAL = 10_000;
const INTEREST_PCT = 10;
const INSTALLMENTS = 3;

const AT_110 = (PRINCIPAL * 110) / 100; // 11,000
const AT_150 = (PRINCIPAL * 150) / 100; // 15,000
const OWED = (PRINCIPAL * (100 + INTEREST_PCT)) / 100; // 11,000
const INSTALLMENT = Math.ceil(OWED / INSTALLMENTS); // 3,667
const LAST = OWED - INSTALLMENT * (INSTALLMENTS - 1); // 3,666

test('judge fast path, end to end', async ({ page }) => {
  test.slow();

  // 1. Open the console. The borrower's facts are on Private facts.
  await openConsole(page);
  await nav(page, 'Private facts');
  await expect(page.getByRole('heading', { level: 1, name: 'Private facts' })).toBeVisible();
  await expect(page.getByText('Nothing on this screen is transmitted')).toBeVisible();

  // 2. Apply: Harbor Bank, 10,000, 3 installments. Both prices are shown first.
  await nav(page, 'Loans');
  await page.getByLabel('Principal').fill(grouped(PRINCIPAL));
  await page.getByLabel('Interest, flat').fill(String(INTEREST_PCT));
  await page.getByLabel('Installments').fill(String(INSTALLMENTS));
  const hero = page.locator('section.card-dark').first();
  await expect(hero).toContainText(dollars(AT_110));
  await expect(hero).toContainText(dollars(AT_150));
  await expect(hero).toContainText(`You would owe ${dollars(OWED)} (10% flat), in 3 installments of ${dollars(INSTALLMENT)}`);
  const loan = await applyForLoan(page, {
    principal: grouped(PRINCIPAL),
    interest: String(INTEREST_PCT),
    installments: String(INSTALLMENTS),
  });
  await expect(page.getByText(`${dollars(PRINCIPAL)} from Harbor Bank`)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Harbor Bank has not quoted yet' })).toBeVisible();

  // 3. Quote, as the lender.
  await switchRole(page, 'lender');
  await openLenderLoan(page, loan);
  await expect(page.getByText('1 · Quote the 110% bar')).toBeVisible();
  await button(page, 'Send quote').click();
  await expect(page.getByText('Net worth ≥ $500,000 · DTI ≤ 40%')).toBeVisible();
  await expect(page.getByText(/^On the ledger\. Expires /)).toBeVisible();

  // 4. Prove the tier, as the borrower.
  await switchRole(page, 'borrower');
  await openBorrowerLoan(page, loan);
  await expect(page.getByText('Your step · Prove tier')).toBeVisible();
  await expect(page.getByText('Your committed facts clear the bar')).toBeVisible();
  await button(page, 'Prove tier').click();
  await expect(page.getByRole('heading', { name: 'Tier recorded. Waiting for Harbor Bank to underwrite' })).toBeVisible();
  await expect(page.getByText('On the ledger now:')).toContainText('Verified · 110%');

  // 5–6. As the lender: the tier and the collateral it fixes, none of the
  // figures behind it. Ask for 150% anyway: the contract refuses.
  await switchRole(page, 'lender');
  await openLenderLoan(page, loan);
  const desk = page.locator('section.card-dark', { hasText: 'Underwriting desk' });
  await expect(desk.getByText('Verified', { exact: true })).toBeVisible();
  await expect(desk).toContainText(`${grouped(AT_110)}110%`);
  await expect(desk).toContainText(`150% would be ${grouped(AT_150)}. The borrower posts ${grouped(AT_150 - AT_110)} less.`);
  const hidden = page.locator('section', { hasText: 'What you can see, and what you cannot' });
  await expect(hidden).toContainText('Never leaves the borrower');
  for (const fact of ['Cash balance', 'Outstanding debts', 'Annual income']) {
    await expect(hidden).toContainText(fact);
  }

  await button(desk, `Ask for 150% anyway · ${grouped(AT_150)}`).click();
  const refusal = desk.getByRole('alert');
  await expect(refusal).toContainText('Refused · the guarantee held');
  await expect(refusal).toContainText('The contract refused: collateral does not match the tier.');
  await expect(refusal).toContainText(`${grouped(AT_110)} at 110% is the only collateral this borrower can be asked for`);

  await button(desk, `Underwrite at 110% · ${grouped(AT_110)}`).click();
  await expect(desk).toContainText(`Underwritten at 110%: collateral ${grouped(AT_110)} recorded on the loan.`);

  // 7. Disburse, then repay every installment as the borrower, one of them late.
  await button(desk, 'Disburse').click();
  await expect(desk).toContainText('Disbursed. The first installment clock is running.');
  await expect(desk).toContainText(`${grouped(OWED)}`);

  await switchRole(page, 'borrower');
  await openBorrowerLoan(page, loan);
  await expect(page.getByRole('heading', { name: `Installment 1 of ${INSTALLMENTS}` })).toBeVisible();
  // Step one day past the first due date: lateness is the block clock's call.
  await button(page, '+31 days').click();
  await expect(page.getByText(/^This installment is .+ late\./)).toBeVisible();
  await button(page, `Repay ${dollars(INSTALLMENT)}`).click();

  await expect(page.getByRole('heading', { name: `Installment 2 of ${INSTALLMENTS}` })).toBeVisible();
  await expect(page.getByText('Paying now is on time.', { exact: false })).toBeVisible();
  await button(page, `Repay ${dollars(INSTALLMENT)}`).click();

  await expect(page.getByRole('heading', { name: `Installment 3 of ${INSTALLMENTS}` })).toBeVisible();
  await button(page, '+30 days').click();
  await button(page, `Repay ${dollars(LAST)}`).click();

  await expect(page.getByRole('heading', { name: 'Repaid in full' })).toBeVisible();
  await expect(page.getByText(`${INSTALLMENTS} payments, 1 late.`)).toBeVisible();

  // The private log beside the public record: three amounts, one late.
  const log = page.locator('section', { has: page.getByRole('heading', { name: 'Payment log' }) });
  await expect(log.getByRole('row')).toHaveCount(1 + INSTALLMENTS);
  await expect(log.getByRole('row').nth(1)).toContainText(dollars(INSTALLMENT));
  await expect(log.getByRole('row').nth(1)).toContainText('Late');
  await expect(log.getByRole('row').nth(3)).toContainText(dollars(LAST));
  await expect(log.getByText('On time', { exact: true })).toHaveCount(2);

  // 8a. The lender records the repayment in the directory.
  await switchRole(page, 'lender');
  await openLenderLoan(page, loan);
  await expect(desk).toContainText(`${INSTALLMENTS} payments · 1 late · ${grouped(OWED)} received`);
  await button(desk, 'Record repayment in the directory').click();
  await expect(desk).toContainText('Recorded in the directory');

  // 8b. On a new application the borrower proves two repaid loans.
  await switchRole(page, 'borrower');
  await nav(page, 'Loans');
  // Two seeded repaid loans plus this one.
  await expect(page.getByText('repaid loans on record in the directory')).toBeVisible();
  await expect(page.locator('p.tnum', { hasText: /^3$/ })).toBeVisible();
  const second = await applyForLoan(page, { principal: '20,000', interest: '8', installments: '4' });
  expect(second).not.toBe(loan);
  const history = page.locator('section', { hasText: 'Optional · Prove two repaid loans' });
  await expect(history).toContainText('3 on record · 0 of 2 picked');
  const picks = history.getByRole('checkbox');
  await picks.nth(0).check();
  await picks.nth(1).check();
  await expect(history).toContainText('2 of 2 picked');
  // A third cannot be picked once two are.
  await expect(picks.nth(2)).toBeDisabled();
  await button(history, 'Prove two repaid loans').click();
  await expect(page.getByText('Two repaid loans proven')).toBeVisible();

  // The lender sees the count, not which loans.
  await switchRole(page, 'lender');
  await openLenderLoan(page, second);
  await expect(page.getByText('2 prior repaid loans proven')).toBeVisible();

  // 9. The borrower opens the repaid loan's history to an auditor.
  await switchRole(page, 'borrower');
  await openBorrowerLoan(page, loan);
  await button(page, 'Open history to an auditor').click();
  await expect(page.getByText(`${INSTALLMENTS} payments · paste or upload on the auditor screen`)).toBeVisible();
  const disclosure = (await page.locator('pre').textContent())!;
  expect(JSON.parse(disclosure)).toMatchObject({ version: 1, loan });

  await switchRole(page, 'auditor');
  await expect(page.getByRole('heading', { level: 1, name: 'Payment history audit' })).toBeVisible();
  const box = page.getByLabel('Disclosure JSON');
  await box.fill(disclosure);
  await button(page, 'Verify against the chain').click();
  await expect(page.getByText('Verified', { exact: true })).toBeVisible();
  await expect(page.getByText(`${INSTALLMENTS} payments, 1 late, ${dollars(OWED)} repaid`)).toBeVisible();
  await expect(page.getByText('= on-chain head')).toBeVisible();

  // Edit one amount: the chain no longer lands on the loan's commitment.
  const tampered = disclosure.replace(`"amount": "${INSTALLMENT}"`, `"amount": "${INSTALLMENT + 1}"`);
  expect(tampered).not.toBe(disclosure);
  await box.fill(tampered);
  await button(page, 'Verify against the chain').click();
  await expect(page.getByText('Rejected', { exact: true })).toBeVisible();
  await expect(page.getByText('≠ on-chain head')).toBeVisible();
  await expect(page.getByText('Verified', { exact: true })).toHaveCount(0);

  // 10. Live chain is one click away from every role.
  await nav(page, 'Live chain');
  await expect(page.getByRole('heading', { level: 1, name: 'Live chain' })).toBeVisible();
});
