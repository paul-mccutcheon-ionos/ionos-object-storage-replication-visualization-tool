import { useRef, useState } from 'react';
import { api } from '../api.js';

export default function EnvControls({ onCredentialsUpdated }) {
  const fileInputRef = useRef(null);
  const [status, setStatus] = useState(null); // { type: 'success' | 'error', message }
  const [uploading, setUploading] = useState(false);

  function handleUploadClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;

    setUploading(true);
    setStatus(null);
    try {
      const content = await file.text();
      const result = await api.uploadEnv(content);
      setStatus({ type: 'success', message: `Credentials updated (${result.keys.join(', ')})` });
      onCredentialsUpdated?.();
    } catch (err) {
      setStatus({ type: 'error', message: err.message });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="env-controls">
      {status && (
        <span className={status.type === 'error' ? 'env-status env-status-error' : 'env-status env-status-success'}>
          {status.message}
        </span>
      )}
      <a className="btn btn-banner" href="/api/settings/env-example" download=".env.example">
        Download .env.example
      </a>
      <button type="button" className="btn btn-banner" onClick={handleUploadClick} disabled={uploading}>
        {uploading ? 'Uploading…' : 'Upload .env'}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".env,text/plain"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}
