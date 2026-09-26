import type { Db } from './data';

/** Request-scoped read coalescing. Never shared across users or requests. This
 * adapter exposes only reads; repeated estimator queries share one promise. */
export function memoizeReads(db: Db): Db {
  const cache = new Map<string, Promise<unknown>>();
  const allowed = new Set(['select', 'eq', 'neq', 'in', 'not', 'is', 'gt', 'gte', 'lt', 'lte', 'order', 'limit', 'range', 'single', 'maybeSingle']);
  function wrap(target: object, path: unknown[]): object {
    return new Proxy(target, {
      get(object, property) {
        if (property === 'then') {
          const key = JSON.stringify(path);
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
            let promise = cache.get(key);
            if (!promise) { promise = Promise.resolve(object); cache.set(key, promise); }
            return promise.then(resolve, reject);
          };
        }
        if (typeof property === 'string' && allowed.has(property)) {
          return (...args: unknown[]) => wrap(Reflect.apply(Reflect.get(object, property), object, args), [...path, [property, args]]);
        }
        throw new Error('Agent database adapter supports reads only');
      },
    });
  }
  return new Proxy(db, {
    get(target, property) {
      if (property === 'from' || property === 'rpc') return (...args: unknown[]) => wrap(Reflect.apply(Reflect.get(target, property), target, args), [[property, args]]);
      throw new Error('Agent database adapter supports reads only');
    },
  });
}
