/** Small process-local cache with coalescing and explicitly marked stale fallback. */
function createMarketCache(ttl, { now = Date.now, limit = 100 } = {}) {
  const entries = new Map(), pending = new Map();
  return {
    async get(key, load) {
      if (pending.has(key)) return pending.get(key);
      const entry = entries.get(key);
      if (entry?.value && now() - entry.ts < ttl) return { ...entry.value, cached: true, stale: false };
      if (entry?.retryAt > now()) {
        if (!entry.value) throw entry.error;
        return { ...entry.value, cached: true, stale: true };
      }
      const task = Promise.resolve().then(load).then(value => {
        entries.set(key, { value, ts: now() });
        if (entries.size > limit) entries.delete(entries.keys().next().value);
        return { ...value, cached: false, stale: false };
      }).catch(error => {
        entries.set(key, { ...entry, error, retryAt: now() + 30000 });
        if (entries.size > limit) entries.delete(entries.keys().next().value);
        if (entry?.value) return { ...entry.value, cached: true, stale: true };
        throw error;
      }).finally(() => pending.delete(key));
      pending.set(key, task);
      return task;
    },
  };
}
module.exports = { createMarketCache };
