// Binds the Almide storage hooks (src/wasm.almd) to a key -> string store. Almide
// decides what to read and write and makes each call itself; the generated JS
// suspends it through JSPI while the store's promise settles. `store` is
// { get(key) -> string | null, put(key, value) } (sync or async), or null when
// the deployment has none. No Node or provider APIs here, so Workers and the
// Node adapters share it.

export function storeHost() {
  let current = null;
  let chain = Promise.resolve();

  const hooks = {
    js: {
      async store_get(key) {
        if (!current) return JSON.stringify({ error: 'no storage configured' });
        try {
          return JSON.stringify({ value: (await current.get(key)) ?? null });
        } catch (error) {
          return JSON.stringify({ error: String(error?.message ?? error) });
        }
      },
      async store_put(key, value) {
        if (!current) return 'no storage configured';
        try {
          await current.put(key, value);
          return '';
        } catch (error) {
          return String(error?.message ?? error) || 'write failed';
        }
      },
    },
  };

  // The store is bound for one serve call at a time, so a call that is
  // suspended on its store cannot see another request's store.
  function serveWith(serve, store, method, target, body) {
    const turn = chain.then(async () => {
      current = store;
      try {
        return JSON.parse(await serve(method, target, body));
      } finally {
        current = null;
      }
    });
    chain = turn.catch(() => {});
    return turn;
  }

  return { hooks, serveWith };
}

export function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, get: key => data.get(key) ?? null, put: (key, value) => { data.set(key, value); } };
}
