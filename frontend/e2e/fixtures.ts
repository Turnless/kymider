import { test as base, expect, type Locator, type Page } from '@playwright/test';

/**
 * Shared fixtures and helpers.
 *
 * Every test fails on an uncaught page error or a console error, except the
 * one class of noise this sandbox produces on its own: Google Fonts blocked by
 * the outbound proxy's certificate (net::ERR_CERT_AUTHORITY_INVALID). That is
 * filtered by name, so any other error still fails the run.
 */

const IGNORED: RegExp[] = [
  /ERR_CERT_AUTHORITY_INVALID/,
  // The same blocked request, reported by its URL rather than its reason.
  /fonts\.(googleapis|gstatic)\.com/,
];

const ignorable = (text: string): boolean => IGNORED.some((r) => r.test(text));

export const test = base.extend<{ errors: string[] }>({
  errors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => {
        const text = `pageerror: ${e.message}`;
        if (!ignorable(text)) errors.push(text);
      });
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = `console.error: ${m.text()} @ ${m.location().url}`;
        if (!ignorable(text)) errors.push(text);
      });
      page.on('requestfailed', (r) => {
        const text = `requestfailed: ${r.url()} ${r.failure()?.errorText ?? ''}`;
        if (!ignorable(text)) errors.push(text);
      });
      await use(errors);
      expect(errors, 'page errors (Google Fonts certificate noise excluded)').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export type Role = 'borrower' | 'lender' | 'auditor';

/** The phone project: below the `lg` breakpoint the rail is a top bar. */
export const isPhone = (page: Page): boolean => (page.viewportSize()?.width ?? 1440) < 1024;

/** Open a route and wait for the world (seeded through the real circuits) to render it. */
export async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('h1').first()).toBeVisible();
}

/** Open the console the way a judge does: landing page, then the call to action. */
export async function openConsole(page: Page): Promise<void> {
  await open(page, '/');
  await page.getByRole('link', { name: 'Open the console →' }).click();
  await expect(page).toHaveURL(/\/app\/overview$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible();
}

/** The role switch: bottom-left of the rail on desktop, beside the brand on a phone. */
export async function switchRole(page: Page, role: Role): Promise<void> {
  const button = page.getByRole('button', { name: role, exact: true }).filter({ visible: true });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
}

/** A link in the rail (or the phone's top bar). */
export async function nav(page: Page, label: string): Promise<void> {
  await page.locator('nav').getByRole('link', { name: label, exact: true }).click();
}

/**
 * Client-side navigation to a route the UI does not link to. A full page load
 * would rebuild the simulated world, so this goes through the router instead.
 * Used only to show that the contract itself refuses the wrong party.
 */
export async function routeTo(page: Page, path: string): Promise<void> {
  await page.evaluate((p) => {
    window.history.pushState({ usr: null, key: 'e2e', idx: window.history.length }, '', p);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, path);
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
}

/** How the console abbreviates a contract address: `0x1234…abcd`. */
export const short = (address: string, lead: number, tail = 4): string => {
  const hex = '0x' + address;
  return `${hex.slice(0, lead)}…${hex.slice(-tail)}`;
};

/** The address in the current URL, e.g. /app/loans/<address>. */
export const addressFromUrl = (page: Page): string => {
  const m = /\/app\/(?:loans|loan)\/([0-9a-f]+)$/.exec(new URL(page.url()).pathname);
  if (!m) throw new Error(`no loan address in ${page.url()}`);
  return m[1];
};

/** Thousands-grouped, as the console prints amounts. */
export const grouped = (n: number | bigint): string => n.toLocaleString('en-US');
export const dollars = (n: number | bigint): string => '$' + grouped(n);

/** The page has no horizontal scroll. */
export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0);
}

/** A button by its visible label, the one that is on screen at this width. */
export const button = (scope: Page | Locator, name: string | RegExp): Locator =>
  scope.getByRole('button', { name }).filter({ visible: true });

// --- the loan flow, as the screens offer it ------------------------------------

export type LoanAsk = { lender?: string; principal: string; interest: string; installments: string; days?: string };

/** Borrower → Loans → fill the application → Apply. Returns the new loan's address. */
export async function applyForLoan(page: Page, ask: LoanAsk): Promise<string> {
  await nav(page, 'Loans');
  await expect(page.getByRole('heading', { level: 1, name: 'Loans' })).toBeVisible();
  if (ask.lender) await page.getByRole('combobox').first().selectOption({ label: ask.lender });
  await page.getByLabel('Principal').fill(ask.principal);
  await page.getByLabel('Interest, flat').fill(ask.interest);
  await page.getByLabel('Installments').fill(ask.installments);
  if (ask.days) await page.getByLabel('Period').fill(ask.days);
  await button(page, /^Apply to /).click();
  await expect(page).toHaveURL(/\/app\/loans\/[0-9a-f]+$/);
  return addressFromUrl(page);
}

/** Borrower → Loans → open one of my loans by its address. */
export async function openBorrowerLoan(page: Page, address: string): Promise<void> {
  await nav(page, 'Loans');
  await page.getByText(short(address, 6), { exact: true }).filter({ visible: true }).click();
  await expect(page).toHaveURL(new RegExp(`/app/loans/${address}$`));
}

/** Lender → Applications (All) → open a loan by its address. */
export async function openLenderLoan(page: Page, address: string): Promise<void> {
  await nav(page, 'Applications');
  await expect(page.getByRole('heading', { level: 1, name: 'Applications' })).toBeVisible();
  await page.getByRole('button', { name: /^All/ }).click();
  await page.getByText(new RegExp(`^${short(address, 8)}`)).filter({ visible: true }).first().click();
  await expect(page).toHaveURL(new RegExp(`/app/loan/${address}$`));
}

/**
 * Borrower → the loan → Accept the lender's offer. The offer step names the
 * lender, the collateral and the ratio; the loan is ACTIVE once accepted.
 */
export async function acceptOffer(
  page: Page,
  address: string,
  offer: { lender: string; collateral: string; ratio: string },
): Promise<void> {
  await switchRole(page, 'borrower');
  await openBorrowerLoan(page, address);
  await expect(page.getByText('Your step · Accept or decline')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: `${offer.lender} offers ${offer.collateral} collateral (${offer.ratio})` }),
  ).toBeVisible();
  await button(page, /^Accept$/).click();
  await expect(page.getByRole('heading', { name: `Accepted. Waiting for ${offer.lender} to disburse` })).toBeVisible();
}

/** The lender rail's persona picker: the lender console acts as `name`. */
export async function actAsLender(page: Page, name: string): Promise<void> {
  await page.getByLabel('Acting as lender').filter({ visible: true }).selectOption({ label: name });
}
