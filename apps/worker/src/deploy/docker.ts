/**
 * Docker image build via dockerode (MIT).
 *
 * DEV-ONLY socket: `/var/run/docker.sock` is mounted in compose for local
 * development (open question #4). Production must use remote Docker over TLS,
 * a dedicated Docker host, or Kubernetes Jobs — do not rely on the host socket.
 * Vault / Swarm secrets are out of scope for Task 2.3.
 */

import Docker from 'dockerode';
import { pack } from 'tar-fs';

export type BuildImageResult = {
  imageTag: string;
};

export type BuildProgress = (line: string) => void | Promise<void>;

/** Warn when prod runs without an explicit remote DOCKER_HOST. */
export function warnIfProdSocket(): void {
  if (process.env.ENVIRONMENT === 'prod' && !process.env.DOCKER_HOST) {
    console.warn(
      '[deploy] docker.sock is DEV-ONLY; set DOCKER_HOST for remote Docker/TLS in production',
    );
  }
}

export function createDockerClient(): Docker {
  return new Docker();
}

/**
 * Build an image from `contextDir` and tag it.
 * Streams modem progress lines through `onProgress`.
 */
export async function buildDockerImage(args: {
  docker?: Docker;
  contextDir: string;
  imageTag: string;
  onProgress: BuildProgress;
}): Promise<BuildImageResult> {
  const docker = args.docker ?? createDockerClient();
  const tarStream = pack(args.contextDir);
  const stream = await docker.buildImage(tarStream, { t: args.imageTag });

  await followBuild(docker, stream, args.onProgress);
  return { imageTag: args.imageTag };
}

function followBuild(
  docker: Docker,
  stream: NodeJS.ReadableStream,
  onProgress: BuildProgress,
): Promise<void> {
  return new Promise((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      },
      (event: { stream?: string; error?: string; status?: string }) => {
        const line = event.stream ?? event.error ?? event.status;
        if (line) void onProgress(line.endsWith('\n') ? line : `${line}\n`);
      },
    );
  });
}
