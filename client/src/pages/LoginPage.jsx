import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import toast from 'react-hot-toast';
import { Brain, Mail, Lock, Eye, EyeOff, Zap, Network, FileSearch } from 'lucide-react';
import './LoginPage.css';

export default function LoginPage() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        toast.success('Welcome back!');
      } else {
        await register(email, password);
        toast.success('Account created! Welcome to InsightMesh.');
      }
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Gradient mesh background */}
      <div className="login-bg">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
        <div className="login-grid" />
      </div>

      <div className="login-layout">
        {/* Left — Branding */}
        <div className="login-hero animate-fade-up">
          <div className="login-logo">
            <Network size={32} strokeWidth={1.5} />
          </div>
          <h1 className="login-title">
            Insight<span className="gradient-text">Mesh</span>
          </h1>
          <p className="login-tagline">
            Turn research chaos into visual intelligence.
          </p>

          <div className="login-features">
            {[
              { icon: <Brain size={18} />, text: 'AI-powered entity extraction via Gemini' },
              { icon: <Network size={18} />, text: 'Interactive knowledge graph visualization' },
              { icon: <FileSearch size={18} />, text: 'Evidence traceability to source documents' },
              { icon: <Zap size={18} />, text: 'Cross-document claim synthesis' },
            ].map((f, i) => (
              <div key={i} className="login-feature">
                <span className="login-feature-icon">{f.icon}</span>
                <span>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right — Auth Form */}
        <div className="login-form-container animate-fade-up" style={{ animationDelay: '0.1s' }}>
          <div className="glass-card-elevated login-card">
            {/* Tab Toggle */}
            <div className="login-tabs">
              <button
                className={`login-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => setMode('login')}
              >
                Sign In
              </button>
              <button
                className={`login-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => setMode('register')}
              >
                Create Account
              </button>
            </div>

            <div className="login-card-body">
              <h2 className="login-form-title">
                {mode === 'login' ? 'Welcome back' : 'Get started free'}
              </h2>
              <p className="login-form-subtitle">
                {mode === 'login'
                  ? 'Sign in to your research workspace'
                  : 'No credit card required'}
              </p>

              <form onSubmit={handleSubmit} className="login-form">
                <div className="form-group">
                  <label className="form-label">Email Address</label>
                  <div className="input-wrapper">
                    <Mail size={16} className="input-icon" />
                    <input
                      id="login-email"
                      type="email"
                      className="form-input with-icon"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="input-wrapper">
                    <Lock size={16} className="input-icon" />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      className="form-input with-icon with-icon-right"
                      placeholder={mode === 'register' ? 'Minimum 6 characters' : '••••••••'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    />
                    <button
                      type="button"
                      className="input-icon-right"
                      onClick={() => setShowPassword(v => !v)}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  id="auth-submit-btn"
                  type="submit"
                  className="btn btn-primary btn-full btn-lg"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="btn-spinner" />
                      {mode === 'login' ? 'Signing in...' : 'Creating account...'}
                    </>
                  ) : (
                    mode === 'login' ? 'Sign In' : 'Create Account'
                  )}
                </button>
              </form>

              <p className="login-switch">
                {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
                <button
                  className="link-btn"
                  onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                >
                  {mode === 'login' ? 'Sign up' : 'Sign in'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
