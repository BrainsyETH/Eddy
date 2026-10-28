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

/** Rows per upload, and the serialized size one upload stays under: the server refuses bodies over 100,000 characters. */
export const UPLOAD_MAX_ROWS = 20;
export const UPLOAD_MAX_CHARS = 90_000;
/** What a row that no batch could carry is marked with; manual retry resends it. */
export const TOO_LARGE_REASON = 'This float is too large to back up.';

/**
 * Split dirty rows into uploads the server accepts: at most UPLOAD_MAX_ROWS
 * each, and under UPLOAD_MAX_CHARS serialized. A row too large on its own
 * travels alone, so a 413 names exactly one row.
 */
export function uploadBatches<T extends { id: string }>(rows: readonly T[], serialized: (row: T) => number): T[][] {
  const batches: T[][] = [];
  let current: T[] = [];
  let size = 0;
  for (const row of rows) {
    const chars = serialized(row);
    if (current.length > 0 && (current.length >= UPLOAD_MAX_ROWS || size + chars > UPLOAD_MAX_CHARS)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(row);
    size += chars;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const isTooLarge = (e: unknown) => e !== null && typeof e === 'object' && 'status' in e && (e as { status?: unknown }).status === 413;

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

/**
 * One atomic local document, account scoped; deletion tombstones win on every device.
 *
 * `onRemoteDeleted` hears the ids of completed floats a sync tombstoned on
 * the strength of another device's deletion. The recap is the only screen
 * that deletes a float's raw GPS track, and it has just disappeared: without
 * this the track outlived the recap on the phone that recorded it, with no
 * control left to remove it, which is not what Storage promises.
 */
export function createFloatArchive(
  storage: SessionStorage,
  now: () => number = Date.now,
  onRemoteDeleted: (ids: readonly string[]) => void = () => {},
) {
  let disk: DiskArchive = { version: 1, owner: 'guest', accounts: {}, guestKey: guestKey() };
  let loaded = false;
  let selected: string | null = null;
  let revision = 0;
  /** The last local read or write that failed; cleared by the next successful save. */
  let error: string | null = null;
  /** The last backup attempt that failed; cleared only by a backup that succeeds. A local save must not hide it. */
  let syncError: string | null = null;
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
        error: error ?? syncError,
        recovered: disk.recovered === true,
        retryAt: selected ? retries.get(selected)?.at ?? null : null,
      };
    },
    /**
     * Where a trip's row lives: the selected account, another account on
     * this phone (ended under the owner of the time; aliases keep a late
     * end journal with its original owner), or nowhere.
     */
    locate(id: string): 'current' | 'elsewhere' | null {
      const current = selected ? resolveScope(selected) : null;
      for (const [owner, archive] of Object.entries(disk.accounts)) {
        if (archive.rows.some((r) => r.id === id && !r.deleted)) return owner === current ? 'current' : 'elsewhere';
      }
      return null;
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
    /**
     * Tombstone a row. Resolves false, and changes nothing, when `scope` is
     * no longer the selected account: the caller must not report a deletion
     * that did not happen.
     */
    remove(id: string, scope: string): Promise<boolean> {
      return run(async () => {
        if (scope !== token()) return false;
        const owner = resolveScope(scope);
        if (blocked.has(owner)) return false;
        const current = account(owner);
        const row = current.rows.find((r) => r.id === id);
        if (!row) return false;
        // Deleting a TRIP also drops the recovery copy of unreadable history:
        // its contents cannot be scoped to one trip, so the deleted trip must
        // not survive inside it. Only after the tombstone is on disk, and not
        // for a saved route, which is not what that copy would resurrect.
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
        });
        if (row.kind === 'completed') {
          await storage.removeItem(ARCHIVE_RECOVERY_KEY);
          if (disk.recovered) await save({ ...disk, recovered: false });
        }
        return true;
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
    /**
     * Upload what changed, then (by default) read the account's history back
     * and merge it. `readRemote` false uploads only: the periodic timer and
     * the post-edit debounce use it, so a six-hour float does not download
     * the whole history every minute. Foreground, sign-in and manual sync
     * still read.
     */
    async sync(scope: string, api: ArchiveTransport, force = false, readRemote = true) {
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
        const wire = ({ id, kind, payload, deleted, contributionVersion }: LocalArchiveRow): ArchiveRow =>
          ({ id, kind, payload, deleted, contributionVersion });
        const acknowledge = (batch: LocalArchiveRow[], results: ArchiveWriteResult[]) => run(async () => {
          if (selected !== scope || blocked.has(scope)) return;
          const byId = new Map(batch.map((row, index) => [row.id, { row, result: results[index] }]));
          const current = account(scope);
          await setAccount(scope, { ...current, rows: current.rows.map((row) => {
            const ack = byId.get(row.id);
            if (!ack || row.revision !== ack.row.revision) return row;
            return { ...row, dirty: false, backupError: ack.result.status === 'rejected' ? ack.result.reason : undefined };
          }) });
        });
        // A 413 halves the batch until the oversized row is alone, then marks
        // it refused so the rows behind it still upload.
        const upload = async (batch: LocalArchiveRow[]): Promise<void> => {
          if (selected !== scope || blocked.has(scope)) return;
          let results: ArchiveWriteResult[];
          try {
            results = await api.write(batch.map(wire));
          } catch (e) {
            if (!isTooLarge(e)) throw e;
            if (batch.length === 1) {
              await acknowledge(batch, [{ status: 'rejected', reason: TOO_LARGE_REASON }]);
              return;
            }
            const half = Math.ceil(batch.length / 2);
            await upload(batch.slice(0, half));
            await upload(batch.slice(half));
            return;
          }
          if (!Array.isArray(results) || results.length !== batch.length || results.some((r) =>
            !r || (r.status !== 'accepted' && (r.status !== 'rejected' || typeof r.reason !== 'string'))))
            throw new Error('Backup response could not be confirmed. Please retry.');
          await acknowledge(batch, results);
        };
        for (const batch of uploadBatches(sent, (row) => JSON.stringify(wire(row)).length)) {
          if (selected !== scope || blocked.has(scope)) return;
          await upload(batch);
        }
        if (readRemote) {
          if (selected !== scope || blocked.has(scope)) return;
          const consentAtRead = account(scope).preference.version;
          const remote = await api.read();
          const deletedElsewhere: string[] = [];
          await run(async () => {
            if (selected !== scope || blocked.has(scope)) return;
            const current = account(scope);
            const local = new Map(current.rows.map((r) => [r.id, r]));
            for (const row of remote.rows) {
              const localRow = local.get(row.id);
              // A remote tombstone always wins; otherwise keep edits made during IO.
              if (localRow && !row.deleted && (localRow.backupError ||
                (localRow.dirty && localRow.revision !== readVersions.get(row.id)))) continue;
              if (row.deleted && localRow && !localRow.deleted && localRow.kind === 'completed') deletedElsewhere.push(row.id);
              const merged: LocalArchiveRow = {
                ...row,
                revision: localRow?.revision ?? 1,
                dirty: false,
                logistics: row.deleted ? undefined : localRow?.logistics,
              };
              // One row the server sends in a shape this build cannot read is
              // skipped, never written: once on disk it would make the whole
              // history unreadable at the next launch.
              if (!readableRow(merged)) continue;
              local.set(row.id, merged);
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
          // Only once the tombstones are on disk: a track must never go
          // before the recap that is the only place to ask for it again.
          if (deletedElsewhere.length > 0) onRemoteDeleted(deletedElsewhere);
        }
        retries.delete(scope);
        syncError = null;
      } catch (e) {
        if (selected === scope && !blocked.has(scope)) {
          const failures = Math.min((retries.get(scope)?.failures ?? 0) + 1, 5);
          retries.set(scope, { failures, at: now() + Math.min(60000 * 2 ** (failures - 1), 900000) });
          syncError = e instanceof Error ? e.message : 'Backup will retry when you reconnect.';
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
        syncError = null;
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
