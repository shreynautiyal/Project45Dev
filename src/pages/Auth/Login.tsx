// src/pages/Auth/Login.tsx
import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';

const emailRegex = /\S+@\S+\.\S+/;

const FloatingDots: React.FC = () => {
  const dots = useMemo(() => Array.from({ length: 18 }), []);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((_, i) => {
        const size = Math.random() * 6 + 4; // 4–10px
        const left = Math.random() * 100;
        const delay = Math.random() * 4;
        const duration = 8 + Math.random() * 10; // 8–18s
        const opacity = 0.06 + Math.random() * 0.08;

        return (
          <motion.span
            key={i}
            className="absolute rounded-full bg-neutral-400"
            style={{ width: size, height: size, left: `${left}%`, top: `${Math.random()*100}%`, opacity }}
            animate={{ y: [0, -20, 0] }}
            transition={{ duration, delay, repeat: Infinity, ease: 'easeInOut' }}
          />
        );
      })}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.02),transparent_60%)]" />
    </div>
  );
};

function mapAuthError(err: unknown) {
  const msg = (err as any)?.message?.toString?.() ?? 'Unexpected error';
  const lower = msg.toLowerCase();

  // Common Supabase/Auth errors normalization
  if (lower.includes('invalid login') || lower.includes('invalid email or password')) {
    return {
      field: 'password' as const,
      title: 'Incorrect email or password',
      help: 'Double-check your email and re-enter your password. Passwords are case-sensitive.'
    };
  }
  if (lower.includes('email not confirmed') || lower.includes('confirm your email')) {
    return {
      field: 'email' as const,
      title: 'Email not verified',
      help: 'Please verify your email. Check your inbox (and spam) for the confirmation link, then try again.'
    };
  }
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return {
      field: 'general' as const,
      title: 'Too many attempts',
      help: 'You’ve tried too many times. Wait a minute before trying again.'
    };
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('timeout')) {
    return {
      field: 'general' as const,
      title: 'Network issue',
      help: 'Please check your internet connection and try again.'
    };
  }
  // Default
  return {
    field: 'general' as const,
    title: 'Couldn’t sign in',
    help: msg
  };
}

const Login: React.FC = () => {
  const { signIn } = useAuthStore();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({ email: '', password: '' });
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Inline errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const isEmailValid = emailRegex.test(formData.email);
  const canSubmit = isEmailValid && formData.password.length > 0 && !loading;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setPasswordError(null);
    setGeneralError(null);

    if (!isEmailValid) {
      setEmailError('Please enter a valid email address (e.g., name@example.com).');
      return;
    }
    if (!formData.password) {
      setPasswordError('Please enter your password.');
      return;
    }

    setLoading(true);
    try {
      await signIn(formData.email, formData.password);
      toast.success('Signed in successfully');
      navigate('/dashboard', { replace: true });
    } catch (error) {
      const friendly = mapAuthError(error);
      // Show toast + inline help
      toast.error(friendly.title);
      if (friendly.field === 'email') setEmailError(friendly.help);
      else if (friendly.field === 'password') setPasswordError(friendly.help);
      else setGeneralError(friendly.help);
      console.error('[login] signIn error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-neutral-50 flex items-center justify-center px-4">
      <FloatingDots />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative z-10 max-w-md w-full"
      >
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            {/* Monochrome emblem (no gradient) */}
            <div className="w-16 h-16 bg-white border border-neutral-200 rounded-xl flex items-center justify-center text-neutral-900 text-2xl font-bold mx-auto mb-4">
              45
            </div>
            <h2 className="text-3xl font-bold text-neutral-900">Welcome back</h2>
            <p className="text-neutral-600 mt-2">Sign in to continue your IB journey</p>
          </div>
<div className="flex items-center justify-between mb-8">
  <Link
    to="/"
    className="inline-flex items-center gap-2 text-sm text-neutral-700 hover:text-neutral-900"
  >
    ← Back to Home
  </Link>
</div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className={[
                    'w-full pl-10 pr-4 py-3 border rounded-lg bg-white placeholder-neutral-400 focus:outline-none focus:ring-2',
                    emailError ? 'border-red-400 focus:ring-red-500' : 'border-neutral-300 focus:ring-neutral-900'
                  ].join(' ')}
                  placeholder="you@example.com"
                  required
                />
              </div>
              {emailError && <p className="mt-2 text-sm text-red-600">{emailError}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 w-5 h-5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  className={[
                    'w-full pl-10 pr-12 py-3 border rounded-lg bg-white placeholder-neutral-400 focus:outline-none focus:ring-2',
                    passwordError ? 'border-red-400 focus:ring-red-500' : 'border-neutral-300 focus:ring-neutral-900'
                  ].join(' ')}
                  placeholder="Your password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-900"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {passwordError && <p className="mt-2 text-sm text-red-600">{passwordError}</p>}
            </div>

            {generalError && (
              <div className="text-sm text-red-600 -mt-2">{generalError}</div>
            )}

            <motion.button
              whileHover={{ scale: canSubmit ? 1.02 : 1 }}
              whileTap={{ scale: canSubmit ? 0.98 : 1 }}
              type="submit"
              disabled={!canSubmit}
              className={[
                'w-full py-3 rounded-lg font-semibold transition-all',
                canSubmit ? 'bg-neutral-900 text-white hover:bg-black' : 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
              ].join(' ')}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </motion.button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-neutral-600">
              Don’t have an account?{' '}
              <Link to="/signup" className="underline underline-offset-4 hover:no-underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
