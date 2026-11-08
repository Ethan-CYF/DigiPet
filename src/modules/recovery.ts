/** Backups stay device-local, never logs or exports. Repair is explicit and scoped. */
const affected = new Set<string>();
export function reportRecovery(key: string) { affected.add(key); }
export function recoveryComponents() { return [...affected]; }
export function resetStorageComponent(key: string, replacement?: string) {
  if (!["digipet.api.v1", "digipet.appearances.v1"].includes(key))
    throw Error("Unknown component / 未知元件");
  const raw = localStorage.getItem(key);
  if (raw !== null) localStorage.setItem(`${key}.backup.${crypto.randomUUID()}`, raw);
  // If backup fails, leave the original untouched.
  if (replacement === undefined) localStorage.removeItem(key);
  else localStorage.setItem(key, replacement);
  affected.delete(key);
}
