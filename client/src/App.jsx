import { useEffect, useState, useCallback } from 'react';
import { api } from './api.js';
import BucketList from './components/BucketList.jsx';
import BucketDetail from './components/BucketDetail.jsx';
import ReplicationOverview from './components/ReplicationOverview.jsx';
import CreateBucket from './components/CreateBucket.jsx';
import EnvControls from './components/EnvControls.jsx';
import ionosLogo from './assets/ionos-cloud-logo.png';
import pkg from '../package.json';
import './app.css';
import './components.css';

const NAV_ITEMS = [
  { key: 'overview', label: 'Replication Overview' },
  { key: 'buckets', label: 'Buckets & Replication' },
  { key: 'create', label: 'Create Bucket' },
];

export default function App() {
  const [activeNav, setActiveNav] = useState('overview');

  const [buckets, setBuckets] = useState([]);
  const [regionErrors, setRegionErrors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // { name, region, ownership }

  const loadBuckets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listBuckets();
      setBuckets(data.buckets);
      setRegionErrors(data.regionErrors || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBuckets();
  }, [loadBuckets]);

  function openBucketFromOverview(bucket) {
    setSelected(bucket);
    setActiveNav('buckets');
  }

  async function handleBucketCreated(bucket) {
    await loadBuckets();
    setSelected(bucket);
    setActiveNav('buckets');
  }

  async function handleBucketDeleted() {
    setSelected(null);
    await loadBuckets();
  }

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="brand">
          <img className="brand-logo" src={ionosLogo} alt="IONOS Cloud" />
          <span className="brand-divider" aria-hidden="true" />
          <span className="brand-app-name">Bucket Replication Visualisation and Management Tool</span>
          <span className="version-pill">v{pkg.version}</span>
        </div>
        <EnvControls onCredentialsUpdated={loadBuckets} />
      </header>

      <div className="app-body">
        <nav className="sidebar" aria-label="Primary">
          <ul>
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <button
                  type="button"
                  className={item.key === activeNav ? 'nav-link active' : 'nav-link'}
                  onClick={() => setActiveNav(item.key)}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="content">
          {activeNav === 'overview' && (
            <>
              <div className="content-header">
                <h1>Replication Overview</h1>
                <p>Existing replication relationships across every site and bucket in your account.</p>
              </div>
              <ReplicationOverview onOpenBucket={openBucketFromOverview} />
            </>
          )}

          {activeNav === 'buckets' && (
            <>
              <div className="content-header">
                <h1>Buckets</h1>
                <p>Manage cross-bucket replication for your IONOS Object Storage buckets.</p>
              </div>

              {regionErrors.length > 0 && (
                <div className="banner banner-warning">
                  Couldn&apos;t reach {regionErrors.length} region
                  {regionErrors.length > 1 ? 's' : ''}: {regionErrors.map((r) => r.region).join(', ')}
                </div>
              )}

              <main className="app-main">
                <BucketList
                  buckets={buckets}
                  loading={loading}
                  error={error}
                  selected={selected}
                  onSelect={setSelected}
                  onRefresh={loadBuckets}
                />
                <BucketDetail
                  key={selected ? `${selected.region}/${selected.name}` : 'none'}
                  bucket={selected}
                  allBuckets={buckets}
                  onDeleted={handleBucketDeleted}
                />
              </main>
            </>
          )}

          {activeNav === 'create' && (
            <>
              <div className="content-header">
                <h1>Create Bucket</h1>
                <p>Create a new IONOS Object Storage bucket.</p>
              </div>
              <CreateBucket onCreated={handleBucketCreated} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
