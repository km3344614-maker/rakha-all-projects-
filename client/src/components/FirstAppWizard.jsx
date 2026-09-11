import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { stashAppSecretOnce } from '../utils/appSecretOnce';
import toast from 'react-hot-toast';
import { Box, ArrowRight, Loader2, Hexagon } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Name' },
  { id: 2, label: 'Configure' },
  { id: 3, label: 'Launch' },
];

export default function FirstAppWizard({ onCreated }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const prefix = name
    ? name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6) || 'APP'
    : 'APP';

  const createApp = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Enter an app name');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/apps', {
        name: name.trim(),
        version: '1.0.0',
        hwidLock: true,
        keyPrefix: prefix,
        description: '',
      });
      toast.success('Application created!');
      const app = res.data.app;
      stashAppSecretOnce(app._id, res.data.appSecretOnce);
      if (onCreated) onCreated(app);
      else navigate(`/applications/${app._id}/settings`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create app');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="first-app">
      <div className="first-app-card">
        <div className="first-app-icon-wrap" aria-hidden="true">
          <span className="first-app-icon-glow" />
          <div className="first-app-icon">
            <Box size={22} strokeWidth={1.75} />
          </div>
        </div>

        <h1 className="first-app-title">Create your first app</h1>
        <p className="first-app-sub">Get started by creating an application</p>

        <div className="first-app-steps" role="list" aria-label="Progress">
          {STEPS.map((s, i) => (
            <div key={s.id} className="first-app-step-wrap">
              <div
                role="listitem"
                className={`first-app-step ${s.id === 1 ? 'active' : ''}`}
              >
                <span className="first-app-step-num">{s.id}</span>
                <span className="first-app-step-label">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className="first-app-step-line" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        {error && <div className="first-app-error">{error}</div>}

        <form className="first-app-form" onSubmit={createApp}>
          <label className="first-app-label" htmlFor="first-app-name">
            <span className="first-app-label-icon" aria-hidden="true">
              <Hexagon size={10} strokeWidth={2.25} />
            </span>
            App Name
          </label>
          <input
            id="first-app-name"
            className="first-app-input"
            type="text"
            placeholder="My Awesome App"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={50}
            autoFocus
            required
          />
          <button type="submit" className="first-app-submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                Creating...
              </>
            ) : (
              <>
                Create App
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
