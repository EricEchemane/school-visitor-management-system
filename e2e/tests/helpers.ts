import { Page, expect } from '@playwright/test';

export const PASSWORD = 'Passw0rd!demo';

export async function signIn(page: Page, email: string) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByTestId('whoami')).toBeVisible();
}
