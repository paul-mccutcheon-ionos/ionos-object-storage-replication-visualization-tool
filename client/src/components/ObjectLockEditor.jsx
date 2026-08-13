import { useState } from 'react';

export default function ObjectLockEditor({ current, onSave, onCancel, saving }) {
  const [mode, setMode] = useState(current?.mode || 'none');
  const [retentionValue, setRetentionValue] = useState(current?.retentionDays ?? current?.retentionYears ?? 1);
  const [retentionUnit, setRetentionUnit] = useState(current?.retentionYears ? 'Years' : 'Days');
  const [formError, setFormError] = useState(null);

  function handleSubmit(e) {
    e.preventDefault();
    if (mode !== 'none' && (!retentionValue || Number(retentionValue) <= 0)) {
      setFormError('Retention period must be a positive number.');
      return;
    }
    setFormError(null);
    onSave({ mode, retentionValue: Number(retentionValue), retentionUnit });
  }

  return (
    <form className="rule-editor" onSubmit={handleSubmit}>
      <div className="field">
        <span className="field-label">Select the mode for your Object Lock</span>
        <label className="radio-row">
          <input type="radio" name="edit-lock-mode" checked={mode === 'none'} onChange={() => setMode('none')} />
          <strong>No default retention</strong>
        </label>
        <label className="radio-row">
          <input
            type="radio"
            name="edit-lock-mode"
            checked={mode === 'GOVERNANCE'}
            onChange={() => setMode('GOVERNANCE')}
          />
          <strong>Governance mode</strong>
        </label>
        <label className="radio-row">
          <input
            type="radio"
            name="edit-lock-mode"
            checked={mode === 'COMPLIANCE'}
            onChange={() => setMode('COMPLIANCE')}
          />
          <strong>Compliance mode</strong>
        </label>
      </div>

      {mode !== 'none' && (
        <div className="field">
          <span className="field-label">Retention period</span>
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

      {formError && <p className="field-error">{formError}</p>}

      <div className="rule-editor-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn btn-outline" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
