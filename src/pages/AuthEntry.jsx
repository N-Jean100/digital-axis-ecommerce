import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import Login from './Login.jsx';
import Register from './Register.jsx';
import DeviceIllustration from './DeviceIllustration.jsx';
import { API_URL, getApiErrorMessage } from './api.js';
import './auth.css';

function AuthEntry({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const [checkingSession, setCheckingSession] = useState(() => Boolean(localStorage.getItem('token')));
  const [sessionError, setSessionError] = useState('');

  const acceptSession = useCallback((session) => {
    if (!session?.token || !session?.user) {
      throw new Error('The authentication service returned an invalid session. Please try again.');
    }
    localStorage.setItem('token', session.token);
    onAuthenticated(session.user);
  }, [onAuthenticated]);

  const verifySession = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setCheckingSession(false);
      return;
    }

    setCheckingSession(true);
    setSessionError('');
    try {
      const response = await axios.get(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      onAuthenticated(response.data.user);
    } catch (error) {
      if (error.response?.status === 401 || error.response?.status === 403) {
        localStorage.removeItem('token');
        setCheckingSession(false);
        return;
      }
      setSessionError(getApiErrorMessage(error, 'We couldn’t verify your session. Please try again.'));
      setCheckingSession(false);
    }
  }, [onAuthenticated]);

  useEffect(() => {
    verifySession();
  }, [verifySession]);

  if (checkingSession) {
    return (
      <main className="auth-loading" aria-live="polite">
        <span className="auth-spinner" />
        <p>Checking your secure session…</p>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <section className="auth-layout" aria-label="DIGITAL Axis account access">
        <aside className="auth-story">
          <div className="auth-brand">
            <span className="auth-brand-mark">D</span>
            <span>DIGITAL <b>Axis</b></span>
          </div>
          <div className="auth-story-copy">
            <p className="auth-eyebrow"><span /> YOUR COMMERCE, IN MOTION</p>
            <h1>One workspace.<br /><em>More room</em> to grow.</h1>
            <p className="auth-intro">Keep your products, people, and next move connected — wherever business takes you.</p>
          </div>
          <DeviceIllustration />
          <div className="auth-story-foot">
            <span className="auth-live-dot" />
            <span>Everything you need, right where you need it.</span>
            <span className="auth-foot-mark">DA / 01</span>
          </div>
        </aside>

        <section className="auth-panel">
          <div className="auth-panel-top">
            <span className="auth-secure-label"><span className="auth-lock-icon">⌑</span> Secure workspace access</span>
            <span className="auth-panel-index">01 — ACCESS</span>
          </div>
          {sessionError && (
            <div className="auth-message auth-message-error" role="alert">
              <span>{sessionError}</span>
              <button type="button" onClick={verifySession}>Retry</button>
            </div>
          )}
          {mode === 'login'
            ? <Login onSuccess={acceptSession} onSwitch={() => setMode('register')} />
            : <Register onSuccess={acceptSession} onSwitch={() => setMode('login')} />}
          <p className="auth-legal">By continuing, you agree to use DIGITAL Axis responsibly. Your account credentials are encrypted in transit and stored securely.</p>
        </section>
      </section>
    </main>
  );
}

export default AuthEntry;
