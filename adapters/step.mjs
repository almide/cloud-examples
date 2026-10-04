// Runs the shared Almide `step` to a final envelope. Almide decides what to read
// and write; the host performs it. `store` is { get(key) -> string | null,
// put(key, value) } (sync or async), or null when the deployment has none.
// No Node or provider APIs here, so Workers and the Node adapters share it.
export const UNAVAILABLE = Object.freeze({ status: 503, body: { error: 'storage_unavailable' } });

export async function runStep(step, method, target, body, store) {
  const reads = {};
  for (let round = 0; ; round++) {
    const envelope = JSON.parse(step(method, target, body, JSON.stringify(reads)));
    if (Array.isArray(envelope.read)) {
      if (!store || round >= 2) return UNAVAILABLE;
      try {
        for (const key of envelope.read) reads[key] = (await store.get(key)) ?? null;
      } catch (error) {
        console.error('storage read failed:', error?.message ?? error);
        return UNAVAILABLE;
      }
      continue;
    }
    const { write, ...result } = envelope;
    if (write) {
      if (!store) return UNAVAILABLE;
      try {
        await store.put(write.key, write.value);
      } catch (error) {
        console.error('storage write failed:', error?.message ?? error);
        return UNAVAILABLE;
      }
    }
    return result;
  }
}

export function memoryStore(initial = {}) {
  const data = new Map(Object.entries(initial));
  return { data, get: key => data.get(key) ?? null, put: (key, value) => { data.set(key, value); } };
}
