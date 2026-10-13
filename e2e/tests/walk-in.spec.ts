import { test, expect } from '@playwright/test';
import { signIn } from './helpers';

// Walk-in flow from arrival to check-out, through the real UI, backend and database.
test('walk-in visitor: guard registers, host confirms, pass issued, guard checks out', async ({ browser }) => {
  const visitor = `Wanda Walker ${Date.now()}`;
  const guard = await (await browser.newContext()).newPage();
  const host = await (await browser.newContext()).newPage();

  // 1. Guard registers the walk-in and names the host
  await signIn(guard, 'frontdesk1@school.test');
  await guard.goto('/frontdesk');
  const form = guard.getByTestId('walkin-form');
  await form.getByLabel('Visitor name').fill(visitor);
  await form.getByLabel('Who are they here to see?').selectOption({ label: 'Teresa Reyes' });
  await form.getByLabel('Purpose of visit').fill('Drop off a project');
  await form.getByTestId('walkin-submit').click();
  await expect(guard.getByTestId('awaiting-row').filter({ hasText: visitor })).toBeVisible();

  // No pass exists yet: the visitor is not on campus
  await expect(guard.getByTestId('campus-row').filter({ hasText: visitor })).toHaveCount(0);

  // 2. Host sees the request in the app and confirms
  await signIn(host, 'teacher1@school.test');
  await host.goto('/employee');
  const request = host.getByTestId('request').filter({ hasText: visitor });
  await expect(request).toBeVisible({ timeout: 15_000 });
  await request.getByRole('button', { name: 'Confirm' }).click();
  await expect(request).toHaveCount(0);

  // 3. Guard's screen updates: visitor is on campus with a pass
  const row = guard.getByTestId('campus-row').filter({ hasText: visitor });
  await expect(row).toBeVisible({ timeout: 15_000 });
  const passNumber = (await row.locator('td').first().innerText()).trim();
  expect(passNumber).toMatch(/^V-\d{4}$/);

  // 4. Guard checks out with the pass number; the pass stops being valid
  await guard.getByTestId('checkout-code').fill(passNumber);
  await guard.getByTestId('checkout-submit').click();
  await expect(guard.getByTestId('notice')).toContainText('checked out');
  await expect(guard.getByTestId('campus-row').filter({ hasText: visitor })).toHaveCount(0);

  await guard.getByTestId('checkout-code').fill(passNumber);
  await guard.getByTestId('checkout-submit').click();
  await expect(guard.getByTestId('error')).toContainText('no longer valid');
});

test('permissions are enforced: an employee cannot open the front desk or call its API', async ({
  browser,
}) => {
  const teacher = await (await browser.newContext()).newPage();
  await signIn(teacher, 'teacher1@school.test');
  await teacher.goto('/frontdesk');
  await expect(teacher.getByTestId('error')).toContainText('do not have access');
  const status = await teacher.evaluate(async () => (await fetch('/api/visits/on-campus')).status);
  expect(status).toBe(403);
});
