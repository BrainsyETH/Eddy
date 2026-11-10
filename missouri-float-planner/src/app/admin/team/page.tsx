'use client';
import { useCallback, useEffect, useState } from 'react';
import AdminLayout from '@/components/admin/AdminLayout';
import { adminFetch } from '@/hooks/useAdminAuth';
import {
  useAdminInteractions,
  useUnsavedAdminChanges,
} from '@/components/admin/AdminInteractionProvider';
interface Member {
  user_id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  updated_at: string;
}
const empty = { name: '', email: '', role: 'editor', active: true };
export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState(empty);
  const [editing, setEditing] = useState<Member | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<boolean | null>(null);
  const { confirm } = useAdminInteractions();
  const discard = useUnsavedAdminChanges(
    JSON.stringify(draft) !==
      JSON.stringify(
        editing
          ? {
              name: editing.name,
              email: editing.email,
              role: editing.role,
              active: editing.active,
            }
          : empty,
      ),
  );
  const load = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/team');
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      setMembers(data.members);
      setRecovery(data.recoveryEnabled);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const save = async () => {
    if (
      !(await confirm(
        `${draft.active ? 'Grant' : 'Remove'} ${draft.role} access for ${draft.email}?`,
        { confirmLabel: 'Update access', danger: !draft.active },
      ))
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      const res = await adminFetch('/api/admin/team', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...draft,
          expectedUpdatedAt: editing?.updated_at,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw Error(data.error);
      setDraft(empty);
      setEditing(null);
      setMessage(
        data.auditRecorded
          ? 'Access updated.'
          : 'Access updated, but the activity record failed.',
      );
      await load();
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <AdminLayout
      title="Team & access"
      description="Give each administrator only the access they need."
    >
      <div className="admin-panel">
        <h2 className="font-bold text-lg">Named accounts</h2>
        <p className="my-3 text-sm">
          Use an existing Eddy account with a verified email. Owners manage
          access and operations. Editors manage places and publishing.
          Moderators review community submissions and feedback.
        </p>
        {recovery && (
          <p className="p-3 bg-amber-50 text-amber-900 text-sm">
            Owner recovery access is enabled. After verifying named owner
            sign-in, disable recovery access in deployment settings
            (ADMIN_ALLOW_RECOVERY_ACCESS=false). Existing recovery sessions will
            also stop working.
          </p>
        )}
        {message && (
          <p className="my-4" role="status">
            {message}
          </p>
        )}
        <div className="divide-y">
          {members.map((m) => (
            <div
              key={m.user_id}
              className="flex flex-wrap items-center justify-between py-3 gap-3"
            >
              <span>
                <strong>{m.name}</strong>
                <small className="block">
                  {m.email} · {m.role} · {m.active ? 'Active' : 'Disabled'}
                </small>
              </span>
              <button
                className="admin-secondary"
                onClick={async () => {
                  if (await discard()) {
                    setEditing(m);
                    setDraft({
                      name: m.name,
                      email: m.email,
                      role: m.role,
                      active: m.active,
                    });
                  }
                }}
              >
                Edit access
              </button>
            </div>
          ))}
        </div>
      </div>
      <form
        className="admin-panel space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 className="font-bold">
          {editing ? 'Edit access' : 'Add administrator'}
        </h2>
        <label className="block">
          Name
          <input
            required
            maxLength={100}
            className="block w-full border rounded p-2"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label className="block">
          Verified account email
          <input
            required
            type="email"
            disabled={!!editing}
            className="block w-full border rounded p-2"
            value={draft.email}
            onChange={(e) => setDraft({ ...draft, email: e.target.value })}
          />
        </label>
        <label className="block">
          Role
          <select
            className="block w-full border rounded p-2"
            value={draft.role}
            onChange={(e) => setDraft({ ...draft, role: e.target.value })}
          >
            <option value="owner">Owner</option>
            <option value="editor">Editor</option>
            <option value="moderator">Moderator</option>
          </select>
        </label>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={draft.active}
            onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
          />
          Active access
        </label>
        <div className="admin-save-bar">
          <button
            type="button"
            onClick={async () => {
              if (await discard()) {
                setDraft(empty);
                setEditing(null);
              }
            }}
          >
            Cancel
          </button>
          <button className="admin-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save access'}
          </button>
        </div>
      </form>
    </AdminLayout>
  );
}
