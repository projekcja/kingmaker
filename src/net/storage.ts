/**
 * Where this browser keeps things, and what to do about the old name.
 *
 * Every saved game, every trophy and this tab's identity live under a prefix,
 * and the prefix used to be `km:` — for Kingmaker, which the game is no longer
 * called. Renaming it is a one-line change and a data loss: anybody who has
 * played would come back to an empty trophy case and no saved campaigns, having
 * done nothing but reload the page.
 *
 * So the keys move and the contents come with them. {@link migrateLegacyKeys}
 * runs once at startup, copies anything still under the old prefix across, and
 * leaves the originals where they are — a browser that opens an older build of
 * the game afterwards still finds its own saves, which matters because the old
 * build is one Pages deploy away for as long as anyone has the tab open.
 *
 * The copy is deliberately not a move, and it never overwrites: a key that
 * already exists under the new prefix is newer than the one under the old, and
 * the second run of the migration must be a no-op rather than a restore.
 */

/** The prefix every key in this browser sits under. */
export const PREFIX = "61:";

/** What it used to be, and what a returning player's data is still under. */
const LEGACY_PREFIX = "km:";

const rename = (key: string): string => `${PREFIX}${key.slice(LEGACY_PREFIX.length)}`;

/** Copy one store's `km:` keys across to `61:`, leaving the originals. */
const migrateStore = (store: Storage): number => {
  // Collected before anything is written: adding keys while walking the store's
  // index is how a migration ends up either skipping entries or copying its own
  // output back over itself.
  const legacy: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const key = store.key(index);
    if (key && key.startsWith(LEGACY_PREFIX)) legacy.push(key);
  }

  let moved = 0;
  for (const key of legacy) {
    const destination = rename(key);
    if (store.getItem(destination) !== null) continue;
    const value = store.getItem(key);
    if (value === null) continue;
    store.setItem(destination, value);
    moved += 1;
  }
  return moved;
};

/**
 * Bring a returning player's saves, trophies and identity under the new name.
 *
 * Safe to call more than once, and safe to call in a browser that has never
 * seen the old name, where it finds nothing and does nothing. Every access is
 * wrapped because private browsing and blocked site data throw on the first
 * touch of `localStorage`, and a game that cannot save is still a game that
 * should start.
 */
export const migrateLegacyKeys = (): void => {
  try {
    migrateStore(localStorage);
  } catch {
    // No storage at all. Nothing to migrate, and nothing that needed it.
  }
  try {
    migrateStore(sessionStorage);
  } catch {
    // Same again: this tab simply gets a fresh identity.
  }
};
