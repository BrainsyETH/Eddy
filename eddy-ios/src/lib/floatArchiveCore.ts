import {
  NO_CONTRIBUTION,
  type ArchiveRow,
  type CompletedFloat,
  type ContributionPreference,
  type SavedFloatSummary,
} from '@eddy/conditions/float-archive';
import type { SavedFloatLogistics } from './savedFloatLogistics';
import { createStorageQueue } from './storageQueue';
import type { SessionStorage } from './floatSessionStoreCore';

export const ARCHIVE_KEY = 'eddy.floatArchive.v1';
const LEGACY_KEY = 'eddy.savedFloats.v1';
export interface LocalArchiveRow extends ArchiveRow {
  revision: number;
  dirty: boolean;
  logistics?: SavedFloatLogistics;
}
interface AccountArchive {
  rows: LocalArchiveRow[];
  preference: ContributionPreference;
  pendingConsentOff?: boolean;
}
interface DiskArchive {
  version: 1;
  owner: string;
  accounts: Record<string, AccountArchive>;
  guestKey: string;
  aliases?: Record<string, string>;
}
const guestKey = () => `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const emptyAccount = (): AccountArchive => ({ rows: [], preference: { ...NO_CONTRIBUTION } });
export interface ArchiveTransport {
  read(): Promise<{ rows: ArchiveRow[]; preference: ContributionPreference }>;
  write(rows: ArchiveRow[]): Promise<void>;
  consent(enabled: boolean): Promise<ContributionPreference>;
}

/** One atomic local document, account scoped; deletion tombstones win on every device. */
export function createFloatArchive(storage: SessionStorage) {
  let disk: DiskArchive = { version: 1, owner: 'guest', accounts: {}, guestKey: guestKey() };
  let loaded = false;
  let selected: string | null = null;
  let revision = 0;
  let error: string | null = null;
  let syncing = false;
  const blocked = new Set<string>();
  const queue = createStorageQueue();
  const consentQueue = createStorageQueue();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((fn) => fn());
  const account = (scope: string) => disk.accounts[scope] ?? emptyAccount();
  const save = async (next: DiskArchive) => {
    await storage.setItem(ARCHIVE_KEY, JSON.stringify(next));
    disk = next;
    revision += 1;
    error = null;
    notify();
  };
  const load = async () => {
    if (loaded) return;
    const raw = await storage.getItem(ARCHIVE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DiskArchive;
      if (parsed.version !== 1 || !parsed.accounts) throw new Error('Float history could not be read.');
      disk = parsed;
    } else {
      const old = await storage.getItem(LEGACY_KEY);
      const saved = old ? (JSON.parse(old) as SavedFloatSummary[]) : [];
      if (!Array.isArray(saved)) throw new Error('Saved floats could not be read.');
      const guest = emptyAccount();
      guest.rows = saved.map(({ logistics, ...payload }: SavedFloatSummary & { logistics?: SavedFloatLogistics }) => ({
        logistics,
        id: `saved-${payload.shortCode}`,
        kind: 'saved',
        payload,
        deleted: false,
        contributionVersion: null,
        revision: 1,
        dirty: true,
      }));
      await save({ ...disk, accounts: { guest } });
      await storage.removeItem(LEGACY_KEY);
    }
    loaded = true;
  };
  const run = <T>(fn: () => Promise<T>) =>
    queue.run(async () => {
      try {
        await load();
        return await fn();
      } catch (e) {
        error = e instanceof Error ? e.message : 'Could not save float history.';
        notify();
        throw e;
      }
    });
  const setAccount = (scope: string, value: AccountArchive) =>
    save({ ...disk, accounts: { ...disk.accounts, [scope]: value } });
  const token = () => ((selected ?? disk.owner) === 'guest' ? disk.guestKey : (selected ?? disk.owner));
  const resolveScope = (scope: string) => disk.aliases?.[scope] ?? (scope === disk.guestKey ? 'guest' : scope);
  return {
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    snapshot() {
      return {
        revision,
        owner: selected,
        scopeToken: token(),
        ready: loaded && selected !== null,
        rows: selected ? account(selected).rows : [],
        preference: selected ? account(selected).preference : NO_CONTRIBUTION,
        pendingConsentOff: selected ? account(selected).pendingConsentOff === true : false,
        syncing,
        error,
      };
    },
    async select(scope: string) {
      // Hide the preceding account immediately, even if disk IO takes time.
      selected = null;
      notify();
      await run(async () => {
        const accounts = { ...disk.accounts };
        if (scope !== 'guest' && disk.owner === 'guest') {
          const target = accounts[scope] ?? emptyAccount();
          const ids = new Set(target.rows.map((r) => r.id));
          const guest = accounts.guest ?? emptyAccount();
          accounts[scope] = {
            ...target,
            rows: [
              ...target.rows,
              ...guest.rows
                .filter((r) => !ids.has(r.id))
                .map((r) => ({ ...r, contributionVersion: null, dirty: true })),
            ],
          };
          accounts.guest = emptyAccount();
        }
        await save({
          ...disk,
          owner: scope,
          accounts,
          guestKey: scope === 'guest' && disk.owner !== 'guest' ? guestKey() : disk.guestKey,
          aliases:
            scope !== 'guest' && disk.owner === 'guest' ? { ...disk.aliases, [disk.guestKey]: scope } : disk.aliases,
        });
        selected = scope;
        notify();
      });
    },
    scope() {
      return token();
    },
    contributionVersion(scope?: string) {
      const owner = resolveScope(scope ?? token());
      const pref = account(owner).preference;
      return owner !== 'guest' && pref.enabled ? pref.version : null;
    },
    addCompleted(summary: CompletedFloat, scope?: string, contributionVersion: string | null = null) {
      return run(async () => {
        const owner = resolveScope(scope ?? token());
        if (blocked.has(owner)) return;
        const current = account(owner);
        if (current.rows.some((r) => r.id === summary.id)) return; // includes tombstones
        const row: LocalArchiveRow = {
          id: summary.id,
          kind: 'completed',
          payload: summary,
          deleted: false,
          contributionVersion: owner !== 'guest' ? contributionVersion : null,
          revision: 1,
          dirty: true,
        };
        await setAccount(owner, { ...current, rows: [row, ...current.rows] });
      });
    },
    putSaved(payload: SavedFloatSummary, scope: string, logistics?: SavedFloatLogistics) {
      return run(async () => {
        if (scope !== token()) return;
        const owner = resolveScope(scope);
        if (blocked.has(owner)) return;
        const current = account(owner);
        const same = (r: LocalArchiveRow) =>
          r.kind === 'saved' && !r.deleted && (r.payload as SavedFloatSummary).shortCode === payload.shortCode;
        const existing = current.rows.find(same);
        const row: LocalArchiveRow = {
          id: existing?.id ?? `saved-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
          kind: 'saved',
          payload,
          deleted: false,
          contributionVersion: null,
          revision: (existing?.revision ?? 0) + 1,
          dirty: existing?.dirty === true || JSON.stringify(existing?.payload) !== JSON.stringify(payload),
          logistics,
        };
        await setAccount(owner, { ...current, rows: [row, ...current.rows.filter((r) => r.id !== row.id)] });
      });
    },
    remove(id: string, scope: string) {
      return run(async () => {
        if (scope !== token()) return;
        const owner = resolveScope(scope);
        if (blocked.has(owner)) return;
        const current = account(owner);
        await setAccount(owner, {
          ...current,
          rows: current.rows.map((r) =>
            r.id === id
              ? {
                  ...r,
                  payload: null,
                  logistics: undefined,
                  deleted: true,
                  contributionVersion: null,
                  revision: r.revision + 1,
                  dirty: true,
                }
              : r,
          ),
        });
      });
    },
    async sync(scope: string, api: ArchiveTransport) {
      if (syncing || scope === 'guest' || blocked.has(scope) || selected !== scope) return;
      syncing = true;
      notify();
      try {
        const revoke = await run(async () => account(scope).pendingConsentOff === true);
        if (revoke) {
          await this.setConsent(scope, false, api);
        }
        const sent = await run(async () => account(scope).rows.filter((r) => r.dirty));
        for (let i = 0; i < sent.length; i += 20) {
          if (selected !== scope || blocked.has(scope)) return;
          await api.write(
            sent
              .slice(i, i + 20)
              .map(({ id, kind, payload, deleted, contributionVersion }) => ({
                id,
                kind,
                payload,
                deleted,
                contributionVersion,
              })),
          );
        }
        if (selected !== scope || blocked.has(scope)) return;
        const consentAtRead = account(scope).preference.version;
        const remote = await api.read();
        await run(async () => {
          if (selected !== scope || blocked.has(scope)) return;
          const current = account(scope);
          const local = new Map(current.rows.map((r) => [r.id, r]));
          const sentVersions = new Map(sent.map((r) => [r.id, r.revision]));
          for (const row of remote.rows) {
            const localRow = local.get(row.id);
            // A remote tombstone always wins; otherwise keep edits made during IO.
            if (localRow?.dirty && localRow.revision !== sentVersions.get(row.id) && !row.deleted) continue;
            local.set(row.id, {
              ...row,
              revision: localRow?.revision ?? 1,
              dirty: false,
              logistics: row.deleted ? undefined : localRow?.logistics,
            });
          }
          await setAccount(scope, {
            ...current,
            rows: [...local.values()],
            preference:
              current.pendingConsentOff || current.preference.version !== consentAtRead
                ? current.preference
                : remote.preference,
          });
        });
      } catch (e) {
        error = e instanceof Error ? e.message : 'Backup will retry when you reconnect.';
        notify();
      } finally {
        syncing = false;
        notify();
      }
    },
    async setConsent(scope: string, enabled: boolean, api: ArchiveTransport) {
      if (selected !== scope || scope === 'guest' || blocked.has(scope))
        throw new Error('Sign in to change this setting.');
      // Revocation takes effect locally immediately; granting waits for the server.
      if (!enabled)
        await run(() =>
          setAccount(scope, { ...account(scope), preference: { ...NO_CONTRIBUTION }, pendingConsentOff: true }),
        );
      await consentQueue.run(async () => {
        if (selected !== scope || blocked.has(scope)) return;
        const preference = await api.consent(enabled);
        await run(async () => {
          if (selected !== scope || blocked.has(scope)) return;
          const current = account(scope);
          await setAccount(scope, {
            ...current,
            preference,
            pendingConsentOff: false,
            rows: enabled ? current.rows : current.rows.map((r) => ({ ...r, contributionVersion: null })),
          });
        });
      });
    },
    async clear(scope: string) {
      const owner = resolveScope(scope);
      if (owner !== 'guest') blocked.add(owner);
      await run(async () => {
        const accounts = { ...disk.accounts };
        delete accounts[owner];
        await storage.removeItem(LEGACY_KEY);
        const aliases = Object.fromEntries(Object.entries(disk.aliases ?? {}).filter(([, value]) => value !== owner));
        const isCurrent = disk.owner === owner;
        await save({
          ...disk,
          accounts,
          aliases,
          owner: isCurrent ? 'guest' : disk.owner,
          guestKey: isCurrent ? guestKey() : disk.guestKey,
        });
        if (selected === owner) {
          selected = 'guest';
          notify();
        }
      });
    },
  };
}
