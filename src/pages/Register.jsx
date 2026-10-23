import { useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff, LockKeyhole, Mail, UserRound } from 'lucide-react';
import { Icon } from './icons.jsx';
import { API_URL, getApiErrorMessage } from './api.js';

function Register({ onVerificationRequested, onSwitch }) {
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'customer' });
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (event) => setFormData((current) => ({ ...current, [event.target.name]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await axios.post(`${API_URL}/auth/register`, formData);
      onVerificationRequested(formData.email.trim().toLowerCase());
    } catch (error) {
      const message = getApiErrorMessage(error, 'We could not create your account. Please try again.');
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="register-view w-full max-w-[380px]">
      <div className="auth-heading register-heading">
        <p className="auth-form-kicker">YOUR NEXT CHAPTER</p>
        <h2>Create an account</h2>
        <p>Add your details to get started with DIGITAL Axis.</p>
      </div>

      <form onSubmit={handleSubmit} className="auth-form register-form">
        {formError && <div className="auth-message auth-message-error register-error" role="alert">{formError}</div>}

        <label className="auth-field">
          Izina (Name)
          <span className="auth-input-wrap"><UserRound size={16} aria-hidden="true" /><input className="register-control" type="text" name="name" autoComplete="name" value={formData.name} onChange={handleChange} placeholder="Your name" required /></span>
        </label>

        <label className="auth-field">
          Email
          <span className="auth-input-wrap"><Mail size={16} aria-hidden="true" /><input className="register-control" type="email" name="email" autoComplete="email" value={formData.email} onChange={handleChange} placeholder="you@example.com" required /></span>
        </label>

        <label className="auth-field">
          Ijambo ry'ibanga (Password)
          <span className="auth-input-wrap"><LockKeyhole size={16} aria-hidden="true" /><input className="register-control" type={showPassword ? 'text' : 'password'} name="password" autoComplete="new-password" minLength={8} maxLength={128} value={formData.password} onChange={handleChange} placeholder="At least 8 characters" required /><button className="auth-password-toggle" type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></span>
        </label>

        <label className="auth-field">
          Ubwoko bw'Umukoresha (Role)
          <select className="register-control" name="role" value={formData.role} onChange={handleChange}>
            <option value="customer">Customer</option>
            <option value="vendor">Vendor</option>
          </select>
        </label>

        <button type="submit" disabled={submitting} className="auth-submit primary-action-button register-submit">
          {submitting
            ? <><span className="auth-spinner auth-spinner-small" aria-hidden="true" /> Creating account…</>
            : <>Iyandikishe <Icon name="arrow" size={14} /></>}
        </button>
      </form>

      <p className="auth-switch register-switch">
        Already have an account? <button type="button" onClick={onSwitch}>Sign in</button>
      </p>
      <p className="register-assurance">Your details are sent securely to the account registration service.</p>
    </div>
  );
}

export default Register;
