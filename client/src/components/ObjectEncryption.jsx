import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api.js';
import RegionBadge from './RegionBadge.jsx';
import Modal from './Modal.jsx';
import ObjectAclEditor from './ObjectAclEditor.jsx';
import ObjectLockPanel from './ObjectLockPanel.jsx';
import { useRegion } from '../regionsContext.jsx';

function formatBytes(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

// Generates a fresh 256-bit SSE-C key entirely client-side, so the raw key
// material never touches the network until the user explicitly chooses to
// use or upload it.
function generateKeyBase64() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function buildObjectUrl(endpoint, bucketName, key) {
  const encodedKey = key
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${endpoint}/${bucketName}/${encodedKey}`;
}

function downloadTextFile(filename, content) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function KeyManagement({ status, onStatusChange }) {
  const fileInputRef = useRef(null);
  const [generatedKey, setGeneratedKey] = useState(null); // base64, shown once
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  function handleGenerate() {
    setGeneratedKey(generateKeyBase64());
    setError(null);
    setNotice(null);
  }

  function handleDownloadGenerated() {
    downloadTextFile('sse-c-key.env', `IONOS_SSE_C_KEY=${generatedKey}\n`);
  }

  async function handleUseGenerated() {
    setBusy(true);
    setError(null);
    try {
      const result = await api.uploadSseKey(`IONOS_SSE_C_KEY=${generatedKey}`);
      onStatusChange({ configured: true, fingerprint: result.fingerprint });
      setNotice('Key is now configured on this server for uploads/downloads.');
      setGeneratedKey(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const content = await file.text();
      const result = await api.uploadSseKey(content);
      onStatusChange({ configured: true, fingerprint: result.fingerprint });
      setNotice('Key uploaded and configured on this server.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleClear() {
    if (!window.confirm('Remove the configured encryption key from this server? Objects encrypted with it will no longer be downloadable until the key is re-uploaded.')) {
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.clearSseKey();
      onStatusChange({ configured: false, fingerprint: null });
      setNotice('Key removed from this server.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="bucket-detail-panel">
      <div className="panel-header">
        <h2>Encryption key</h2>
        {status.configured ? (
          <span className="pill pill-purple">Configured · {status.fingerprint}</span>
        ) : (
          <span className="pill pill-muted">Not configured</span>
        )}
      </div>

      <div className="info-note">
        <span className="info-note-icon" aria-hidden="true">
          i
        </span>
        <div>
          <strong>SSE-C uses a single secret key, not a public/private key pair</strong>
          <p>
            Whoever holds this key can both encrypt and decrypt objects with it. If it's lost, any object encrypted
            with it becomes permanently unreadable - IONOS never stores a copy. If it leaks, treat every object
            encrypted with it as exposed. Keep it out of source control, chat, and shared drives.
          </p>
        </div>
      </div>

      {error && <div className="banner banner-error" style={{ marginTop: 12 }}>{error}</div>}
      {notice && <div className="banner banner-success" style={{ marginTop: 12 }}>{notice}</div>}

      {generatedKey && (
        <div className="rule-editor" style={{ marginTop: 12 }}>
          <div className="field">
            <span className="field-label">New key (shown once - save it now)</span>
            <code style={{ wordBreak: 'break-all', fontSize: 12 }}>{generatedKey}</code>
          </div>
          <div className="rule-editor-actions">
            <button type="button" className="btn btn-primary" onClick={handleDownloadGenerated}>
              Download .env file
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleUseGenerated} disabled={busy}>
              {busy ? 'Configuring…' : 'Use this key now'}
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setGeneratedKey(null)} disabled={busy}>
              Discard
            </button>
          </div>
        </div>
      )}

      <div className="rule-editor-actions" style={{ marginTop: 16 }}>
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={busy}>
          Generate new key
        </button>
        <button type="button" className="btn btn-secondary" onClick={handleUploadClick} disabled={busy}>
          Upload key file
        </button>
        {status.configured && (
          <button type="button" className="btn btn-danger" onClick={handleClear} disabled={busy}>
            Remove from server
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".env,text/plain"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
      </div>
    </section>
  );
}

function BucketPickerRow({ b, onPick }) {
  const region = useRegion(b.region);
  return (
    <li>
      <button type="button" onClick={() => onPick(b)}>
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

function EncryptionPill({ object }) {
  if (object.encrypted === true) return <span className="pill pill-purple">SSE-C Encrypted</span>;
  if (object.encrypted === false && object.serverManaged) return <span className="pill pill-user">Server-managed</span>;
  if (object.encrypted === false) return <span className="pill pill-muted">Unencrypted</span>;
  return <span className="pill pill-warning" title={object.error}>Unknown</span>;
}

function ObjectActionsMenu({ onObjectSettings, onVersions, onAcl, onCopyUrl, onObjectLock }) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState(null); // { top, right } in viewport coords, for the portalled menu
  const buttonRef = useRef(null);
  const menuRef = useRef(null);

  function openMenu() {
    const rect = buttonRef.current.getBoundingClientRect();
    setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return undefined;
    function handleClick(e) {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target) &&
        menuRef.current &&
        !menuRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    function handleClose() {
      setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    // The menu is portalled to <body> with fixed coords computed once on open,
    // so close it on scroll/resize rather than trying to track and reposition
    // it live (the table body it's anchored to scrolls independently too).
    window.addEventListener('scroll', handleClose, true);
    window.addEventListener('resize', handleClose);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      window.removeEventListener('scroll', handleClose, true);
      window.removeEventListener('resize', handleClose);
    };
  }, [open]);

  function pick(fn) {
    setOpen(false);
    fn();
  }

  return (
    <div className="object-actions-cell">
      <button
        type="button"
        className="icon-btn"
        ref={buttonRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-label="More actions"
      >
        ⋮
      </button>
      {open &&
        menuPos &&
        createPortal(
          <div
            className="dropdown-menu dropdown-menu-portal"
            ref={menuRef}
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            <button type="button" onClick={() => pick(onObjectSettings)}>
              Object Settings
            </button>
            <button type="button" onClick={() => pick(onVersions)}>
              Versions
            </button>
            <button type="button" onClick={() => pick(onAcl)}>
              Access Control List (ACL)
            </button>
            {onObjectLock && (
              <button type="button" onClick={() => pick(onObjectLock)}>
                Object Lock
              </button>
            )}
            <button type="button" onClick={() => pick(onCopyUrl)}>
              Copy URL
            </button>
          </div>,
          document.body,
        )}
    </div>
  );
}

function ObjectBrowser({ buckets, sseConfigured, objectLockBuckets }) {
  const [bucket, setBucket] = useState(null);
  const bucketRegion = useRegion(bucket?.region);
  const bucketHasObjectLock = !!(bucket && objectLockBuckets?.has(bucket.name));
  const [browsing, setBrowsing] = useState(false);
  const [objects, setObjects] = useState([]);
  const [nextToken, setNextToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [adHocKey, setAdHocKey] = useState('');
  const [downloadingKey, setDownloadingKey] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [deletingKey, setDeletingKey] = useState(null);
  const [notice, setNotice] = useState(null);

  const [settingsObject, setSettingsObject] = useState(null);
  const [versionsObject, setVersionsObject] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsError, setVersionsError] = useState(null);
  const [aclObject, setAclObject] = useState(null);
  const [lockObject, setLockObject] = useState(null);

  const [uploadFile, setUploadFile] = useState(null);
  const [uploadKey, setUploadKey] = useState('');
  const [uploadEncrypt, setUploadEncrypt] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const uploadInputRef = useRef(null);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const load = useCallback(async (b, token) => {
    if (!b) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.listObjects(b.region, b.name, { continuationToken: token });
      setObjects((prev) => (token ? [...prev, ...data.objects] : data.objects));
      setNextToken(data.nextContinuationToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  function pickBucket(b) {
    setBucket(b);
    setBrowsing(false);
    setObjects([]);
    setNextToken(null);
    setDownloadError(null);
    load(b, null);
  }

  async function handleDownload(object) {
    setDownloadError(null);
    setDownloadingKey(object.key);
    try {
      const { blob, filename } = await api.downloadObject(bucket.region, bucket.name, object.key, adHocKey || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(`"${object.key}": ${err.message}`);
    } finally {
      setDownloadingKey(null);
    }
  }

  async function handleDelete(object) {
    if (!window.confirm(`Delete "${object.key}" from "${bucket.name}"? This can't be undone.`)) return;
    setDownloadError(null);
    setDeletingKey(object.key);
    try {
      await api.deleteObject(bucket.region, bucket.name, object.key);
      setObjects((prev) => prev.filter((o) => o.key !== object.key));
      setNotice(`Deleted "${object.key}".`);
    } catch (err) {
      setDownloadError(`"${object.key}": ${err.message}`);
    } finally {
      setDeletingKey(null);
    }
  }

  async function handleShowVersions(object) {
    setVersionsObject(object);
    setVersions([]);
    setVersionsError(null);
    setVersionsLoading(true);
    try {
      const data = await api.getObjectVersions(bucket.region, bucket.name, object.key);
      setVersions(data.versions || []);
    } catch (err) {
      setVersionsError(err.message);
    } finally {
      setVersionsLoading(false);
    }
  }

  async function handleCopyUrl(object) {
    const url = buildObjectUrl(bucketRegion?.endpoint || '', bucket.name, object.key);
    try {
      await navigator.clipboard.writeText(url);
      setNotice('URL copied to clipboard.');
    } catch {
      setNotice(url); // clipboard API unavailable - show the URL itself so it can be copied manually
    }
  }

  function handleUploadFileChange(e) {
    const file = e.target.files?.[0] || null;
    setUploadFile(file);
    if (file && !uploadKey) setUploadKey(file.name);
  }

  async function handleUpload(e) {
    e.preventDefault();
    if (!uploadFile || !uploadKey.trim()) return;
    setUploading(true);
    setUploadError(null);
    try {
      await api.uploadObject(bucket.region, bucket.name, uploadKey.trim(), uploadFile, uploadEncrypt);
      setUploadFile(null);
      setUploadKey('');
      setUploadEncrypt(false);
      if (uploadInputRef.current) uploadInputRef.current.value = '';
      await load(bucket, null);
      setNextToken(null);
    } catch (err) {
      setUploadError(err.message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="bucket-detail-panel" style={{ marginTop: 20 }}>
      <div className="panel-header">
        <h2>Bucket object browser</h2>
      </div>

      <div className="field">
        <label htmlFor="encryption-bucket">Bucket</label>
        <div className="destination-row">
          <input
            id="encryption-bucket"
            type="text"
            readOnly
            placeholder="Choose a bucket to browse"
            value={bucket ? bucket.name : ''}
            onClick={() => setBrowsing((v) => !v)}
          />
          <button type="button" className="btn btn-secondary" onClick={() => setBrowsing((v) => !v)}>
            Browse Object Storage
          </button>
        </div>
        {browsing && (
          <ul className="bucket-picker">
            {buckets.length === 0 && <li className="muted">No buckets found.</li>}
            {buckets.map((b) => (
              <BucketPickerRow key={`${b.region}/${b.name}`} b={b} onPick={pickBucket} />
            ))}
          </ul>
        )}
      </div>

      {bucket && (
        <>
          <div className="field" style={{ marginTop: 14 }}>
            <span className="field-label">Ad hoc key for downloads (optional)</span>
            <input
              type="text"
              placeholder={sseConfigured ? 'Leave blank to use the configured server key' : 'Paste a base64 key to test a download'}
              value={adHocKey}
              onChange={(e) => setAdHocKey(e.target.value)}
            />
            <p className="muted small">Used only for downloads on this page; it's never saved.</p>
          </div>

          {error && <div className="banner banner-error" style={{ marginTop: 12 }}>{error}</div>}
          {downloadError && <div className="banner banner-error" style={{ marginTop: 12 }}>{downloadError}</div>}
          {notice && <div className="banner banner-success" style={{ marginTop: 12 }}>{notice}</div>}

          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table className="object-table">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Size</th>
                  <th>Last modified</th>
                  <th>Encryption</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {objects.map((o) => (
                  <tr key={o.key}>
                    <td className="object-key-cell">{o.key}</td>
                    <td>{formatBytes(o.size)}</td>
                    <td>{formatDate(o.lastModified)}</td>
                    <td>
                      <EncryptionPill object={o} />
                    </td>
                    <td>
                      <div className="object-row-actions">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => handleDownload(o)}
                          disabled={downloadingKey === o.key}
                        >
                          {downloadingKey === o.key ? 'Downloading…' : 'Download'}
                        </button>
                        <button
                          type="button"
                          className="icon-btn icon-btn-danger"
                          onClick={() => handleDelete(o)}
                          disabled={deletingKey === o.key}
                          title="Delete object"
                          aria-label="Delete object"
                        >
                          {deletingKey === o.key ? '…' : '✕'}
                        </button>
                        <ObjectActionsMenu
                          onObjectSettings={() => setSettingsObject(o)}
                          onVersions={() => handleShowVersions(o)}
                          onAcl={() => setAclObject(o)}
                          onObjectLock={bucketHasObjectLock ? () => setLockObject(o) : null}
                          onCopyUrl={() => handleCopyUrl(o)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && objects.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No objects in this bucket.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {loading && <p className="muted small" style={{ marginTop: 8 }}>Loading…</p>}
          {nextToken && !loading && (
            <button type="button" className="btn btn-secondary" style={{ marginTop: 10 }} onClick={() => load(bucket, nextToken)}>
              Load more
            </button>
          )}

          <div className="detail-block">
            <h3>Upload object</h3>
            <p className="muted small">
              Encryption can only be applied at upload time - an existing object can't be encrypted afterwards. To
              change an object's key, delete and re-upload it.
            </p>
            <form onSubmit={handleUpload} className="rule-editor" style={{ marginTop: 10 }}>
              <div className="field">
                <span className="field-label">File</span>
                <input ref={uploadInputRef} type="file" onChange={handleUploadFileChange} />
              </div>
              <div className="field">
                <label htmlFor="upload-key">Object key</label>
                <input id="upload-key" type="text" value={uploadKey} onChange={(e) => setUploadKey(e.target.value)} />
              </div>
              <label className="radio-row">
                <input
                  type="checkbox"
                  checked={uploadEncrypt}
                  onChange={(e) => setUploadEncrypt(e.target.checked)}
                  disabled={!sseConfigured}
                />
                Encrypt with SSE-C key {!sseConfigured && '(configure a key above first)'}
              </label>
              {uploadError && <p className="field-error">{uploadError}</p>}
              <div className="rule-editor-actions">
                <button type="submit" className="btn btn-primary" disabled={uploading || !uploadFile || !uploadKey.trim()}>
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {settingsObject && (
        <Modal title="Object Settings" onClose={() => setSettingsObject(null)}>
          <dl className="detail-grid">
            <dt>Key</dt>
            <dd>{settingsObject.key}</dd>
            <dt>Size</dt>
            <dd>{formatBytes(settingsObject.size)}</dd>
            <dt>Last modified</dt>
            <dd>{formatDate(settingsObject.lastModified)}</dd>
            <dt>Content type</dt>
            <dd>{settingsObject.contentType || '—'}</dd>
            <dt>Encryption</dt>
            <dd>
              <EncryptionPill object={settingsObject} />
            </dd>
          </dl>
          <div className="rule-editor-actions" style={{ marginTop: 18 }}>
            <button type="button" className="btn btn-primary" onClick={() => handleDownload(settingsObject)}>
              Download
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => handleCopyUrl(settingsObject)}>
              Copy URL
            </button>
          </div>
        </Modal>
      )}

      {versionsObject && (
        <Modal title={`Versions · ${versionsObject.key}`} onClose={() => setVersionsObject(null)}>
          {versionsLoading && <p className="muted small">Loading…</p>}
          {versionsError && <div className="banner banner-error">{versionsError}</div>}
          {!versionsLoading && !versionsError && versions.length === 0 && (
            <p className="muted small">No version history for this object (versioning may not be enabled on this bucket).</p>
          )}
          {versions.length > 0 && (
            <table className="object-table">
              <thead>
                <tr>
                  <th>Version ID</th>
                  <th>Size</th>
                  <th>Modified</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.versionId}>
                    <td className="object-key-cell" style={{ maxWidth: 160 }}>{v.versionId}</td>
                    <td>{v.type === 'delete-marker' ? 'Delete marker' : formatBytes(v.size)}</td>
                    <td>{formatDate(v.lastModified)}</td>
                    <td>{v.isLatest && <span className="pill pill-success">Latest</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {aclObject && (
        <Modal title={`Access Control List · ${aclObject.key}`} onClose={() => setAclObject(null)}>
          <ObjectAclEditor region={bucket.region} bucketName={bucket.name} objectKey={aclObject.key} />
        </Modal>
      )}

      {lockObject && (
        <Modal title={`Object Lock · ${lockObject.key}`} onClose={() => setLockObject(null)}>
          <ObjectLockPanel region={bucket.region} bucketName={bucket.name} objectKey={lockObject.key} />
        </Modal>
      )}
    </section>
  );
}

export default function ObjectEncryption({ buckets, objectLockBuckets }) {
  const [status, setStatus] = useState({ configured: false, fingerprint: null });

  useEffect(() => {
    api
      .getSseKeyStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  return (
    <>
      <KeyManagement status={status} onStatusChange={setStatus} />
      <ObjectBrowser buckets={buckets} sseConfigured={status.configured} objectLockBuckets={objectLockBuckets} />
    </>
  );
}
