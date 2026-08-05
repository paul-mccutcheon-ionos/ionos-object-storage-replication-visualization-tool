import RegionBadge from './RegionBadge.jsx';
import { useRegion } from '../regionsContext.jsx';

function BucketRow({ b, isSelected, onSelect }) {
  const region = useRegion(b.region);
  return (
    <li>
      <button type="button" className={isSelected ? 'bucket-item active' : 'bucket-item'} onClick={() => onSelect(b)}>
        <span className="bucket-name">{b.name}</span>
        <span className="bucket-meta">
          <RegionBadge region={region} compact />
          <span className={b.ownership === 'user' ? 'pill pill-user' : 'pill pill-contract'}>
            {b.ownership === 'user' ? 'user-owned' : 'contract-owned'}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function BucketList({ buckets, loading, error, selected, onSelect, onRefresh }) {
  return (
    <section className="bucket-list-panel">
      <div className="panel-header">
        <h2>Buckets</h2>
        <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {error && <div className="banner banner-error">{error}</div>}

      {!loading && buckets.length === 0 && !error && (
        <p className="muted">No buckets found across any region.</p>
      )}

      <ul className="bucket-list">
        {buckets.map((b) => {
          const isSelected = selected && selected.name === b.name && selected.region === b.region;
          return <BucketRow key={`${b.region}/${b.name}`} b={b} isSelected={isSelected} onSelect={onSelect} />;
        })}
      </ul>
    </section>
  );
}
