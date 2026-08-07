/**
 * dockerode createContainer option builder for Aider sandboxes (Task 3.1).
 * Hardening matches docs/11-sandbox.md; API key via secret file bind, not Env.
 */

export const DEFAULT_SANDBOX_NETWORK = 'aiflow_sandbox';
export const DEFAULT_AIDER_IMAGE = 'aistudio/aider-sandbox:latest';
export const SANDBOX_API_KEY_MOUNT = '/run/secrets/api_key';

export type SandboxTaskEnv = {
  title: string;
  description: string;
  acceptance: string;
};

export type BuildSandboxOptionsInput = {
  workspaceHostPath: string;
  apiKeyHostPath: string;
  task: SandboxTaskEnv;
  modelProvider?: string;
  modelName?: string;
  apiBaseUrl?: string;
  tmpSandboxHostPath?: string;
  /** Override process.env in unit tests. */
  env?: NodeJS.ProcessEnv;
};

export type SandboxContainerOptions = {
  Image: string;
  Env: string[];
  HostConfig: {
    Binds: string[];
    ReadonlyRootfs: true;
    Tmpfs: Record<string, string>;
    Memory: number;
    NanoCpus: number;
    SecurityOpt: string[];
    CapDrop: string[];
    NetworkMode: string;
  };
};

function readEnv(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const v = env[key];
  return v && v.trim() !== '' ? v : fallback;
}

/** Build createContainer options without talking to Docker. */
export function buildSandboxContainerOptions(
  input: BuildSandboxOptionsInput,
): SandboxContainerOptions {
  const env = input.env ?? process.env;
  const image = readEnv(env, 'AIDER_SANDBOX_IMAGE', DEFAULT_AIDER_IMAGE);
  const network = readEnv(env, 'SANDBOX_NETWORK', DEFAULT_SANDBOX_NETWORK);
  const tmpHost = input.tmpSandboxHostPath ?? '/tmp/sandbox';

  const binds = [
    `${input.workspaceHostPath}:/workspace`,
    `${input.apiKeyHostPath}:${SANDBOX_API_KEY_MOUNT}:ro`,
    `${tmpHost}:/tmp/sandbox`,
  ];

  return {
    Image: image,
    Env: [
      `TASK_JSON=${JSON.stringify(input.task)}`,
      `MODEL_PROVIDER=${input.modelProvider ?? 'openai'}`,
      `MODEL_NAME=${input.modelName ?? 'gpt-4o'}`,
      `API_BASE_URL=${input.apiBaseUrl ?? ''}`,
    ],
    HostConfig: {
      Binds: binds,
      ReadonlyRootfs: true,
      Tmpfs: {
        '/tmp': 'rw,noexec,nosuid,size=512M',
        '/home/sandbox': 'rw,nosuid,size=256M',
      },
      Memory: 512 * 1024 * 1024,
      NanoCpus: 1_000_000_000,
      SecurityOpt: ['no-new-privileges'],
      CapDrop: ['ALL'],
      NetworkMode: network,
    },
  };
}
