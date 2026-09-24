import { useEffect, useState } from 'react';
import { api } from '../api.js';

function toDateInputValue(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export default function ObjectLockPanel({ region, bucketName, objectKey }) {
  const [retention, setRetention] = useState(null);
  const [legalHold, setLegalHold] = useState('OFF');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [mode, setMode] = useState('GOVERNANCE');
  const [retainUntil, setRetainUntil] = useState('');
  const [bypassGovernance, setBypassGovernance] = useState(false);
  const [savingRetention, setSavingRetention] = useState(false);
  const [togglingHold, setTogglingHold] = useState(false);

  function load() {
    setLoading(true);
    setError(null);
    api
      .getObjectRetentionLock(region, bucketName, objectKey)
      .then((data) => {
        setRetention(data.retention);
        setLegalHold(data.legalHold || 'OFF');
        if (data.retention?.mode) setMode(data.retention.mode);
        setRetainUntil(toDateInputValue(data.retention?.retainUntilDate));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [region, bucketName, objectKey]);

  async function handleSaveRetention(e) {
    e.preventDefault();
    if (!retainUntil) return;
    setSavingRetention(true);
    setError(null);
    setNotice(null);
    try {
      await api.setObjectRetention(region, bucketName, objectKey, {
        mode,
        retainUntilDate: new Date(`${retainUntil}T00:00:00Z`).toISOString(),
        bypassGovernance,
      });
      setNotice('Retention updated.');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRetention(false);
    }
  }

  async function handleToggleHold() {
    const next = legalHold === 'ON' ? 'OFF' : 'ON';
    setTogglingHold(true);
    setError(null);
    setNotice(null);
    try {
      await api.setObjectLegalHold(region, bucketName, objectKey, next);
      setLegalHold(next);
      setNotice(`Legal hold ${next === 'ON' ? 'enabled' : 'disabled'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setTogglingHold(false);
    }
  }

  if (loading) return <p className="muted small">Loading…</p>;

  const retentionActive = !!retention?.mode && retention.retainUntilDate && new Date(retention.retainUntilDate) > new Date();

  return (
    <div>
      {error && <div className="banner banner-error" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="banner banner-success" style={{ marginBottom: 12 }}>{notice}</div>}

      <div className="detail-block" style={{ marginTop: 0 }}>
        <h3>Retention</h3>
        <p className="muted small">Sets or extends the retention period for this object only.</p>
        <dl className="detail-grid" style={{ marginBottom: 14 }}>
          <dt>State</dt>
          <dd>
            <span className={retentionActive ? 'pill pill-success' : 'pill pill-muted'}>
              {retentionActive ? 'Retention enabled' : 'Retention disabled'}
            </span>
          </dd>
          {retention?.mode && (
            <>
              <dt>Mode</dt>
              <dd>{retention.mode}</dd>
              <dt>Retain until</dt>
              <dd>{retention.retainUntilDate ? new Date(retention.retainUntilDate).toLocaleString() : '—'}</dd>
            </>
          )}
        </dl>

        <form onSubmit={handleSaveRetention} className="rule-editor">
          <div className="field">
            <span className="field-label">Mode</span>
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="GOVERNANCE">Governance</option>
              <option value="COMPLIANCE">Compliance</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="retain-until">Retain until</label>
            <input
              id="retain-until"
              type="date"
              value={retainUntil}
              onChange={(e) => setRetainUntil(e.target.value)}
            />
          </div>
          <label className="radio-row">
            <input
              type="checkbox"
              checked={bypassGovernance}
              onChange={(e) => setBypassGovernance(e.target.checked)}
            />
            Bypass governance (required to shorten an existing GOVERNANCE retention)
          </label>
          <div className="rule-editor-actions">
            <button type="submit" className="btn btn-primary" disabled={savingRetention || !retainUntil}>
              {savingRetention ? 'Saving…' : 'Save retention'}
            </button>
          </div>
        </form>
      </div>

      <div className="detail-block">
        <h3>Legal hold</h3>
        <p className="muted small">
          Blocks deletion or overwriting of this object until the hold is intentionally released, even if the
          retention period above has expired.
        </p>
        <div className="versioning-row">
          <span className={legalHold === 'ON' ? 'pill pill-success' : 'pill pill-muted'}>
            {legalHold === 'ON' ? 'Legal hold enabled' : 'Legal hold disabled'}
          </span>
          <button type="button" className="btn btn-secondary" onClick={handleToggleHold} disabled={togglingHold}>
            {togglingHold ? 'Working…' : legalHold === 'ON' ? 'Disable' : 'Enable'}
          </button>
        </div>
      </div>
    </div>
  );
}
