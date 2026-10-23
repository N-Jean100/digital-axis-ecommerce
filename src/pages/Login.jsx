import { useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import { API_URL, getApiErrorMessage } from './api.js';

function Login({ onSuccess, onSwitch, onForgotPassword, notice }) {
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      const response = await axios.post(`${API_URL}/auth/login`, formData);
      onSuccess(response.data);
    } catch (error) {
      setFormError(getApiErrorMessage(error, 'We couldn’t sign you in. Check your details and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-form-wrap">
      <div className="auth-heading">
        <p className="auth-form-kicker">WELCOME BACK</p>
        <h2>Good to see you.</h2>
        <p>Sign in to pick up where your business left off.</p>
      </div>
      {notice && <div className="auth-message auth-message-success" role="status">{notice}</div>}
      <form className="auth-form" onSubmit={handleSubmit}>
        {formError && <div className="auth-message auth-message-error" role="alert">{formError}</div>}
        <label className="auth-field">
          <span>Email address</span>
          <span className="auth-input-wrap"><Mail size={16} aria-hidden="true" /><input type="email" name="email" autoComplete="email" placeholder="you@company.com" value={formData.email} onChange={(event) => setFormData((current) => ({ ...current, email: event.target.value }))} required /></span>
        </label>
        <label className="auth-field">
          <span>Password</span>
          <span className="auth-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input type={showPassword ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="Enter your password" value={formData.password} onChange={(event) => setFormData((current) => ({ ...current, password: event.target.value }))} required /><button className="auth-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
        </label>
        <button className="auth-forgot-link" type="button" onClick={onForgotPassword}>Forgot password?</button>
        <button className="auth-submit primary-action-button" type="submit" disabled={submitting}>
          {submitting ? <><span className="auth-spinner auth-spinner-small" /> Signing in…</> : <>Sign in <span aria-hidden="true">↗</span></>}
        </button>
      </form>
      <p className="auth-switch">New to DIGITAL Axis? <button type="button" onClick={onSwitch}>Create an account <span aria-hidden="true">→</span></button></p>
    </div>
  );
}

export default Login;
