import { useState } from 'react';
import RegionBadge from './RegionBadge.jsx';
import { useRegion } from '../regionsContext.jsx';

function DestinationOption({ b, onPick }) {
  const region = useRegion(b.region);
  return (
    <li>
      <button type="button" onClick={() => onPick(b.name)}>
        <span>{b.name}</span>
        <span className="bucket-picker-meta">
          <RegionBadge region={region} compact />
          <span className={b.ownership === 'user' ? 'pill pill-user' : 'pill pill-contract'}>
            {b.ownership === 'user' ? 'user-owned' : 'contract-owned'}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function ReplicationEditor({ sourceBucket, rule, destinationOptions, onSave, onCancel, saving }) {
  const sourceRegion = useRegion(sourceBucket.region);
  const [ruleName, setRuleName] = useState(rule?.id || '');
  const [scope, setScope] = useState(rule?.prefix ? 'prefix' : 'all');
  const [prefix, setPrefix] = useState(rule?.prefix || '');
  const [destinationBucket, setDestinationBucket] = useState(rule?.destinationBucket || '');
  const [browsing, setBrowsing] = useState(false);
  const [bidirectional, setBidirectional] = useState(false);
  const [formError, setFormError] = useState(null);

  const matchedDestination = destinationOptions.find((b) => b.name === destinationBucket.trim());
  // Cross-system replication (user-owned Cloudian <-> contract-owned Ceph)
  // is documented as one-way only, so only offer bidirectional within the
  // same backend (both user-owned or both contract-owned).
  const canOfferBidirectional = !rule && matchedDestination?.ownership === sourceBucket.ownership;

  function handleSubmit(e) {
    e.preventDefault();
    if (!ruleName.trim()) {
      setFormError('Give this rule a name.');
      return;
    }
    if (!destinationBucket.trim()) {
      setFormError('Choose a destination bucket.');
      return;
    }
    setFormError(null);
    onSave({
      id: ruleName.trim(),
      status: rule?.status || 'Enabled',
      prefix: scope === 'prefix' ? prefix : '',
      destinationBucket: destinationBucket.trim(),
      bidirectional: canOfferBidirectional && bidirectional,
    });
  }

  return (
    <form className="rule-editor" onSubmit={handleSubmit}>
      <div className="field">
        <span className="field-label">Source bucket region</span>
        <p className="field-static">
          <RegionBadge region={sourceRegion} />
        </p>
      </div>

      <div className="field">
        <label htmlFor="ruleName">Rule name</label>
        <input
          id="ruleName"
          type="text"
          placeholder="rule-name"
          value={ruleName}
          onChange={(e) => setRuleName(e.target.value)}
          disabled={!!rule}
        />
      </div>

      <div className="field">
        <span className="field-label">Replication scope</span>
        <label className="radio-row">
          <input
            type="radio"
            name="scope"
            value="all"
            checked={scope === 'all'}
            onChange={() => setScope('all')}
          />
          All objects in the bucket
        </label>
        <label className="radio-row">
          <input
            type="radio"
            name="scope"
            value="prefix"
            checked={scope === 'prefix'}
            onChange={() => setScope('prefix')}
          />
          Limited objects filtered by prefix
        </label>
        {scope === 'prefix' && (
          <input
            className="prefix-input"
            type="text"
            placeholder="e.g. logs/"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
          />
        )}
      </div>

      <div className="field">
        <label htmlFor="destinationBucket">Destination bucket</label>
        <div className="destination-row">
          <input
            id="destinationBucket"
            type="text"
            placeholder="destination-bucket"
            value={destinationBucket}
            onChange={(e) => setDestinationBucket(e.target.value)}
          />
          <button type="button" className="btn btn-secondary" onClick={() => setBrowsing((v) => !v)}>
            Browse Object Storage
          </button>
        </div>
        {browsing && (
          <ul className="bucket-picker">
            {destinationOptions.length === 0 && <li className="muted">No other buckets found.</li>}
            {destinationOptions.map((b) => (
              <DestinationOption
                key={`${b.region}/${b.name}`}
                b={b}
                onPick={(name) => {
                  setDestinationBucket(name);
                  setBrowsing(false);
                }}
              />
            ))}
          </ul>
        )}
      </div>

      {canOfferBidirectional && (
        <div className="field">
          <label className="radio-row">
            <input
              type="checkbox"
              checked={bidirectional}
              onChange={(e) => setBidirectional(e.target.checked)}
            />
            Make this bidirectional — also replicate from {destinationBucket.trim()} back to this bucket
          </label>
        </div>
      )}

      <div className="info-note">
        <span className="info-note-icon" aria-hidden="true">i</span>
        <div>
          <strong>Please note</strong>
          <p>
            Versioning needs to be enabled for source and destination buckets.
            {canOfferBidirectional && bidirectional && ' Bidirectional replication sets up a matching rule on the destination bucket too.'}
          </p>
        </div>
      </div>

      {formError && <p className="field-error">{formError}</p>}

      <div className="rule-editor-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : rule ? 'Save rule' : 'Add a rule'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
