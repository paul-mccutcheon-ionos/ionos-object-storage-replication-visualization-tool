import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from 'react';
import { api } from '../api.js';
import RegionBadge from './RegionBadge.jsx';
import { useRegion } from '../regionsContext.jsx';

function ColumnHeader({ col }) {
  const region = useRegion(col.region);
  return (
    <div className="overview-column-header">
      <RegionBadge region={region} compact />
      <span className={col.ownership === 'user' ? 'pill pill-user' : 'pill pill-contract'}>
        {col.ownership === 'user' ? 'user-owned' : 'contract-owned'}
      </span>
    </div>
  );
}

const NODE_HEIGHT = 40;
const NODE_GAP = 14;

function nodeKey(name, region) {
  return `${region}/${name}`;
}

export default function ReplicationOverview({ onOpenBucket }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [paths, setPaths] = useState([]);
  const innerRef = useRef(null);
  const nodeRefs = useRef(new Map());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getReplicationOverview();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const buckets = data?.buckets || [];
  const edges = data?.edges || [];
  const bucketErrors = data?.bucketErrors || [];

  // Group buckets into columns, one per region, in a stable order.
  const regionOrder = [];
  buckets.forEach((b) => {
    if (!regionOrder.includes(b.region)) regionOrder.push(b.region);
  });
  const columns = regionOrder.map((region) => ({
    region,
    ownership: buckets.find((b) => b.region === region)?.ownership,
    buckets: buckets.filter((b) => b.region === region),
  }));

  // Dedupe A->B and B->A into a single bidirectional edge. Memoized so this
  // array keeps a stable reference across renders that don't change `edges` -
  // otherwise recomputePaths (which depends on it) gets a new identity every
  // render, retriggering the layout effect below in an infinite loop.
  const pairEdges = useMemo(() => {
    const result = [];
    const seen = new Set();
    edges.forEach((edge) => {
      if (!edge.destination.region) return; // destination not visible in this account view
      const a = nodeKey(edge.source.name, edge.source.region);
      const b = nodeKey(edge.destination.name, edge.destination.region);
      const key = [a, b].sort().join('|');
      if (seen.has(key)) {
        const existing = result.find((p) => [p.a, p.b].sort().join('|') === key);
        if (existing) existing.bidirectional = true;
        return;
      }
      seen.add(key);
      result.push({ a, b, from: edge, bidirectional: false });
    });
    return result;
  }, [edges]);

  const recomputePaths = useCallback(() => {
    const inner = innerRef.current;
    if (!inner) return;
    // Measure against the inner content wrapper, not the scrolling viewport,
    // so coordinates stay valid (and the SVG covers the full diagram) no
    // matter how far the container is scrolled horizontally.
    const innerRect = inner.getBoundingClientRect();

    function centerOf(key) {
      const el = nodeRefs.current.get(key);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        left: r.left - innerRect.left,
        right: r.right - innerRect.left,
        top: r.top - innerRect.top + r.height / 2,
      };
    }

    const nextPaths = pairEdges
      .map((pe) => {
        const from = centerOf(pe.a);
        const to = centerOf(pe.b);
        if (!from || !to) return null;
        const forward = from.right <= to.left;
        const x1 = forward ? from.right : from.left;
        const x2 = forward ? to.left : to.right;
        const y1 = from.top;
        const y2 = to.top;
        const dx = Math.max(Math.abs(x2 - x1) * 0.5, 40);
        const cx1 = x1 + (forward ? dx : -dx);
        const cx2 = x2 - (forward ? dx : -dx);
        const path = `M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`;
        return {
          key: `${pe.a}->${pe.b}`,
          path,
          bidirectional: pe.bidirectional,
          disabled: pe.from.status !== 'Enabled',
        };
      })
      .filter(Boolean);

    setPaths(nextPaths);
  }, [pairEdges]);

  useLayoutEffect(() => {
    recomputePaths();
  }, [recomputePaths, buckets, edges, loading]);

  useEffect(() => {
    const inner = innerRef.current;
    if (!inner || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => recomputePaths());
    observer.observe(inner);
    return () => observer.disconnect();
  }, [recomputePaths]);

  if (loading) {
    return <p className="muted">Loading replication overview…</p>;
  }

  if (error) {
    return <div className="banner banner-error">{error}</div>;
  }

  if (buckets.length === 0) {
    return <p className="muted">No buckets found across any region.</p>;
  }

  return (
    <div className="overview-wrap">
      {bucketErrors.length > 0 && (
        <div className="banner banner-warning" style={{ marginBottom: 16 }}>
          Couldn&apos;t read replication rules for {bucketErrors.length} bucket
          {bucketErrors.length > 1 ? 's' : ''} ({bucketErrors.map((e) => e.bucket).join(', ')}) - some arrows below
          may be missing. Try refreshing.
        </div>
      )}
      {pairEdges.length === 0 && (
        <p className="muted" style={{ marginBottom: 16 }}>
          No replication rules are configured yet across any bucket.
        </p>
      )}
      <div className="overview-diagram">
        <div className="overview-diagram-inner" ref={innerRef}>
          <svg className="overview-svg" aria-hidden="true">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="arrow-head" />
              </marker>
            </defs>
            {paths.map((p) => (
              <path
                key={p.key}
                d={p.path}
                className={p.disabled ? 'edge-path edge-disabled' : 'edge-path'}
                markerEnd="url(#arrow)"
                markerStart={p.bidirectional ? 'url(#arrow)' : undefined}
              />
            ))}
          </svg>

          <div className="overview-columns">
            {columns.map((col) => (
              <div className="overview-column" key={col.region}>
                <ColumnHeader col={col} />
                <div className="overview-column-nodes" style={{ gap: NODE_GAP }}>
                  {col.buckets.map((b) => {
                    const key = nodeKey(b.name, b.region);
                    return (
                      <button
                        type="button"
                        key={key}
                        className="overview-node"
                        style={{ height: NODE_HEIGHT }}
                        ref={(el) => {
                          if (el) nodeRefs.current.set(key, el);
                          else nodeRefs.current.delete(key);
                        }}
                        onClick={() => onOpenBucket(b)}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="muted small" style={{ marginTop: 12 }}>
        Arrows show source → destination replication. Double-headed arrows indicate bidirectional replication. Click a
        bucket to manage its replication rules.
      </p>
    </div>
  );
}
