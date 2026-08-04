/**
 * Creates or updates a development user so the Credentials provider has
 * something to authenticate against. Task 1.2a ships no sign-up screen, so
 * without this there is no way into the app at all.
 *
 * Dev-only by construction: it refuses to run against anything but a local
 * database, because a script that seeds a known password is exactly the script
 * you do not want pointed at a deployed environment by accident.
 *
 *   yarn workspace @aiflow/db seed:dev-user [email] [password]
 */
import { hash } from 'bcryptjs';

import { getPublicClient } from '../src/index';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', 'postgres']);

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const host = new URL(url).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing to seed a non-local database (host: ${host})`);
  }

  const email = process.argv[2] ?? 'dev@example.com';
  const password = process.argv[3] ?? 'devpassword';
  const passwordHash = await hash(password, 10);

  const user = await getPublicClient().user.upsert({
    where: { email },
    create: { email, name: 'Dev User', passwordHash, uiMode: 'PRO', emailVerified: new Date() },
    update: { passwordHash },
  });

  // Never echo the password — even the dev default. stdout is captured by CI,
  // telemetry, and shell history. The default credentials are documented in the
  // file header above; a caller who passed them explicitly already knows them.
  console.log(`Seeded ${user.email} (uiMode ${user.uiMode})`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void getPublicClient().$disconnect());
