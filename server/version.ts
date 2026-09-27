/**
 * Which code production is running, without reading Vercel's metadata: the
 * API is deployed from the CLI, so its recorded git commit can be stale.
 * scripts/build-api.mjs hashes the server's sources and bakes the hash in;
 * every response carries it, and a local `npm run build:api` prints the one
 * the working tree would produce.
 *
 *   curl -s -D - -o /dev/null https://dueline-api.vercel.app/api/tick | grep -i x-dueline-api
 */

declare const __API_VERSION__: string | undefined;

export const API_VERSION = typeof __API_VERSION__ === 'string' ? __API_VERSION__ : 'dev';

export function stamp(res: Response): Response {
  res.headers.set('x-dueline-api', API_VERSION);
  return res;
}
