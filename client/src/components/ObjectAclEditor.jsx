import { useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY_PERMS = { read: false, readAcp: false, writeAcp: false };

function PermCheckbox({ checked, onChange, label, readOnly }) {
  return (
    <label className="acl-checkbox" title={label}>
      <input
        type="checkbox"
        checked={checked}
        disabled={readOnly}
        onChange={(e) => !readOnly && onChange(e.target.checked)}
      />
    </label>
  );
}

function GranteeRow({ label, meta, perms, onChange, readOnly }) {
  return (
    <tr>
      <td>
        <div>{label}</div>
        {meta && <div className="muted small">{meta}</div>}
      </td>
      <td>
        <PermCheckbox
          checked={perms.read}
          onChange={(v) => onChange({ ...perms, read: v })}
          label="Object: Read"
        />
      </td>
      <td>
        <PermCheckbox
          checked={perms.readAcp}
          onChange={(v) => onChange({ ...perms, readAcp: v })}
          label="Object ACL: Read"
        />
      </td>
      <td>
        <PermCheckbox
          checked={perms.writeAcp}
          onChange={(v) => onChange({ ...perms, writeAcp: v })}
          label="Object ACL: Write"
        />
      </td>
      {!readOnly && <td></td>}
    </tr>
  );
}

export default function ObjectAclEditor({ region, bucketName, objectKey }) {
  const [owner, setOwner] = useState(null);
  const [publicPerms, setPublicPerms] = useState(EMPTY_PERMS);
  const [authPerms, setAuthPerms] = useState(EMPTY_PERMS);
  const [grantees, setGrantees] = useState([]);
  const [newGranteeId, setNewGranteeId] = useState('');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getObjectAcl(region, bucketName, objectKey)
      .then((data) => {
        if (cancelled) return;
        setOwner(data.owner);
        setPublicPerms(data.public || EMPTY_PERMS);
        setAuthPerms(data.authenticated || EMPTY_PERMS);
        setGrantees((data.grantees || []).map((g) => ({ ...g })));
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [region, bucketName, objectKey]);

  function updateGrantee(id, perms) {
    setGrantees((prev) => prev.map((g) => (g.id === id ? { ...g, ...perms } : g)));
  }

  function removeGrantee(id) {
    setGrantees((prev) => prev.filter((g) => g.id !== id));
  }

  function addGrantee() {
    const id = newGranteeId.trim();
    if (!id || grantees.some((g) => g.id === id)) return;
    setGrantees((prev) => [...prev, { id, displayName: null, ...EMPTY_PERMS }]);
    setNewGranteeId('');
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await api.setObjectAcl(region, bucketName, objectKey, {
        public: publicPerms,
        authenticated: authPerms,
        grantees: grantees.map(({ id, read, readAcp, writeAcp }) => ({ id, read, readAcp, writeAcp })),
      });
      setNotice('ACL saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted small">Loading…</p>;

  return (
    <div>
      {error && <div className="banner banner-error" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="banner banner-success" style={{ marginBottom: 12 }}>{notice}</div>}

      <p className="muted small" style={{ marginBottom: 10 }}>
        Define access permissions for this object, specifying who can read it or modify its ACL.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="object-table acl-table">
          <thead>
            <tr>
              <th>Grantee</th>
              <th>Object: Read</th>
              <th>Object ACL: Read</th>
              <th>Object ACL: Write</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div>Bucket Owner</div>
                {owner?.displayName && <div className="muted small">{owner.displayName}</div>}
              </td>
              <td>
                <PermCheckbox checked readOnly onChange={() => {}} label="Object: Read" />
              </td>
              <td>
                <PermCheckbox checked readOnly onChange={() => {}} label="Object ACL: Read" />
              </td>
              <td>
                <PermCheckbox checked readOnly onChange={() => {}} label="Object ACL: Write" />
              </td>
              <td></td>
            </tr>
            <GranteeRow label="Public access" perms={publicPerms} onChange={setPublicPerms} />
            <GranteeRow
              label="Authenticated users"
              meta="Anyone with an IONOS Cloud account"
              perms={authPerms}
              onChange={setAuthPerms}
            />
            {grantees.map((g) => (
              <GranteeRow
                key={g.id}
                label={g.displayName || g.id}
                meta={g.displayName ? g.id : null}
                perms={g}
                onChange={(perms) => updateGrantee(g.id, perms)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="detail-block">
        <h3>Additional Grantees ({grantees.length})</h3>
        <div className="destination-row">
          <input
            type="text"
            placeholder="Canonical user ID"
            value={newGranteeId}
            onChange={(e) => setNewGranteeId(e.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={addGrantee} disabled={!newGranteeId.trim()}>
            Add
          </button>
        </div>
        {grantees.length > 0 && (
          <ul className="acl-grantee-remove-list">
            {grantees.map((g) => (
              <li key={g.id}>
                <span className="muted small">{g.displayName || g.id}</span>
                <button type="button" className="btn btn-ghost" onClick={() => removeGrantee(g.id)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rule-editor-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
