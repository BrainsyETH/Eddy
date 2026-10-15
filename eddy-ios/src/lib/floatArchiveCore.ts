import {
  NO_CONTRIBUTION,
  type ArchiveRow,
  type ArchiveWriteResult,
  type CompletedFloat,
  type ContributionPreference,
  type SavedFloatSummary,
} from '@eddy/conditions/float-archive';
import type { SavedFloatLogistics } from './savedFloatLogistics';
import { createStorageQueue } from './storageQueue';
import type { SessionStorage } from './floatSessionStoreCore';

export const ARCHIVE_KEY = 'eddy.floatArchive.v1';
export const ARCHIVE_RECOVERY_KEY = 'eddy.floatArchive.recovery.v1';
const LEGACY_KEY = 'eddy.savedFloats.v1';
export interface LocalArchiveRow extends ArchiveRow {
  revision: number;
  dirty: boolean;
  backupError?: string;
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
  recovered?: boolean;
}
const guestKey = () => `guest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const emptyAccount = (): AccountArchive => ({ rows: [], preference: { ...NO_CONTRIBUTION } });
export interface ArchiveTransport {
  read(): Promise<{ rows: ArchiveRow[]; preference: ContributionPreference }>;
  write(rows: ArchiveRow[]): Promise<ArchiveWriteResult[]>;
  consent(enabled: boolean): Promise<ContributionPreference>;
}

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);
const nullableString = (v: unknown) => v === null || typeof v === 'string';
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
function parseDisk(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return undefined; }
}
function readableSaved(v: unknown): v is SavedFloatSummary {
  return object(v) && ['shortCode', 'url', 'riverName', 'riverSlug', 'putInName', 'takeOutName', 'distanceLabel', 'savedAt']
    .every((key) => typeof v[key] === 'string');
}
function readableWater(v: unknown) {
  return v == null || (object(v) &&
    ['gaugeName', 'gaugeStationId', 'observedAt'].every((key) => typeof v[key] === 'string') &&
    ['heightFt', 'dischargeCfs'].every((key) => v[key] === null || number(v[key])));
}
function readableRow(v: unknown): v is LocalArchiveRow {
  if (!object(v) || typeof v.id !== 'string' || !v.id || (v.kind !== 'saved' && v.kind !== 'completed') ||
    typeof v.deleted !== 'boolean' || typeof v.dirty !== 'boolean' || !number(v.revision) ||
    !nullableString(v.contributionVersion) || (v.backupError !== undefined && typeof v.backupError !== 'string')) return false;
  if (v.deleted) return v.payload === null;
  if (v.kind === 'saved') return readableSaved(v.payload);
  const p = v.payload;
  return object(p) && ['id', 'riverSlug', 'riverName', 'takeOutId', 'takeOutName'].every((key) => typeof p[key] === 'string') &&
    ['putInId', 'putInName', 'boatType'].every((key) => nullableString(p[key])) &&
    (p.startNote === undefined || (typeof p.startNote === 'string' && p.startNote.length > 0 && p.startNote.length <= 240)) &&
    ['startedAt', 'endedAt', 'elapsedMs', 'movingMs', 'stoppedMs', 'unknownMs', 'distanceMiles'].every((key) => number(p[key])) &&
    ['movingMph', 'plannerMph', 'firstMile', 'lastMile'].every((key) => p[key] === null || number(p[key])) &&
    readableWater(p.water);
}
function readableArchive(v: unknown): v is DiskArchive {
  return object(v) && v.version === 1 && typeof v.owner === 'string' && typeof v.guestKey === 'string' &&
    (v.aliases === undefined || (object(v.aliases) && Object.values(v.aliases).every((s) => typeof s === 'string'))) &&
    object(v.accounts) && Object.values(v.accounts).every((a) => object(a) && Array.isArray(a.rows) &&
      a.rows.every(readableRow) && new Set(a.rows.map((r) => r.id)).size === a.rows.length &&
      object(a.preference) && typeof a.preference.enabled === 'boolean' && nullableString(a.preference.version));
}

/** One atomic local document, account scoped; deletion tombstones win on every device. */
export function createFloatArchive(storage: SessionStorage, now: () => number = Date.now) {
  let disk: DiskArchive = { version: 1, owner: 'guest', accounts: {}, guestKey: guestKey() };
  let loaded = false;
  let selected: string | null = null;
  let revision = 0;
  let error: string | null = null;
  let syncing = false;
  const retries = new Map<string, { failures: number; at: number }>();
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
  const preserveCorrupt = async (source: string, raw: string) => {
    // Copy first. A failed read/write is not corruption and must never reset data.
    const previous = await storage.getItem(ARCHIVE_RECOVERY_KEY);
    let copies: { source: string; raw: string }[] = [];
    if (previous !== null) {
      try {
        const parsed: unknown = JSON.parse(previous);
        if (!Array.isArray(parsed) || !parsed.every((v) => object(v) && typeof v.source === 'string' && typeof v.raw === 'string'))
          throw new Error('Unreadable recovery copy');
        copies = parsed;
      } catch {
        copies = [{ source: ARCHIVE_RECOVERY_KEY, raw: previous }];
      }
    }
    if (!copies.some((v) => v.source === source && v.raw === raw)) copies.push({ source, raw });
    await storage.setItem(ARCHIVE_RECOVERY_KEY, JSON.stringify(copies));
  };
  const load = async () => {
    if (loaded) return;
    const raw = await storage.getItem(ARCHIVE_KEY);
    if (raw !== null) {
      const parsed: unknown = parseDisk(raw);
      if (object(parsed) && typeof parsed.version === 'number' && parsed.version > 1)
        throw new Error('Update Eddy to open this float history.');
      if (readableArchive(parsed)) disk = parsed;
      else {
        await preserveCorrupt(ARCHIVE_KEY, raw);
        await save({ version: 1, owner: 'guest', accounts: {}, guestKey: guestKey(), recovered: true });
      }
    } else {
      const old = await storage.getItem(LEGACY_KEY);
      const parsed: unknown = old === null ? [] : parseDisk(old);
      const valid = Array.isArray(parsed) && parsed.every(readableSaved);
      if (!valid && old !== null) await preserveCorrupt(LEGACY_KEY, old);
      const saved = (valid ? parsed : []) as (SavedFloatSummary & { logistics?: SavedFloatLogistics })[];
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
      await save({ ...disk, accounts: { guest }, recovered: !valid });
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
  const setAccount = (scope: string, value: AccountArchive, clearRecovery = false) =>
    save({ ...disk, ...(clearRecovery ? { recovered: false } : {}), accounts: { ...disk.accounts, [scope]: value } });
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
        recovered: disk.recovered === true,
        retryAt: selected ? retries.get(selected)?.at ?? null : null,
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
                .map((r) => ({ ...r, contributionVersion: null, dirty: true, backupError: undefined })),
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
          backupError: JSON.stringify(existing?.payload) === JSON.stringify(payload) ? existing?.backupError : undefined,
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
        // Unreadable copies cannot be scoped to one trip. Never retain a deleted
        // trip inside a recovery copy whose contents we cannot safely interpret.
        await storage.removeItem(ARCHIVE_RECOVERY_KEY);
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
                  backupError: undefined,
                }
              : r,
          ),
        }, true);
      });
    },
    async retryRejected(scope: string) {
      if (selected !== scope || blocked.has(scope)) return;
      await run(async () => {
        if (selected !== scope || blocked.has(scope)) return;
        const current = account(scope);
        await setAccount(scope, { ...current, rows: current.rows.map((row) => row.backupError
          ? { ...row, backupError: undefined, dirty: true, revision: row.revision + 1 } : row) });
      });
    },
    async sync(scope: string, api: ArchiveTransport, force = false) {
      if (syncing || scope === 'guest' || blocked.has(scope) || selected !== scope) return;
      if (!force && now() < (retries.get(scope)?.at ?? 0)) return;
      syncing = true;
      notify();
      try {
        const revoke = await run(async () => account(scope).pendingConsentOff === true);
        if (revoke) {
          await this.setConsent(scope, false, api);
        }
        const localAtStart = await run(async () => account(scope).rows);
        const sent = localAtStart.filter((r) => r.dirty);
        const readVersions = new Map(localAtStart.map((r) => [r.id, r.revision]));
        for (let i = 0; i < sent.length; i += 20) {
          if (selected !== scope || blocked.has(scope)) return;
          const batch = sent.slice(i, i + 20);
          const results = await api.write(
            batch
              .map(({ id, kind, payload, deleted, contributionVersion }) => ({
                id,
                kind,
                payload,
                deleted,
                contributionVersion,
              })),
          );
          if (!Array.isArray(results) || results.length !== batch.length || results.some((r) =>
            !r || (r.status !== 'accepted' && (r.status !== 'rejected' || typeof r.reason !== 'string'))))
            throw new Error('Backup response could not be confirmed. Please retry.');
          await run(async () => {
            if (selected !== scope || blocked.has(scope)) return;
            const byId = new Map(batch.map((row, index) => [row.id, { row, result: results[index] }]));
            const current = account(scope);
            await setAccount(scope, { ...current, rows: current.rows.map((row) => {
              const ack = byId.get(row.id);
              if (!ack || row.revision !== ack.row.revision) return row;
              return { ...row, dirty: false, backupError: ack.result.status === 'rejected' ? ack.result.reason : undefined };
            }) });
          });
        }
        if (selected !== scope || blocked.has(scope)) return;
        const consentAtRead = account(scope).preference.version;
        const remote = await api.read();
        await run(async () => {
          if (selected !== scope || blocked.has(scope)) return;
          const current = account(scope);
          const local = new Map(current.rows.map((r) => [r.id, r]));
          for (const row of remote.rows) {
            const localRow = local.get(row.id);
            // A remote tombstone always wins; otherwise keep edits made during IO.
            if (localRow && !row.deleted && (localRow.backupError ||
              (localRow.dirty && localRow.revision !== readVersions.get(row.id)))) continue;
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
        retries.delete(scope);
      } catch (e) {
        if (selected === scope && !blocked.has(scope)) {
          const failures = Math.min((retries.get(scope)?.failures ?? 0) + 1, 5);
          retries.set(scope, { failures, at: now() + Math.min(60000 * 2 ** (failures - 1), 900000) });
          error = e instanceof Error ? e.message : 'Backup will retry when you reconnect.';
          notify();
        }
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
        await storage.removeItem(ARCHIVE_RECOVERY_KEY);
        retries.delete(owner);
        const aliases = Object.fromEntries(Object.entries(disk.aliases ?? {}).filter(([, value]) => value !== owner));
        const isCurrent = disk.owner === owner;
        await save({
          ...disk,
          recovered: false,
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
