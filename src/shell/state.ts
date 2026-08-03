/**
 * C22 §5 — the state that belongs to no component.
 *
 * **One writer per field is enforced by shape, not by discipline** (I11). The
 * snapshot is read-only and the writers are separate objects, each holding the
 * fields one owner may set: `SessionWrites.execution` goes to C23, `.refresh`
 * to C22's identity loop, `.stopping` to `stop`. Handing a component the whole
 * store and documenting who may write what is the arrangement that produces the
 * two-writer problem A02 §4 exists to prevent — the documentation is correct and
 * nothing consults it.
 *
 * `cluster` and `version` appear in no writer at all, which is the point: they
 * are set at construction and never written after, and a reader who wants to
 * change one finds nothing to call rather than a comment asking them not to.
 */

import type { Health, Identity, SessionSnapshot } from "./types.js";

/** What C23 may write — §5's rows for `cwd`, `env`, `lastUuid` and `retained`. */
export interface ExecutionWrites {
  /** Applying a `builtin` result (C18). `cd` moves the next spawn (I12). */
  setCwd(cwd: string): void;
  /** An `export` override. Merged, not replaced. */
  setEnv(key: string, value: string): void;
  /** After a verb returns one, for `$_`. */
  setLastUuid(uuid: string | null): void;
  /** On an auth failure; cleared on a successful retry. */
  setRetained(command: string | null): void;
}

/** What C22's five-minute loop may write — §7. */
export interface RefreshWrites {
  setIdentity(identity: Identity | null): void;
  setHealth(health: Health): void;
}

export interface SessionStore {
  readonly snapshot: SessionSnapshot;
  readonly execution: ExecutionWrites;
  readonly refresh: RefreshWrites;
  /** `stop`'s step 1, and the only writer of `stopping`. */
  beginStopping(): void;
  /**
   * `cwd` as a function, never a captured value (I12, C21 I11) — a `cd` between
   * two verbs has to move the second one, and a value read at construction
   * cannot.
   */
  readonly cwd: () => string;
}

export type SessionSeed = Readonly<{
  cwd: string;
  env: Readonly<Record<string, string>>;
  cluster: string;
  version: string;
}>;

export function createSessionStore(seed: SessionSeed): SessionStore {
  let state: SessionSnapshot = Object.freeze({
    cwd: seed.cwd,
    env: Object.freeze({ ...seed.env }),
    lastUuid: null,
    identity: null,
    cluster: seed.cluster,
    health: "live",
    version: seed.version,
    retained: null,
    stopping: false,
  });

  // A fresh frozen object per write rather than a mutation, so a consumer that
  // captured `snapshot` cannot see a field change under it. Chrome reads the
  // snapshot once per frame and must render one coherent state, which is the
  // same reason C01 freezes its resize snapshot (C01 I12).
  const set = (patch: Partial<SessionSnapshot>): void => {
    state = Object.freeze({ ...state, ...patch });
  };

  return {
    get snapshot() {
      return state;
    },

    execution: {
      setCwd: (cwd) => set({ cwd }),
      setEnv: (key, value) => set({ env: Object.freeze({ ...state.env, [key]: value }) }),
      setLastUuid: (lastUuid) => set({ lastUuid }),
      setRetained: (retained) => set({ retained }),
    },

    refresh: {
      setIdentity: (identity) => set({ identity }),
      setHealth: (health) => set({ health }),
    },

    beginStopping: () => set({ stopping: true }),

    cwd: () => state.cwd,
  };
}
