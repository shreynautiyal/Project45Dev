// src/pages/Auth/Signup.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, Sparkles, Phone, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

/** Simple (local) password score: 0–4 */
function scorePassword(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (/[A-Z]/.test(pw)) s++;
  if (/[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return s;
}

const IB_SUBJECTS = [
  'Mathematics AA','Mathematics AI','Physics','Chemistry','Biology',
  'Computer Science','English Lang & Lit','Economics','Business',
  'History','Geography','Psychology','Spanish','French','Environmental Systems',
];

const MAX_SUBJECTS = 6;
const MIN_SUBJECTS = 3;

const StepCard: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <div className="bg-white rounded-2xl shadow-xl p-8">{children}</div>
);

const StepTitle: React.FC<{title: string; subtitle?: string}> = ({ title, subtitle }) => (
  <div className="text-center mb-6">
    <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-4">
      45
    </div>
    <h2 className="text-3xl font-bold text-gray-900">{title}</h2>
    {subtitle && <p className="text-gray-600 mt-2">{subtitle}</p>}
  </div>
);

const SubjectChip: React.FC<{label: string; active: boolean; disabled?: boolean; onClick: () => void}> = ({ label, active, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled && !active}
    className={`px-3 py-2 rounded-lg text-sm border transition ${
      active
        ? 'bg-blue-600 text-white border-blue-600'
        : `bg-gray-50 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-100'} border-gray-200 text-gray-800`
    }`}
  >
    {label}
  </button>
);

const ProgressDots: React.FC<{step: number}> = ({ step }) => (
  <div className="flex items-center justify-center gap-2 mb-6">
    {[0,1,2].map(i => (
      <div key={i} className={`h-2 rounded-full transition-all ${i <= step ? 'bg-blue-600 w-8' : 'bg-gray-200 w-2'}`} />
    ))}
  </div>
);

const container = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 } };

const Signup: React.FC = () => {
  const { user } = useAuthStore();

  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // form fields
  const [username, setUsername] = useState('');
  const [email, setEmail]       = useState('');
  const [phone, setPhone]       = useState(''); // optional
  const [password, setPassword] = useState('');
  const [confirm, setConfirm]   = useState('');
  const [subjects, setSubjects] = useState<string[]>([]);

  // validations
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameTaken, setUsernameTaken] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [resendCooldown, setResendCooldown] = useState(0);

  // password score
  const score = useMemo(() => scorePassword(password), [password]);
  const strengthColors = ['bg-red-500','bg-orange-500','bg-yellow-500','bg-lime-500','bg-emerald-600'];

  // can go next?
  const emailValid = /\S+@\S+\.\S+/.test(email);
  const canNext0 = username.trim().length >= 3 && !usernameTaken && emailValid && score >= 2 && password === confirm;
  const canNext1 = subjects.length >= MIN_SUBJECTS && subjects.length <= MAX_SUBJECTS;

  if (user) return <Navigate to="/dashboard" replace />;

  // username availability check (debounced-ish)
  useEffect(() => {
    let cancelled = false;
    async function check() {
      setUsernameTaken(false);
      setUsernameChecking(true);
      try {
        const uname = username.trim();
        if (uname.length < 3) return;
        const { count, error } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .ilike('username', uname);
        if (!cancelled) {
          if (error) {
            console.warn('[signup] username check error:', error);
          } else {
            setUsernameTaken((count ?? 0) > 0);
          }
        }
      } finally {
        if (!cancelled) setUsernameChecking(false);
      }
    }
    if (username) check();
    return () => { cancelled = true; };
  }, [username]);

  // subjects toggle w/ max cap
  const toggleSubj = (s: string) =>
    setSubjects((prev) => {
      if (prev.includes(s)) return prev.filter(x => x !== s);
      if (prev.length >= MAX_SUBJECTS) return prev; // cap
      return [...prev, s];
    });

  // resend verification (60s cooldown)
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown(v => Math.max(0, v - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  async function hydrateUserSubjectsFromNames(names: string[]) {
    if (!names?.length) return;
    try {
      const { error } = await supabase.rpc('set_initial_subjects', {
        p_subject_names: names,
      });
      if (error) console.warn('[signup] set_initial_subjects error:', error);
    } catch (e) {
      console.warn('[signup] set_initial_subjects exception:', e);
    }
  }

  async function handleCreate() {
    if (!canNext1) return;
    setLoading(true);
    setEmailError(null);

    try {
      // 1) create auth user + stash metadata (username, subjects, phone)
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
          data: { username, subjects, phone }
        }
      });
      if (error) throw error;

      // 2) If session exists now (email conf disabled), write user_subjects immediately
      if (data.session) {
        await hydrateUserSubjectsFromNames(subjects);

        // also upsert profiles
        try {
          await supabase.from('profiles').upsert(
            { id: data.user!.id, username, phone },
            { onConflict: 'id' }
          );
        } catch (_) {}

        toast.success('Account created!');
      } else {
        // email verification required — trigger will copy metadata later
        toast.success('Account created! We sent a verification link to your email.');
        setResendCooldown(60);
      }
    } catch (err: any) {
      const msg: string = err?.message ?? 'Failed to create account';
      if (/already registered|user already exists/i.test(msg)) {
        setEmailError('This email is already registered. Try signing in instead.');
        toast.error('Email already registered. Try signing in.');
      } else if (/password/i.test(msg)) {
        toast.error('Password not strong enough.');
      } else {
        toast.error(msg);
      }
      console.error('[signup] error:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!emailValid || resendCooldown > 0) return;
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: `${window.location.origin}/login` }
      });
      if (error) throw error;
      toast.success('Verification email re-sent!');
      setResendCooldown(60);
    } catch (err: any) {
      console.error('[signup] resend error:', err);
      toast.error(err?.message ?? 'Could not resend email.');
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <StepCard>
          <ProgressDots step={step} />

          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="step0" {...container} transition={{ duration: 0.35 }}>
                <StepTitle title="Join Project 45" subtitle="Kickstart your IB journey — we’ll personalise everything for you." />
                <form className="space-y-6" onSubmit={(e) => { e.preventDefault(); if (canNext0) setStep(1); }}>
                  {/* Username */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Username</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="Choose a username"
                        required
                      />
                    </div>
                    {username && username.length < 3 && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Username must be at least 3 characters.
                      </p>
                    )}
                    {!usernameChecking && usernameTaken && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> That username is taken.
                      </p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
                        className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent
                          ${emailError ? 'border-red-400' : 'border-gray-300'}`}
                        placeholder="you@school.com"
                        required
                      />
                    </div>
                    {email && !emailValid && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Please enter a valid email.
                      </p>
                    )}
                    {emailError && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> {emailError}
                      </p>
                    )}
                  </div>

                  {/* Phone (optional) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Phone (optional)</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="+971 5x xxx xxxx"
                      />
                    </div>
                  </div>

                  {/* Password + strength */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="Create a strong password"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>

                    {/* Strength bar */}
                    <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-full transition-all ${strengthColors[score]}`}
                        style={{ width: `${(score / 4) * 100}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-600 flex items-center gap-2">
                      <Check className={`h-4 w-4 ${password.length >= 8 ? 'text-emerald-600' : 'text-gray-300'}`} />
                      <span>8+ chars, uppercase, number, and symbol for max strength</span>
                    </div>
                  </div>

                  {/* Confirm */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Confirm Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                        placeholder="Confirm password"
                        required
                      />
                    </div>
                    {confirm && confirm !== password && (
                      <p className="mt-1 text-xs text-red-600 flex items-center gap-1">
                        <AlertTriangle className="h-3.5 w-3.5" /> Passwords don’t match.
                      </p>
                    )}
                  </div>

                  <motion.button
                    whileHover={{ scale: canNext0 ? 1.02 : 1 }}
                    whileTap={{ scale: canNext0 ? 0.98 : 1 }}
                    type="submit"
                    disabled={!canNext0}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                    <ArrowRight className="inline ml-2 h-4 w-4" />
                  </motion.button>

                  <div className="text-center">
                    <p className="text-gray-600">
                      Already have an account?{' '}
                      <Link to="/login" className="text-purple-600 hover:text-purple-700 font-medium">Sign in</Link>
                    </p>
                  </div>
                </form>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="step1" {...container} transition={{ duration: 0.35 }}>
                <StepTitle
                  title="Pick your IB subjects"
                  subtitle={`Choose ${MIN_SUBJECTS}–${MAX_SUBJECTS}. We’ll tailor your quests & decks.`}
                />
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
                  {IB_SUBJECTS.map(s => (
                    <SubjectChip
                      key={s}
                      label={s}
                      active={subjects.includes(s)}
                      disabled={subjects.length >= MAX_SUBJECTS}
                      onClick={() => toggleSubj(s)}
                    />
                  ))}
                </div>
                <div className="mb-3 text-sm text-gray-600">
                  <span className="font-medium">{subjects.length}</span> selected (max {MAX_SUBJECTS})
                </div>
                {!canNext1 && (
                  <p className="mb-3 text-xs text-red-600 flex items-center gap-1">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Pick at least {MIN_SUBJECTS} subjects (max {MAX_SUBJECTS}).
                  </p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(0)}
                    className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-3 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={() => canNext1 && setStep(2)}
                    className="flex-1 bg-blue-600 text-white rounded-lg py-3 hover:bg-blue-700 disabled:opacity-50"
                    disabled={!canNext1}
                  >
                    Continue
                  </button>
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="step2" {...container} transition={{ duration: 0.35 }}>
                <StepTitle title="Ready to launch" subtitle="We’ll send a verification email to finish setup." />
                <div className="rounded-xl bg-indigo-50 p-4 mb-6 border border-indigo-100">
                  <div className="flex items-center gap-3">
                    <Sparkles className="h-5 w-5 text-indigo-600" />
                    <div>
                      <p className="text-indigo-900 font-semibold">Your Plan</p>
                      <p className="text-indigo-700 text-sm">
                        <strong>{username}</strong> · {email} · {subjects.length} subjects selected {phone ? `· ${phone}` : ''}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep(1)}
                    className="flex-1 border border-gray-300 text-gray-700 rounded-lg py-3 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleCreate}
                    disabled={loading}
                    className="flex-1 bg-emerald-600 text-white rounded-lg py-3 hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {loading ? 'Creating…' : 'Create Account'}
                  </button>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <p className="text-xs text-gray-500">Didn’t get the email?</p>
                  <button
                    onClick={handleResend}
                    disabled={!emailValid || resendCooldown > 0}
                    className="text-sm text-blue-700 hover:underline disabled:opacity-50"
                  >
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend verification email'}
                  </button>
                </div>

                <p className="mt-6 text-xs text-gray-500 text-center">
                  By continuing you agree to our Terms. We’ll never share your data.
                </p>

                <div className="mt-6 text-center">
                  <p className="text-gray-600">
                    Already have an account?{' '}
                    <Link to="/login" className="text-purple-600 hover:text-purple-700 font-medium">Sign in</Link>
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </StepCard>
      </div>
    </div>
  );
};

export default Signup;
