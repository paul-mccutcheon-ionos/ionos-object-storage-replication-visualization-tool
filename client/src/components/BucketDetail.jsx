import { useEffect, useState, useCallback } from 'react';
import { api } from '../api.js';
import ReplicationEditor from './ReplicationEditor.jsx';
import RegionBadge from './RegionBadge.jsx';
import { useRegion } from '../regionsContext.jsx';

function RuleItem({ rule, sourceBucketName, allBuckets, onEdit, onDelete, busy }) {
  const destBucket = allBuckets.find((b) => b.name === rule.destinationBucket);
  const destRegion = useRegion(destBucket?.region);
  const [isBidirectional, setIsBidirectional] = useState(null); // null = unknown/loading

  useEffect(() => {
    let cancelled = false;
    if (!destBucket) {
      setIsBidirectional(null);
      return undefined;
    }
    api
      .getReplication(destBucket.region, destBucket.name)
      .then((data) => {
        if (cancelled) return;
        setIsBidirectional(data.rules.some((r) => r.destinationBucket === sourceBucketName));
      })
      .catch(() => {
        if (!cancelled) setIsBidirectional(null);
      });
    return () => {
      cancelled = true;
    };
  }, [destBucket, sourceBucketName]);

  return (
    <li className="rule-item">
      <div className="rule-item-main">
        <div className="rule-item-status-row">
          <span className={rule.status === 'Enabled' ? 'pill pill-success' : 'pill pill-muted'}>{rule.status}</span>
          <span
            className={isBidirectional ? 'rule-arrow rule-arrow-bidirectional' : 'rule-arrow'}
            title={isBidirectional ? 'Bidirectional' : 'One-way'}
          >
            {isBidirectional ? '⇄' : '→'}
          </span>
          {isBidirectional && <span className="pill pill-user">Bidirectional</span>}
        </div>
        <h4 className="rule-dest-name">{rule.destinationBucket}</h4>
        {destBucket && (
          <div className="bucket-detail-subhead">
            <RegionBadge region={destRegion} />
            <span className={destBucket.ownership === 'user' ? 'pill pill-user' : 'pill pill-contract'}>
              {destBucket.ownership === 'user' ? 'user-owned' : 'contract-owned'}
            </span>
          </div>
        )}
        <p className="muted small">Prefix: {rule.prefix ? rule.prefix : '(all objects)'}</p>
      </div>
      <div className="rule-item-actions">
        <button type="button" className="btn btn-ghost" onClick={onEdit} disabled={busy}>
          Edit
        </button>
        <button type="button" className="btn btn-danger" onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </li>
  );
}

export default function BucketDetail({ bucket, allBuckets }) {
  const region = useRegion(bucket?.region);
  const [versioning, setVersioning] = useState(null);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingRule, setEditingRule] = useState(null); // null | 'new' | rule

  const load = useCallback(async () => {
    if (!bucket) return;
    setLoading(true);
    setError(null);
    try {
      const [v, r] = await Promise.all([
        api.getVersioning(bucket.region, bucket.name),
        api.getReplication(bucket.region, bucket.name),
      ]);
      setVersioning(v.status);
      setRules(r.rules);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [bucket]);

  useEffect(() => {
    load();
  }, [load]);

  if (!bucket) {
    return (
      <section className="bucket-detail-panel empty">
        <p className="muted">Select a bucket to view or configure replication.</p>
      </section>
    );
  }

  // IONOS's docs say only user-owned buckets can be a replication source,
  // but that's being tested against real accounts as whitelisting rolls out
  // - so this no longer gates the UI. If a bucket genuinely can't be a
  // source, IONOS's API will reject the PutBucketReplication call with a
  // clear error instead.
  const canBeSource = true;
  const versioningEnabled = versioning === 'Enabled';

  async function handleEnableVersioning() {
    setBusy(true);
    setError(null);
    try {
      await api.setVersioning(bucket.region, bucket.name, 'Enabled');
      setVersioning('Enabled');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function persistRules(nextRules) {
    setBusy(true);
    setError(null);
    try {
      if (nextRules.length === 0) {
        await api.deleteReplication(bucket.region, bucket.name);
      } else {
        await api.setReplication(bucket.region, bucket.name, nextRules);
      }
      setRules(nextRules);
      setEditingRule(null);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  // Adds (or refreshes) a rule on the destination bucket that points back at
  // this bucket, so the pair replicates in both directions.
  //
  // IONOS only allows a single destination bucket across all of a bucket's
  // replication rules (confirmed via its own "The destination bucket must
  // be same for all rules" error) - so if the destination already
  // replicates somewhere else, we can't just merge the reverse rule in.
  async function createReverseRule(rule) {
    const destBucket = allBuckets.find((b) => b.name === rule.destinationBucket);
    if (!destBucket) {
      setError(`Saved the rule, but couldn't find "${rule.destinationBucket}" to set up the reverse direction.`);
      return;
    }
    setBusy(true);
    try {
      const existing = await api.getReplication(destBucket.region, destBucket.name);
      const conflicting = existing.rules.find((r) => r.destinationBucket !== bucket.name);
      if (conflicting) {
        setError(
          `Saved this bucket's rule, but couldn't set up the reverse direction: "${destBucket.name}" already ` +
            `replicates to "${conflicting.destinationBucket}", and IONOS only allows one destination per bucket.`,
        );
        return;
      }
      const reverseId = `${rule.id}-reverse`;
      const reverseRule = {
        id: reverseId,
        status: 'Enabled',
        prefix: rule.prefix,
        destinationBucket: bucket.name,
      };
      const nextDestRules = [...existing.rules.filter((r) => r.id !== reverseId), reverseRule];
      await api.setReplication(destBucket.region, destBucket.name, nextDestRules);
    } catch (err) {
      setError(`Saved this bucket's rule, but the reverse rule on "${destBucket.name}" failed: ${err.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveRule(ruleWithOptions) {
    const { bidirectional, ...rule } = ruleWithOptions;
    const isNew = !rule.id || editingRule === 'new';

    // IONOS only allows one destination bucket across all of a bucket's
    // replication rules - block early with a clear message rather than
    // letting the API reject it.
    const conflicting = rules.find((r) => r.id !== rule.id && r.destinationBucket !== rule.destinationBucket);
    if (conflicting) {
      setError(
        `This bucket already replicates to "${conflicting.destinationBucket}", and IONOS only allows one ` +
          'destination per bucket - delete the existing rule first if you want to switch destinations.',
      );
      return;
    }

    const nextRules = isNew
      ? [...rules, { ...rule, id: rule.id || `rule-${Date.now()}` }]
      : rules.map((r) => (r.id === rule.id ? rule : r));

    const ok = await persistRules(nextRules);
    if (ok && bidirectional) {
      await createReverseRule(rule);
    }
  }

  function handleDeleteRule(ruleId) {
    persistRules(rules.filter((r) => r.id !== ruleId));
  }

  const destinationOptions = allBuckets.filter(
    (b) => !(b.name === bucket.name && b.region === bucket.region),
  );

  return (
    <section className="bucket-detail-panel">
      <div className="panel-header">
        <div>
          <h2>{bucket.name}</h2>
          <div className="bucket-detail-subhead">
            <RegionBadge region={region} />
            <span className={bucket.ownership === 'user' ? 'pill pill-user' : 'pill pill-contract'}>
              {bucket.ownership === 'user' ? 'user-owned' : 'contract-owned'}
            </span>
          </div>
        </div>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      <div className="detail-block">
        <h3>Versioning</h3>
        {loading ? (
          <p className="muted">Loading…</p>
        ) : (
          <div className="versioning-row">
            <span className={versioningEnabled ? 'pill pill-success' : 'pill pill-warning'}>
              {versioning || 'Unknown'}
            </span>
            {!versioningEnabled && canBeSource && (
              <button type="button" className="btn btn-secondary" onClick={handleEnableVersioning} disabled={busy}>
                Enable versioning
              </button>
            )}
          </div>
        )}
        {!versioningEnabled && (
          <p className="muted small">Versioning must be enabled on both source and destination buckets for replication to work.</p>
        )}
      </div>

      <div className="detail-block">
        <div className="detail-block-header">
          <h3>Replication rules</h3>
          {canBeSource && editingRule === null && (
            <button type="button" className="btn btn-primary" onClick={() => setEditingRule('new')} disabled={busy}>
              Add rule
            </button>
          )}
        </div>

        {loading ? (
          <p className="muted">Loading…</p>
        ) : rules.length === 0 && editingRule !== 'new' ? (
          <p className="muted">No replication rules configured.</p>
        ) : (
          <ul className="rule-list">
            {rules.map((rule) =>
              editingRule && editingRule.id === rule.id ? (
                <li key={rule.id}>
                  <ReplicationEditor
                    sourceBucket={bucket}
                    rule={rule}
                    destinationOptions={destinationOptions}
                    onSave={handleSaveRule}
                    onCancel={() => setEditingRule(null)}
                    saving={busy}
                  />
                </li>
              ) : (
                <RuleItem
                  key={rule.id}
                  rule={rule}
                  sourceBucketName={bucket.name}
                  allBuckets={allBuckets}
                  onEdit={() => setEditingRule(rule)}
                  onDelete={() => handleDeleteRule(rule.id)}
                  busy={busy}
                />
              ),
            )}
          </ul>
        )}

        {editingRule === 'new' && (
          <ReplicationEditor
            sourceBucket={bucket}
            destinationOptions={destinationOptions}
            onSave={handleSaveRule}
            onCancel={() => setEditingRule(null)}
            saving={busy}
          />
        )}
      </div>
    </section>
  );
}
