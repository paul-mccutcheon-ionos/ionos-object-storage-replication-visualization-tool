import { FLAGS } from './flags.jsx';

// Matches the "Bucket region" picker in DCD: a circular flag icon followed
// by "Country / City" text (region code shown as a secondary detail).
export default function RegionBadge({ region, compact = false }) {
  if (!region) return null;
  const Flag = FLAGS[region.country];

  return (
    <span className={compact ? 'region-badge region-badge-compact' : 'region-badge'}>
      <span className="region-flag-circle" role="img" aria-label={region.countryName}>
        {Flag ? <Flag /> : null}
      </span>
      <span className="region-badge-text">
        <span className="region-badge-place">
          {region.countryName} / {region.city}
        </span>
        {!compact && <span className="region-badge-code">{region.code}</span>}
      </span>
    </span>
  );
}
