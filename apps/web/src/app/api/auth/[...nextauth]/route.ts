// Routing only — the handlers live in the auth slice (§ 2.2).
import { handlers } from '@/features/auth';

export const { GET, POST } = handlers;
