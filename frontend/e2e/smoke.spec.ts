import {
  expect,
  expectNoHorizontalScroll,
  isPhone,
  open,
  switchRole,
  test,
} from './fixtures';

/**
 * Every route renders its heading, raises no page error, and fits a 390px
 * phone without horizontal scroll. Routes with an address are reached by
 * clicking through, as a user would.
 */

const ROUTES: { path: string; h1: RegExp }[] = [
  { path: '/', h1: /Prove it\.\s*Don.t show it\./ },
  { path: '/app/overview', h1: /^Overview$/ },
  { path: '/app/facts', h1: /^Private facts$/ },
  { path: '/app/claims', h1: /^Claims$/ },
  { path: '/app/loans', h1: /^Loans$/ },
  { path: '/app/applications', h1: /^Applications$/ },
  { path: '/app/portfolio', h1: /^Portfolio$/ },
  { path: '/app/directory', h1: /^Directory$/ },
  { path: '/app/audit', h1: /^Payment history audit$/ },
  { path: '/app/live', h1: /^Live chain$/ },
];

for (const { path, h1 } of ROUTES) {
  test(`${path} renders its heading`, async ({ page }) => {
    await open(page, path);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(h1);
    if (isPhone(page)) await expectNoHorizontalScroll(page);
  });
}

test('an unknown console route falls back to the overview', async ({ page }) => {
  await open(page, '/app/nowhere');
  await expect(page).toHaveURL(/\/app\/overview$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Overview');
});

test('detail routes render: borrower loan, lender loan desk, solvency instance', async ({ page }) => {
  // The borrower's seeded history: two repaid loans.
  await open(page, '/app/loans');
  await expect(page.getByText('repaid loans on record in the directory')).toBeVisible();
  const firstLoan = page.locator('main').getByText(/^0x[0-9a-f]{4}…[0-9a-f]{4}$/).filter({ visible: true }).first();
  await firstLoan.click();
  await expect(page).toHaveURL(/\/app\/loans\/[0-9a-f]+$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^0x[0-9a-f]{8}…[0-9a-f]{4}$/);
  await expect(page.getByText('Two ledgers for one loan')).toBeVisible();
  if (isPhone(page)) await expectNoHorizontalScroll(page);

  await switchRole(page, 'lender');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Applications');
  await page.getByRole('button', { name: /^All/ }).click();
  await page.locator('main').getByText(/^0x[0-9a-f]{6}…[0-9a-f]{4}/).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/app\/loan\/[0-9a-f]+$/);
  await expect(page.getByText('Underwriting desk')).toBeVisible();
  if (isPhone(page)) await expectNoHorizontalScroll(page);

  await page.locator('nav').getByRole('link', { name: 'Solvency claims' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Directory');
  await page.getByRole('row').nth(1).click();
  await expect(page).toHaveURL(/\/app\/instance\/[0-9a-f]+$/);
  await expect(page.getByText('Public record')).toBeVisible();
  if (isPhone(page)) await expectNoHorizontalScroll(page);
});
