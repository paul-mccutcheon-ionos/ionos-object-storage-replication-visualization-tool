import { useState } from 'react';
import { api } from '../api.js';
import RegionBadge from './RegionBadge.jsx';
import { useAllRegions } from '../regionsContext.jsx';

const USER_OWNED_ORDER = ['eu-central-2', 'de', 'eu-south-2'];
const CONTRACT_OWNED_ORDER = ['eu-central-3', 'eu-central-4', 'us-central-1'];

function orderRegions(regions, order) {
  const byCode = new Map(regions.map((r) => [r.code, r]));
  return order.map((code) => byCode.get(code)).filter(Boolean);
}

function RegionOption({ region, checked, onSelect }) {
  return (
    <label className={checked ? 'region-option region-option-checked' : 'region-option'}>
      <input type="radio" name="bucket-region" checked={checked} onChange={() => onSelect(region.code)} />
      <RegionBadge region={region} />
    </label>
  );
}

export default function CreateBucket({ onCreated }) {
  const regions = useAllRegions();
  const contractRegions = orderRegions(regions, CONTRACT_OWNED_ORDER);
  const userRegions = orderRegions(regions, USER_OWNED_ORDER);

  const [region, setRegion] = useState('eu-central-3');
  const [name, setName] = useState('');
  const [objectLockEnabled, setObjectLockEnabled] = useState(false);
  const [lockMode, setLockMode] = useState('GOVERNANCE'); // 'none' | 'GOVERNANCE' | 'COMPLIANCE'
  const [retentionValue, setRetentionValue] = useState(1);
  const [retentionUnit, setRetentionUnit] = useState('Days');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null);
  const [success, setSuccess] = useState(null);

  function resetForm() {
    setName('');
    setObjectLockEnabled(false);
    setLockMode('GOVERNANCE');
    setRetentionValue(1);
    setRetentionUnit('Days');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError(null);
    setSuccess(null);

    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(name)) {
      setFormError('Choose a name that is 3-63 characters: lowercase letters, digits, hyphens or dots.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.createBucket({
        name,
        region,
        objectLock: objectLockEnabled
          ? { enabled: true, mode: lockMode, retentionValue, retentionUnit }
          : { enabled: false },
      });
      setSuccess(`Bucket "${result.bucket.name}" created.`);
      resetForm();
      onCreated?.(result.bucket);
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="create-bucket-form" onSubmit={handleSubmit}>
      <div className="wizard-step">
        <div className="wizard-step-header">
          <span className="wizard-step-number">1</span>
          <h3>Bucket region</h3>
        </div>

        <div className="region-group">
          <div className="region-group-header">
            <strong>Contract-owned bucket</strong>
            <span className="pill pill-user">Recommended</span>
          </div>
          <ul className="region-group-notes">
            <li>Preferred option for users within a single organization.</li>
            <li>Every contract user can see the list of contract-owned buckets.</li>
            <li>Only the contract owner or admins can grant access to view or manage these buckets.</li>
          </ul>
          <div className="region-option-row">
            {contractRegions.map((r) => (
              <RegionOption key={r.code} region={r} checked={region === r.code} onSelect={setRegion} />
            ))}
          </div>
        </div>

        <div className="region-group">
          <div className="region-group-header">
            <strong>User-owned bucket</strong>
          </div>
          <ul className="region-group-notes">
            <li>Your bucket list is not accessible to other contract users.</li>
            <li>You can grant others permission to manage your buckets.</li>
            <li>Others must use third-party applications to access buckets.</li>
          </ul>
          <div className="region-option-row">
            {userRegions.map((r) => (
              <RegionOption key={r.code} region={r} checked={region === r.code} onSelect={setRegion} />
            ))}
          </div>
        </div>
      </div>

      <div className="wizard-step">
        <div className="wizard-step-header">
          <span className="wizard-step-number">2</span>
          <h3>Bucket name</h3>
        </div>
        <div className="field">
          <input
            type="text"
            placeholder="my-bucket-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="muted small">
            Choose a name that is unique across all IONOS Object Storage regions. 3-63 characters: lowercase
            letters, digits, hyphens or dots.
          </p>
        </div>
      </div>

      <div className="wizard-step">
        <div className="wizard-step-header">
          <span className="wizard-step-number">3</span>
          <h3>Object Lock (optional)</h3>
        </div>
        <p className="muted small">
          Object Lock sets retention periods in which alterations of objects are suspended. Ideal for securing
          your data from deletion for regulatory compliance and legal needs. It can only be enabled within this
          creation step.
        </p>

        <label className="radio-row" style={{ marginTop: 10 }}>
          <input
            type="checkbox"
            checked={objectLockEnabled}
            onChange={(e) => setObjectLockEnabled(e.target.checked)}
          />
          Enable Object Lock
        </label>

        {objectLockEnabled && (
          <>
            <div className="info-note" style={{ marginTop: 12 }}>
              <span className="info-note-icon" aria-hidden="true">
                i
              </span>
              <div>
                <strong>Object Lock can only be enabled now when you create the bucket</strong>
                <p>There is no option to enable Object Lock for already created buckets.</p>
                <strong style={{ marginTop: 8, display: 'block' }}>
                  Object Lock will enable Versioning for this bucket automatically
                </strong>
                <p>It is not possible to use Object Lock without Versioning.</p>
              </div>
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <span className="field-label">Select the mode for your Object Lock</span>
              <p className="muted small">
                The following mode will be applied to objects uploaded into this bucket until the specified
                retention date expires.
              </p>
              <label className="radio-row">
                <input
                  type="radio"
                  name="lock-mode"
                  checked={lockMode === 'none'}
                  onChange={() => setLockMode('none')}
                />
                <strong>No default retention</strong>&nbsp;- enables seamless integration with backup software,
                including Veeam, by bypassing retention settings.
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="lock-mode"
                  checked={lockMode === 'GOVERNANCE'}
                  onChange={() => setLockMode('GOVERNANCE')}
                />
                <strong>Governance mode</strong>&nbsp;- allows a bucket owner and users with
                "s3:BypassGovernanceRetention" permission to override the lock settings. Ideal for flexible
                control.
              </label>
              <label className="radio-row">
                <input
                  type="radio"
                  name="lock-mode"
                  checked={lockMode === 'COMPLIANCE'}
                  onChange={() => setLockMode('COMPLIANCE')}
                />
                <strong>Compliance mode</strong>&nbsp;- enforces a strict lock without any possibility of an
                override. Suited for regulatory and legal mandates.
              </label>
            </div>

            {lockMode !== 'none' && (
              <div className="field">
                <span className="field-label">Retention period</span>
                <p className="muted small">Set a retention period of up to 365 days.</p>
                <div className="destination-row">
                  <input
                    type="number"
                    min="1"
                    value={retentionValue}
                    onChange={(e) => setRetentionValue(e.target.value)}
                    style={{ maxWidth: 100 }}
                  />
                  <select value={retentionUnit} onChange={(e) => setRetentionUnit(e.target.value)}>
                    <option value="Days">Days</option>
                    <option value="Years">Years</option>
                  </select>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {formError && <div className="banner banner-error">{formError}</div>}
      {success && <div className="banner banner-success">{success}</div>}

      <div className="rule-editor-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Creating…' : 'Create bucket'}
        </button>
        <button type="button" className="btn btn-outline" onClick={resetForm} disabled={submitting}>
          Cancel
        </button>
      </div>
    </form>
  );
}
