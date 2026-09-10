import { normalizeLocalOrigin } from "./handoff-contract.js";

const prefix = "contact-handoff-recovery-v1:";
const retention = 30 * 24 * 60 * 60 * 1000;

/** Stores only an operation key, origin and opaque session binding; never pixels or source text. */
export function contactRecoveryJournal(storage, now = () => Date.now()) {
  async function list() {
    const all = await storage.get(null), records = [];
    for (const [key, record] of Object.entries(all)) {
      if (!key.startsWith(prefix)) continue;
      if (!record || typeof record.requestKey !== "string" || key !== prefix + record.requestKey
          || !Number.isFinite(record.createdAt) || now() - record.createdAt > retention) {
        await storage.remove(key); continue;
      }
      records.push(record);
    }
    return records;
  }
  return {
    list,
    async claim(origin, sessionVersion, requestKey) {
      origin = normalizeLocalOrigin(origin);
      if (typeof sessionVersion !== "string" || !sessionVersion || sessionVersion.length > 256
          || typeof requestKey !== "string" || !requestKey || requestKey.length > 128) throw new Error("CONTACT_RECOVERY_IDENTITY_INVALID");
      const records = await list();
      const prior = records.find(record => record.requestKey === requestKey);
      if (prior) {
        if (prior.origin !== origin || prior.sessionVersion !== sessionVersion) throw new Error("CONTACT_RECOVERY_SCOPE_CHANGED");
        return prior;
      }
      if (records.some(record => record.origin === origin && record.sessionVersion === sessionVersion && !record.completed)) throw new Error("CONTACT_RECOVERY_PENDING");
      if (records.length >= 20) {
        const oldest = records.filter(record => record.completed).sort((a, b) => a.createdAt - b.createdAt)[0];
        if (!oldest) throw new Error("CONTACT_RECOVERY_PENDING");
        await storage.remove(prefix + oldest.requestKey);
      }
      const record = { origin, sessionVersion, requestKey, createdAt: now() };
      await storage.set({ [prefix + requestKey]: record });
      return record;
    },
    async complete(requestKey) {
      const record = (await list()).find(item => item.requestKey === requestKey);
      if (record) await storage.set({ [prefix + requestKey]: { ...record, completed: true } });
    },
    async remove(requestKey) { await storage.remove(prefix + requestKey); },
  };
}
