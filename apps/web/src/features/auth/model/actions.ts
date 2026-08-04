'use server';

import { AuthError } from 'next-auth';

import { signIn } from './nextauth';

/**
 * Credentials sign-in as a server action, so the form component never handles
 * the password itself.
 *
 * Returns an error message on failure and does not return at all on success —
 * `signIn` redirects, which throws NEXT_REDIRECT. That error must propagate:
 * catching it would swallow the redirect and leave the user on the form.
 */
export async function signInWithCredentials(formData: FormData): Promise<string> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
    });
  } catch (error) {
    if (error instanceof AuthError) {
      // One message for every credentials failure: distinguishing "no such
      // address" from "wrong password" would let anyone enumerate accounts.
      return 'Неверная почта или пароль';
    }
    throw error;
  }

  return '';
}
