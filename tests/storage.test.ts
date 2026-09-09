import { beforeEach, describe, expect, it } from "vitest";

import { PREFIX, migrateLegacyKeys } from "../src/net/storage";

/**
 * A minimal Storage, because the rename is only safe if the migration is, and
 * the migration is the one piece of this whose failure looks like a returning
 * player being told they have never played.
 */
const makeStore = (): Storage => {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
  } as Storage;
};

let local: Storage;
let session: Storage;

beforeEach(() => {
  local = makeStore();
  session = makeStore();
  Object.defineProperty(globalThis, "localStorage", { value: local, configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: session, configurable: true });
});

describe("the rename does not lose anybody's game", () => {
  it("brings saves, trophies and identity across from the old prefix", () => {
    local.setItem("km:achievements", '["first-government"]');
    local.setItem("km:game:abc", '{"id":"abc"}');
    local.setItem("km:game:abc:action:0", '{"type":"offer"}');
    session.setItem("km:playerId", "p-123");
    session.setItem("km:playerName", "Formateur");

    migrateLegacyKeys();

    expect(local.getItem(`${PREFIX}achievements`)).toBe('["first-government"]');
    expect(local.getItem(`${PREFIX}game:abc`)).toBe('{"id":"abc"}');
    expect(local.getItem(`${PREFIX}game:abc:action:0`)).toBe('{"type":"offer"}');
    expect(session.getItem(`${PREFIX}playerId`)).toBe("p-123");
    expect(session.getItem(`${PREFIX}playerName`)).toBe("Formateur");
  });

  it("leaves the originals alone, so an older build still finds them", () => {
    local.setItem("km:achievements", '["first-government"]');
    migrateLegacyKeys();
    expect(local.getItem("km:achievements")).toBe('["first-government"]');
  });

  it("never overwrites newer data, however many times it runs", () => {
    local.setItem("km:achievements", '["old"]');
    migrateLegacyKeys();
    // The player earns something under the new name.
    local.setItem(`${PREFIX}achievements`, '["old","new"]');
    migrateLegacyKeys();
    expect(local.getItem(`${PREFIX}achievements`)).toBe('["old","new"]');
  });

  it("touches nothing that is not the game's", () => {
    local.setItem("unrelated", "keep me");
    local.setItem("kmail:draft", "not ours either");
    migrateLegacyKeys();
    expect(local.getItem(`${PREFIX}unrelated`)).toBeNull();
    // "kmail:" starts with "km" but not with the prefix, so it is left alone.
    expect(local.getItem(`${PREFIX}ail:draft`)).toBeNull();
    expect(local.getItem("kmail:draft")).toBe("not ours either");
  });

  it("does nothing, quietly, where there is no storage at all", () => {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("blocked");
      },
      configurable: true,
    });
    expect(() => migrateLegacyKeys()).not.toThrow();
  });
});
