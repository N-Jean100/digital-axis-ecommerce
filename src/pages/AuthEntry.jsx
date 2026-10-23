import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import axios from 'axios';
import { ArrowLeft, ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react';
import Login from './Login.jsx';
import Register from './Register.jsx';
import DeviceIllustration from './DeviceIllustration.jsx';
import { API_URL, getApiErrorMessage } from './api.js';
import './auth.css';

function OtpFields({ value, onChange }) {
  const inputRefs = useRef([]);
  const digits = value.padEnd(6, ' ').slice(0, 6).split('');

  const setDigits = (nextValue, focusIndex) => {
    onChange(nextValue.slice(0, 6));
    if (focusIndex >= 0 && focusIndex < 6) inputRefs.current[focusIndex]?.focus();
  };

  const handleChange = (index, rawValue) => {
    const nextDigit = rawValue.replace(/\D/g, '').slice(-1);
    const next = digits.map((digit, position) => position === index ? nextDigit : digit).join('').trimEnd();
    setDigits(next, nextDigit ? index + 1 : index);
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (!pasted) return;
    event.preventDefault();
    setDigits(pasted, Math.min(pasted.length, 5));
  };

  return (
    <div className="auth-otp-fields" aria-label="Six-digit verification code">
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(element) => { inputRefs.current[index] = element; }}
          aria-label={`Verification digit ${index + 1}`}
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          autoFocus={index === 0}
          inputMode="numeric"
          maxLength={1}
          pattern="[0-9]*"
          value={digit.trim()}
          onChange={(event) => handleChange(index, event.target.value)}
          onPaste={handlePaste}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !digit && index > 0) inputRefs.current[index - 1]?.focus();
            if (event.key === 'ArrowLeft' && index > 0) inputRefs.current[index - 1]?.focus();
            if (event.key === 'ArrowRight' && index < 5) inputRefs.current[index + 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}

function PasswordStrength({ password }) {
  const checks = [password.length >= 8, /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)];
  const score = checks.filter(Boolean).length;
  const labels = ['Add a password', 'Weak', 'Fair', 'Good', 'Strong'];
  return (
    <div className="auth-password-strength" aria-live="polite">
      <div className="auth-strength-bars" aria-hidden="true">
        {checks.map((passed, index) => <span key={index} className={index < score ? `is-strength-${score}` : ''} />)}
      </div>
      <span>{labels[score]}</span>
    </div>
  );
}

function AuthEntry({ onAuthenticated }) {
  const [mode, setMode] = useState('login');
  const reduceMotion = useReducedMotion();
  const [verificationPurpose, setVerificationPurpose] = useState('registration');
  const isRegistering = mode === 'register' || (mode === 'verify-otp' && verificationPurpose === 'registration');
  const [verificationEmail, setVerificationEmail] = useState('');
  const [forgotEmail, setForgotEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [resendSeconds, setResendSeconds] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [loginNotice, setLoginNotice] = useState('');
  const hasCompleteCode = /^\d{6}$/.test(verificationCode);
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
    if (mode !== 'verify-otp' || resendSeconds === 0) return undefined;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [mode, resendSeconds]);

  const beginVerification = (email, purpose) => {
    setVerificationEmail(email);
    setVerificationPurpose(purpose);
    setVerificationCode('');
    setFormError('');
    setResendSeconds(30);
    setMode('verify-otp');
  };

  const requestPasswordReset = async (email) => {
    setSubmitting(true);
    setFormError('');
    try {
      await axios.post(`${API_URL}/auth/password/forgot`, { email });
      beginVerification(email.trim().toLowerCase(), 'password-reset');
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'We could not send a verification code. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const submitForgotPassword = (event) => {
    event.preventDefault();
    requestPasswordReset(forgotEmail);
  };

  const verifyCode = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      if (verificationPurpose === 'registration') {
        const response = await axios.post(`${API_URL}/auth/register/verify`, {
          email: verificationEmail,
          code: verificationCode
        });
        acceptSession(response.data);
      } else {
        await axios.post(`${API_URL}/auth/password/reset`, {
          email: verificationEmail,
          code: verificationCode,
          password: newPassword
        });
        setLoginNotice('Password reset. Sign in with your new password.');
        setNewPassword('');
        setMode('login');
      }
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'We could not verify that code. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const resendCode = async () => {
    if (resendSeconds > 0 || submitting) return;
    setSubmitting(true);
    setFormError('');
    try {
      await axios.post(`${API_URL}/auth/otp/resend`, {
        email: verificationEmail,
        purpose: verificationPurpose
      });
      setVerificationCode('');
      setResendSeconds(30);
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'We could not send another code. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={mode}
                initial={reduceMotion ? false : { opacity: 0, x: isRegistering ? 18 : -18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: isRegistering ? -18 : 18 }}
                transition={{ duration: reduceMotion ? 0 : 0.24, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="auth-eyebrow"><span /> {isRegistering ? 'BUILD YOUR NEXT MOVE' : mode === 'forgot-password' || verificationPurpose === 'password-reset' ? 'ACCOUNT RECOVERY' : 'YOUR COMMERCE, IN MOTION'}</p>
                <h1>{isRegistering
                  ? <>Start with a<br /><em>clearer view</em>.</>
                  : mode === 'forgot-password' || verificationPurpose === 'password-reset'
                    ? <>A secure<br /><em>way back</em>.</>
                    : <>One workspace.<br /><em>More room</em> to grow.</>}</h1>
                <p className="auth-intro">{isRegistering
                  ? 'Bring your products, people, and plans together in one place.'
                  : mode === 'forgot-password' || verificationPurpose === 'password-reset'
                    ? 'We’ll help you safely restore access to your workspace.'
                    : 'Keep your products, people, and next move connected — wherever business takes you.'}</p>
              </motion.div>
            </AnimatePresence>
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
            <span className="auth-secure-label"><ShieldCheck className="auth-lock-icon" size={15} /> Secure workspace access</span>
            <span className="auth-panel-index">01 — ACCESS</span>
          </div>
          {mode === 'login' || mode === 'register' ? (
            <div className="auth-mode-toggle" role="tablist" aria-label="Account access">
              {['login', 'register'].map((tab) => (
                <button
                  key={tab}
                  className="auth-mode-option"
                  type="button"
                  role="tab"
                  aria-selected={mode === tab}
                  onClick={() => { setFormError(''); setMode(tab); }}
                >
                  {mode === tab && <motion.span className="auth-mode-indicator" layoutId="auth-mode-indicator" transition={{ type: 'spring', stiffness: 420, damping: 34 }} />}
                  <span>{tab === 'login' ? 'Sign in' : 'Create account'}</span>
                </button>
              ))}
            </div>
          ) : (
            <button
              className="auth-flow-back"
              type="button"
              onClick={() => {
                setFormError('');
                setMode(mode === 'verify-otp' && verificationPurpose === 'registration' ? 'register' : mode === 'verify-otp' ? 'forgot-password' : 'login');
              }}
            ><ArrowLeft size={15} /> Back</button>
          )}
          {sessionError && (
            <div className="auth-message auth-message-error" role="alert">
              <span>{sessionError}</span>
              <button type="button" onClick={verifySession}>Retry</button>
            </div>
          )}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={mode}
              className="auth-transition-panel"
              initial={reduceMotion ? false : { opacity: 0, x: isRegistering ? 22 : -22, scale: 0.985 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={reduceMotion ? undefined : { opacity: 0, x: isRegistering ? -22 : 22, scale: 0.985 }}
              transition={{ duration: reduceMotion ? 0 : 0.27, ease: [0.22, 1, 0.36, 1] }}
            >
              {mode === 'login' && (
                <Login
                  onSuccess={acceptSession}
                  onSwitch={() => setMode('register')}
                  onForgotPassword={() => { setFormError(''); setForgotEmail(''); setMode('forgot-password'); }}
                  notice={loginNotice}
                />
              )}
              {mode === 'register' && (
                <Register
                  onVerificationRequested={(email) => beginVerification(email, 'registration')}
                  onSwitch={() => setMode('login')}
                />
              )}
              {mode === 'forgot-password' && (
                <div className="auth-form-wrap">
                  <div className="auth-heading">
                    <p className="auth-form-kicker">ACCOUNT RECOVERY</p>
                    <h2>Forgot your password?</h2>
                    <p>Enter your account email and we’ll send a one-time code.</p>
                  </div>
                  <form className="auth-form" onSubmit={submitForgotPassword}>
                    {formError && <div className="auth-message auth-message-error" role="alert">{formError}</div>}
                    <label className="auth-field">
                      <span>Email address</span>
                      <span className="auth-input-wrap"><Mail size={16} aria-hidden="true" /><input type="email" autoComplete="email" placeholder="you@company.com" value={forgotEmail} onChange={(event) => setForgotEmail(event.target.value)} required /></span>
                    </label>
                    <button className="auth-submit primary-action-button" type="submit" disabled={submitting}>
                      {submitting ? <><span className="auth-spinner auth-spinner-small" /> Sending code…</> : <>Send verification code <ArrowRight size={15} /> </>}
                    </button>
                  </form>
                </div>
              )}
              {mode === 'verify-otp' && (
                <div className="auth-form-wrap">
                  <div className="auth-heading">
                    <p className="auth-form-kicker"><KeyRound size={13} /> {verificationPurpose === 'registration' ? 'VERIFY YOUR EMAIL' : 'RESET YOUR PASSWORD'}</p>
                    <h2>{verificationPurpose === 'registration' ? 'Check your inbox.' : 'Choose a new password.'}</h2>
                    <p>Enter the six-digit code sent to <strong>{verificationEmail}</strong>.</p>
                  </div>
                  <form className="auth-form" onSubmit={verifyCode}>
                    {formError && <div className="auth-message auth-message-error" role="alert">{formError}</div>}
                    <label className="auth-field"><span>Verification code</span><OtpFields value={verificationCode} onChange={setVerificationCode} /></label>
                    {verificationPurpose === 'password-reset' && (
                      <>
                        <label className="auth-field">
                          <span>New password</span>
                          <span className="auth-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength={8} maxLength={128} placeholder="At least 8 characters" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /><button className="auth-password-toggle" type="button" aria-label={showNewPassword ? 'Hide password' : 'Show password'} onClick={() => setShowNewPassword((visible) => !visible)}>{showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
                        </label>
                        <PasswordStrength password={newPassword} />
                      </>
                    )}
                    <button className="auth-submit primary-action-button" type="submit" disabled={submitting || !hasCompleteCode || (verificationPurpose === 'password-reset' && newPassword.length < 8)}>
                      {submitting
                        ? <><span className="auth-spinner auth-spinner-small" /> {verificationPurpose === 'registration' ? 'Verifying…' : 'Updating password…'}</>
                        : <>{verificationPurpose === 'registration' ? 'Verify and create account' : 'Reset password'} <ArrowRight size={15} /></>}
                    </button>
                  </form>
                  <div className="auth-resend-row">
                    <span>Didn’t receive the code?</span>
                    <button type="button" onClick={resendCode} disabled={resendSeconds > 0 || submitting}>
                      {resendSeconds > 0 ? `Resend in ${resendSeconds}s` : 'Resend code'}
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          <p className="auth-legal">By continuing, you agree to use DIGITAL Axis responsibly. Your account credentials are encrypted in transit and stored securely.</p>
        </section>
      </section>
    </main>
  );
}

export default AuthEntry;
