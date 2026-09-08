/**
 * Who this tab is.
 *
 * Identity lives in sessionStorage rather than localStorage, which is the
 * whole trick behind testing multiplayer alone: sessionStorage is per-tab, so
 * two tabs of the same browser are two different players sharing one set of
 * saved games.
 */

const ID_KEY = "km:playerId";
const NAME_KEY = "km:playerName";

const HANDLES = [
  "Formateur", "Whip", "Backbencher", "Speaker", "Broker", "Deputy",
  "Kingmaker", "Chairperson", "Rapporteur", "Delegate",
];

const read = (key: string): string | null => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string): void => {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Private browsing: identity lasts as long as the page does, which is enough.
  }
};

let cachedId: string | null = null;

export const playerId = (): string => {
  if (cachedId) return cachedId;
  const stored = read(ID_KEY);
  if (stored) {
    cachedId = stored;
    return stored;
  }
  const fresh = `u_${Math.random().toString(36).slice(2, 10)}`;
  write(ID_KEY, fresh);
  cachedId = fresh;
  return fresh;
};

export const playerName = (): string => {
  const stored = read(NAME_KEY);
  if (stored) return stored;
  const suggested = `${HANDLES[Math.floor(Math.random() * HANDLES.length)]} ${playerId().slice(2, 5)}`;
  write(NAME_KEY, suggested);
  return suggested;
};

export const setPlayerName = (name: string): void => {
  write(NAME_KEY, name.trim() || playerName());
};
