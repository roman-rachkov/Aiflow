/**
 * Must load before `next` in the custom server entry.
 * Next app-render expects `globalThis.AsyncLocalStorage`; without it, requests
 * throw "Invariant: AsyncLocalStorage accessed in runtime where it is not available".
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const g = globalThis as typeof globalThis & {
  AsyncLocalStorage?: typeof AsyncLocalStorage;
};
g.AsyncLocalStorage ??= AsyncLocalStorage;
