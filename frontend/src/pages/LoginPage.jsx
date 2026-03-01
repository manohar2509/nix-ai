import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import {
  ShieldCheck, Mail, Lock, ArrowRight, Loader2, Eye, EyeOff,
  Zap, Shield, TrendingUp, User, Building2, Briefcase, KeyRound,
  ArrowLeft, CheckCircle2, RefreshCw,
} from 'lucide-react';
import { useAppStore, useAuth } from '../stores/useAppStore';
import authService from '../services/authService';
import { cn } from '../utils/cn';

/* ── Auth Modes ── */
const MODE = {
  SIGN_IN: 'signIn',
  SIGN_UP: 'signUp',
  VERIFY: 'verify',
  FORGOT_PASSWORD: 'forgotPassword',
  RESET_PASSWORD: 'resetPassword',
  NEW_PASSWORD: 'newPassword',
};

export default function LoginPage() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const setUser = useAppStore((state) => state.setUser);

  // ── Mode ──
  const [mode, setMode] = useState(MODE.SIGN_IN);

  // ── Form fields ──
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [organization, setOrganization] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // ── UI ──
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  // Already authenticated → go to dashboard
  if (isAuthenticated) {
    return <Navigate to="/" replace />;
  }

  const clearMessages = () => { setError(null); setSuccessMessage(null); };

  const switchMode = (newMode) => {
    clearMessages();
    setMode(newMode);
  };

  /* ═══════════════════════════════════════════
     AUTH HANDLERS
     ═══════════════════════════════════════════ */

  // ─── SIGN IN ───
  const handleSignIn = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password');
      return;
    }
    setIsLoading(true);
    clearMessages();
    try {
      const result = await authService.login(email, password);
      if (result.isSignedIn) {
        setUser(result.user);
        navigate('/', { replace: true });
      } else if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        // Admin-created user with temporary password → must set permanent one
        switchMode(MODE.NEW_PASSWORD);
        setSuccessMessage('Your account requires a new password. Please set a permanent password.');
        // Pre-fill name from challenge parameters if present
        const currentAttrs = result.nextStep?.missingAttributes || [];
        console.log('[Auth] NEW_PASSWORD_REQUIRED — missing attributes:', currentAttrs);
      } else if (result.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
        switchMode(MODE.VERIFY);
        setSuccessMessage('Please verify your email to continue.');
      }
    } catch (err) {
      if (err.code === 'UserNotConfirmedException') {
        switchMode(MODE.VERIFY);
        setError('Please verify your email address first.');
      } else {
        setError(err.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ─── SIGN UP ───
  const handleSignUp = async (e) => {
    e?.preventDefault();
    if (!email.trim() || !password.trim() || !fullName.trim()) {
      setError('Please fill in all required fields');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    clearMessages();
    try {
      const result = await authService.signUp({
        email,
        password,
        name: fullName,
        organization: organization || '',
        jobTitle: jobTitle || '',
      });
      if (result.isSignUpComplete) {
        switchMode(MODE.SIGN_IN);
        setSuccessMessage('Account created! Please sign in.');
      } else {
        switchMode(MODE.VERIFY);
        setSuccessMessage('Verification code sent to your email.');
      }
    } catch (err) {
      console.error('[SignUp] Error:', err);
      // Show details alongside message for debugging
      const msg = err.details && err.details !== err.message
        ? `${err.message} (${err.details})`
        : err.message;
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── VERIFY EMAIL ───
  const handleVerify = async (e) => {
    e?.preventDefault();
    if (!verificationCode.trim()) {
      setError('Please enter the verification code');
      return;
    }
    setIsLoading(true);
    clearMessages();
    try {
      await authService.confirmSignUp(email, verificationCode);
      switchMode(MODE.SIGN_IN);
      setSuccessMessage('Email verified successfully! Please sign in.');
      setVerificationCode('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!email.trim()) {
      setError('Please enter your email address first.');
      return;
    }
    setIsLoading(true);
    clearMessages();
    try {
      await authService.resendVerificationCode(email);
      setSuccessMessage('New verification code sent to your email.');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── FORGOT PASSWORD ───
  const handleForgotPassword = async (e) => {
    e?.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address');
      return;
    }
    setIsLoading(true);
    clearMessages();
    try {
      await authService.forgotPassword(email);
      switchMode(MODE.RESET_PASSWORD);
      setSuccessMessage('Password reset code sent to your email.');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── RESET PASSWORD ───
  const handleResetPassword = async (e) => {
    e?.preventDefault();
    if (!verificationCode.trim() || !newPassword.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setIsLoading(true);
    clearMessages();
    try {
      await authService.confirmForgotPassword(email, verificationCode, newPassword);
      switchMode(MODE.SIGN_IN);
      setSuccessMessage('Password reset successful! Sign in with your new password.');
      setVerificationCode('');
      setNewPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // ─── COMPLETE NEW PASSWORD (Admin-created users) ───
  const handleNewPassword = async (e) => {
    e?.preventDefault();
    if (!newPassword.trim()) {
      setError('Please enter a new password');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    clearMessages();
    try {
      // Pass required attributes (name is required by your Cognito pool)
      const userAttributes = {};
      if (fullName.trim()) {
        userAttributes.name = fullName.trim();
      }
      const result = await authService.completeNewPassword(newPassword, userAttributes);
      if (result.isSignedIn) {
        setUser(result.user);
        navigate('/', { replace: true });
      } else {
        // Unlikely, but handle further challenges
        setError('Additional verification required. Please contact support.');
      }
    } catch (err) {
      console.error('[NewPassword] Error:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  /* ═══════════════════════════════════════════
     FORM HEADERS
     ═══════════════════════════════════════════ */
  const headers = {
    [MODE.SIGN_IN]: { title: 'Welcome back', subtitle: 'Sign in to access your clinical trial workspace' },
    [MODE.SIGN_UP]: { title: 'Create your account', subtitle: 'Join NIX AI to start analysing clinical protocols' },
    [MODE.VERIFY]: { title: 'Verify your email', subtitle: `We sent a 6-digit code to ${email || 'your email'}` },
    [MODE.FORGOT_PASSWORD]: { title: 'Forgot password?', subtitle: 'Enter your email and we\'ll send a reset code' },
    [MODE.RESET_PASSWORD]: { title: 'Reset password', subtitle: 'Enter the code from your email and a new password' },
    [MODE.NEW_PASSWORD]: { title: 'Set new password', subtitle: 'Your account requires a permanent password to continue' },
  };

  /* ═══════════════════════════════════════════
     FORM RENDERERS
     ═══════════════════════════════════════════ */

  const renderSignInForm = () => (
    <>
      <form onSubmit={handleSignIn} className="space-y-4 mb-6">
        {/* Email */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Email</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="email" />
          </div>
        </div>
        {/* Password */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Password</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-11 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="current-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        {/* Forgot password link */}
        <div className="flex justify-end">
          <button type="button" onClick={() => switchMode(MODE.FORGOT_PASSWORD)}
            className="text-xs text-brand-600 hover:text-brand-700 font-medium transition-colors">
            Forgot password?
          </button>
        </div>

        <SubmitButton isLoading={isLoading} label="Sign In" loadingLabel="Signing in..." />
      </form>

      {/* Switch to Sign Up */}
      <div className="text-center">
        <p className="text-sm text-slate-500">
          Don't have an account?{' '}
          <button onClick={() => switchMode(MODE.SIGN_UP)}
            className="text-brand-600 hover:text-brand-700 font-semibold transition-colors">
            Create account
          </button>
        </p>
      </div>
    </>
  );

  const renderSignUpForm = () => (
    <>
      <form onSubmit={handleSignUp} className="space-y-3.5 mb-6">
        {/* Full Name */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Full Name <span className="text-red-400">*</span></label>
          <div className="relative">
            <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Sarah Chen"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="name" />
          </div>
        </div>
        {/* Email */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Email <span className="text-red-400">*</span></label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="email" />
          </div>
        </div>
        {/* Organization */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Organization</label>
          <div className="relative">
            <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)}
              placeholder="e.g. Apollo Hospitals"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400" />
          </div>
        </div>
        {/* Job Title */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Job Title</label>
          <div className="relative">
            <Briefcase size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)}
              placeholder="e.g. Regulatory Affairs Lead"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400" />
          </div>
        </div>
        {/* Password */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Password <span className="text-red-400">*</span></label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars, upper, lower, number, symbol"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-11 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <PasswordStrength password={password} />
        </div>
        {/* Confirm Password */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Confirm Password <span className="text-red-400">*</span></label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="new-password" />
          </div>
        </div>

        <SubmitButton isLoading={isLoading} label="Create Account" loadingLabel="Creating account..." />
      </form>

      {/* Switch to Sign In */}
      <div className="text-center">
        <p className="text-sm text-slate-500">
          Already have an account?{' '}
          <button onClick={() => switchMode(MODE.SIGN_IN)}
            className="text-brand-600 hover:text-brand-700 font-semibold transition-colors">
            Sign in
          </button>
        </p>
      </div>
    </>
  );

  const renderVerifyForm = () => (
    <>
      <div className="flex justify-center mb-6">
        <div className="h-16 w-16 bg-brand-50 rounded-2xl flex items-center justify-center border border-brand-100">
          <Mail size={28} className="text-brand-600" />
        </div>
      </div>
      <form onSubmit={handleVerify} className="space-y-4 mb-6">
        {/* Email (readonly) */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Email</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400" />
          </div>
        </div>
        {/* Verification Code */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Verification Code</label>
          <div className="relative">
            <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400 tracking-[0.3em] text-center font-mono text-lg"
              autoComplete="one-time-code" />
          </div>
        </div>

        <SubmitButton isLoading={isLoading} label="Verify Email" loadingLabel="Verifying..." />
      </form>

      {/* Resend + Back */}
      <div className="flex flex-col items-center gap-3">
        <button onClick={handleResendCode} disabled={isLoading}
          className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium transition-colors disabled:opacity-50">
          <RefreshCw size={14} /> Resend code
        </button>
        <button onClick={() => switchMode(MODE.SIGN_IN)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
          <ArrowLeft size={14} /> Back to sign in
        </button>
      </div>
    </>
  );

  const renderForgotPasswordForm = () => (
    <>
      <form onSubmit={handleForgotPassword} className="space-y-4 mb-6">
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Email</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="email" />
          </div>
        </div>
        <SubmitButton isLoading={isLoading} label="Send Reset Code" loadingLabel="Sending..." />
      </form>
      <div className="text-center">
        <button onClick={() => switchMode(MODE.SIGN_IN)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mx-auto">
          <ArrowLeft size={14} /> Back to sign in
        </button>
      </div>
    </>
  );

  const renderResetPasswordForm = () => (
    <>
      <form onSubmit={handleResetPassword} className="space-y-4 mb-6">
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Reset Code</label>
          <div className="relative">
            <KeyRound size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={verificationCode} onChange={(e) => setVerificationCode(e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400 tracking-[0.3em] text-center font-mono text-lg"
              autoComplete="one-time-code" />
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">New Password</label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, upper, lower, number, symbol"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-11 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <PasswordStrength password={newPassword} />
        </div>
        <SubmitButton isLoading={isLoading} label="Reset Password" loadingLabel="Resetting..." />
      </form>
      <div className="text-center">
        <button onClick={() => switchMode(MODE.SIGN_IN)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mx-auto">
          <ArrowLeft size={14} /> Back to sign in
        </button>
      </div>
    </>
  );

  const renderNewPasswordForm = () => (
    <>
      <div className="flex justify-center mb-6">
        <div className="h-16 w-16 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100">
          <KeyRound size={28} className="text-amber-600" />
        </div>
      </div>
      <form onSubmit={handleNewPassword} className="space-y-4 mb-6">
        {/* Full Name (required by Cognito) */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Full Name <span className="text-red-400">*</span></label>
          <div className="relative">
            <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
              placeholder="Dr. Sarah Chen"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="name" />
          </div>
        </div>
        {/* New Password */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">New Password <span className="text-red-400">*</span></label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Min 8 chars, upper, lower, number, symbol"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-11 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="new-password" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <PasswordStrength password={newPassword} />
        </div>
        {/* Confirm Password */}
        <div>
          <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Confirm Password <span className="text-red-400">*</span></label>
          <div className="relative">
            <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your new password"
              className="w-full bg-white border border-slate-200 text-slate-900 text-sm rounded-xl pl-10 pr-4 py-3 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-400 transition-all placeholder:text-slate-400"
              autoComplete="new-password" />
          </div>
        </div>

        <SubmitButton isLoading={isLoading} label="Set Password & Sign In" loadingLabel="Setting password..." />
      </form>

      {/* Back */}
      <div className="text-center">
        <button onClick={() => switchMode(MODE.SIGN_IN)}
          className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors mx-auto">
          <ArrowLeft size={14} /> Back to sign in
        </button>
      </div>
    </>
  );

  const renderForm = () => {
    switch (mode) {
      case MODE.SIGN_IN: return renderSignInForm();
      case MODE.SIGN_UP: return renderSignUpForm();
      case MODE.VERIFY: return renderVerifyForm();
      case MODE.FORGOT_PASSWORD: return renderForgotPasswordForm();
      case MODE.RESET_PASSWORD: return renderResetPasswordForm();
      case MODE.NEW_PASSWORD: return renderNewPasswordForm();
      default: return renderSignInForm();
    }
  };

  /* ═══════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════ */
  return (
    <div className="min-h-screen flex">
      {/* ── Left Panel: Branding ── */}
      <div className="hidden lg:flex lg:w-[55%] relative bg-slate-900 text-white flex-col justify-between p-12 overflow-hidden">
        {/* Background decoration */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '40px 40px'
        }} />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-brand-500/8 rounded-full blur-[100px]" />

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-11 w-11 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center shadow-glow ring-1 ring-brand-400/20">
              <ShieldCheck size={24} />
            </div>
            <span className="font-bold text-2xl tracking-tight">NIX AI</span>
          </div>
          <p className="text-slate-500 text-sm ml-14">Adversarial Intelligence Platform</p>
        </div>

        {/* Hero Content */}
        <div className="relative z-10 max-w-lg">
          <h1 className="text-4xl font-bold leading-tight mb-4">
            Stress-test clinical trials
            <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent"> before the FDA does.</span>
          </h1>
          <p className="text-slate-400 text-lg leading-relaxed mb-10">
            AI-powered adversarial agents that simulate regulatory and payer conflicts,
            so you can fix protocol issues before they become rejection letters.
          </p>

          {/* Feature cards */}
          <div className="space-y-4">
            <FeatureRow icon={<Shield size={18} />} title="Regulatory Agent" desc="Simulates FDA/EMA review committee objections" color="risk" />
            <FeatureRow icon={<TrendingUp size={18} />} title="Payer Agent" desc="Models CMS reimbursement & cost-effectiveness hurdles" color="money" />
            <FeatureRow icon={<Zap size={18} />} title="Smart Pivots" desc="AI-generated protocol amendments with confidence scores" color="brand" />
          </div>
        </div>

        {/* Bottom */}
        <div className="relative z-10 flex items-center gap-3 text-slate-600 text-xs">
          <div className="flex -space-x-2">
            {['SC', 'JW', 'MR', 'KL'].map((initials, i) => (
              <div key={i} className="h-7 w-7 rounded-full bg-slate-700 border-2 border-slate-900 flex items-center justify-center text-[9px] font-bold text-slate-300">
                {initials}
              </div>
            ))}
          </div>
          <span>Trusted by 200+ clinical trial teams worldwide</span>
        </div>
      </div>

      {/* ── Right Panel: Auth Form ── */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-[420px]">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="h-10 w-10 bg-gradient-to-br from-brand-500 to-brand-700 rounded-xl flex items-center justify-center text-white shadow-glow">
              <ShieldCheck size={22} />
            </div>
            <span className="font-bold text-xl text-slate-900 tracking-tight">NIX AI</span>
          </div>

          {/* Header */}
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">{headers[mode].title}</h2>
            <p className="text-slate-500 text-sm">{headers[mode].subtitle}</p>
          </div>

          {/* Success message */}
          {successMessage && (
            <div className="mb-5 p-3.5 bg-green-50 border border-green-200 rounded-xl text-sm text-green-700 flex items-start gap-2.5 animate-fade-in">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green-500" />
              {successMessage}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2.5 animate-fade-in">
              <div className="mt-0.5 shrink-0 h-4 w-4 rounded-full bg-red-100 flex items-center justify-center">
                <span className="text-red-600 text-xs font-bold">!</span>
              </div>
              {error}
            </div>
          )}

          {/* Dynamic form */}
          {renderForm()}

          {/* Footer */}
          <p className="text-center text-[11px] text-slate-400 mt-8">
            By signing in, you agree to NIX AI's Terms of Service and Privacy Policy
          </p>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════ */

/* ── Submit Button ── */
function SubmitButton({ isLoading, label, loadingLabel }) {
  return (
    <button type="submit" disabled={isLoading}
      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-500 hover:to-brand-600 text-white font-semibold py-3 rounded-xl transition-all duration-300 shadow-lg shadow-brand-600/25 hover:shadow-xl hover:shadow-brand-500/30 disabled:opacity-60 disabled:cursor-not-allowed">
      {isLoading ? (
        <>
          <Loader2 size={16} className="animate-spin" />
          {loadingLabel}
        </>
      ) : (
        <>
          {label}
          <ArrowRight size={16} />
        </>
      )}
    </button>
  );
}

/* ── Password Strength Indicator ── */
function PasswordStrength({ password }) {
  if (!password) return null;

  const checks = [
    { label: '8+ characters', pass: password.length >= 8 },
    { label: 'Uppercase', pass: /[A-Z]/.test(password) },
    { label: 'Lowercase', pass: /[a-z]/.test(password) },
    { label: 'Number', pass: /[0-9]/.test(password) },
    { label: 'Symbol', pass: /[^A-Za-z0-9]/.test(password) },
  ];
  const passed = checks.filter((c) => c.pass).length;

  return (
    <div className="mt-2 space-y-1.5">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={cn(
            'h-1 flex-1 rounded-full transition-colors',
            i <= passed
              ? passed <= 2 ? 'bg-red-400' : passed <= 3 ? 'bg-amber-400' : 'bg-green-400'
              : 'bg-slate-200'
          )} />
        ))}
      </div>
      {/* Checklist */}
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {checks.map((c) => (
          <span key={c.label} className={cn('text-[10px] font-medium transition-colors', c.pass ? 'text-green-600' : 'text-slate-400')}>
            {c.pass ? '✓' : '○'} {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Feature Row (left panel) ── */
function FeatureRow({ icon, title, desc, color }) {
  const colorMap = {
    risk: 'bg-risk-500/10 text-risk-400 border-risk-500/20',
    money: 'bg-money-500/10 text-money-400 border-money-500/20',
    brand: 'bg-brand-500/10 text-brand-400 border-brand-500/20',
  };

  return (
    <div className="flex items-start gap-4 group">
      <div className={cn('p-2.5 rounded-xl border shrink-0', colorMap[color])}>
        {icon}
      </div>
      <div>
        <h4 className="text-sm font-semibold text-slate-200 mb-0.5">{title}</h4>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
    </div>
  );
}
