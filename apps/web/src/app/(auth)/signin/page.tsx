import { SignInForm } from '@/features/auth';

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Вход в AI Studio</h1>
      <p className="mb-8 text-sm text-fg-muted">Введите почту и пароль</p>
      <SignInForm />
    </main>
  );
}
