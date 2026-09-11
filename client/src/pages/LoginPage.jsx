import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import AuthShell from '../components/AuthShell';
import CardRain from '../components/CardRain';
import avatarKnight from '../assets/avatar_knight.jpg';
import richBanner from '../assets/rich_banner.png';
import {
  User, Lock, Eye, EyeOff, AlertCircle, ArrowRight, Loader2, ExternalLink
} from 'lucide-react';
import { sanitizeLoginIdentifier } from '../utils/inputGuard';

function LoginForm() {
  const [form, setForm] = useState({
    username: sanitizeLoginIdentifier(localStorage.getItem('rakhaauth_remember_user') || ''),
    password: ''
  });
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(
    Boolean(localStorage.getItem('rakhaauth_remember_user'))
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (remember) {
        localStorage.setItem('rakhaauth_remember_user', form.username);
      } else {
        localStorage.removeItem('rakhaauth_remember_user');
      }
      localStorage.removeItem('rakhaauth_remember_email');
      await login(form.username, form.password);
      toast.success('Welcome back!');
      navigate('/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="discord-profile-login-card">
      {/* Rain falling strictly inside the card */}
      <CardRain />

      {/* Top Banner with "rich asf" arrow */}
      <div className="discord-card-banner">
        <img
          src={richBanner}
          alt="Banner"
          className="discord-banner-img"
        />
        <div className="discord-banner-overlay" />
      </div>

      {/* Main Card Content */}
      <div className="discord-card-body">
        {/* Avatar & Status Row */}
        <div className="discord-avatar-row">
          <div className="discord-avatar-container">
            <img
              src={avatarKnight}
              alt="Rakha"
              className="discord-avatar-img"
            />
            <div className="discord-status-badge">
              <span className="discord-status-dot" />
            </div>
          </div>
        </div>

        {/* Name & Tag info */}
        <div className="discord-user-header">
          <h2 className="discord-display-name">رخا</h2>
          <div className="discord-tag-row">
            <span className="discord-handle">rakha</span>
            <span className="discord-dot">•</span>
            <span className="discord-subtag">✦ مسلم ✦</span>
            <span className="discord-role-pill">⚡ rakha ⚡</span>
          </div>
        </div>

        {/* Input fields in the middle for Email/User & Password */}
        <div className="discord-login-section">
          {error && (
            <div className="auth-alert auth-alert--error" style={{ marginBottom: 12 }}>
              <AlertCircle size={15} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="discord-login-form">
            <div className="discord-input-field">
              <label className="discord-field-label">
                <User size={13} />
                EMAIL OR USERNAME
              </label>
              <input
                className="discord-styled-input"
                type="text"
                placeholder="kareem198020121980@gmail.com"
                required
                autoComplete="username"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                maxLength={50}
                value={form.username}
                onChange={(e) => setForm({ ...form, username: sanitizeLoginIdentifier(e.target.value) })}
              />
            </div>

            <div className="discord-input-field">
              <label className="discord-field-label">
                <Lock size={13} />
                PASSWORD
              </label>
              <div className="discord-pass-wrap">
                <input
                  className="discord-styled-input"
                  type={showPass ? 'text' : 'password'}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
                <button
                  type="button"
                  className="discord-eye-btn"
                  onClick={() => setShowPass(!showPass)}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div className="discord-form-options">
              <label className="discord-remember-box">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span className="discord-check-custom" />
                <span>Remember me</span>
              </label>
            </div>

            <button type="submit" className="discord-signin-btn" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 size={16} className="spin" />
                  <span>Connecting...</span>
                </>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Bio Section */}
        <div className="discord-bio-section">
          <div className="discord-section-title">ABOUT ME</div>
          <div className="discord-bio-text">✦C++ & node & Java & python✦</div>
          <div className="discord-bio-links">
            <a href="https://www.rakha.me/" target="_blank" rel="noopener noreferrer" className="discord-link">
              <span>https://www.rakha.me/</span>
              <ExternalLink size={12} />
            </a>
            <a href="https://guns.lol/rakhaos" target="_blank" rel="noopener noreferrer" className="discord-link">
              <span>https://guns.lol/rakhaos</span>
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        {/* Member Since */}
        <div className="discord-meta-section">
          <div className="discord-section-title">MEMBER SINCE</div>
          <div className="discord-meta-val">May 31, 2021</div>
        </div>

        {/* Spotify Connection */}
        <div className="discord-connections-section">
          <div className="discord-section-title">CONNECTIONS</div>
          <a
            href="https://open.spotify.com/user/31dddhw3xsqsmdreu7bszsr5odx4"
            target="_blank"
            rel="noopener noreferrer"
            className="discord-spotify-badge"
          >
            <svg className="discord-spotify-icon" viewBox="0 0 24 24" width="18" height="18" fill="#1DB954">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.66.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>
            <span className="discord-spotify-name">Rakha</span>
            <ExternalLink size={13} className="discord-spotify-ext" />
          </a>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <AuthShell>
      <LoginForm />
    </AuthShell>
  );
}
