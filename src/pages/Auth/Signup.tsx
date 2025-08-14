// src/pages/Auth/Signup.tsx
import React, { useMemo, useState, useEffect } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Lock, User, Eye, EyeOff, ArrowRight, Check, Sparkles, Phone, AlertTriangle
} from 'lucide-react';
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

/* ----------------------------- UI Bits ----------------------------- */

const StepCard: React.FC<{children: React.ReactNode}> = ({ children }) => (
  <div className="bg-gradient-to-br from-white via-purple-50/30 to-pink-50/30 rounded-2xl shadow-xl p-8 border border-white/50">{children}</div>
);

const StepTitle: React.FC<{title: string; subtitle?: string}> = ({ title, subtitle }) => (
  <div className="text-center mb-6">
    {/* Monochrome emblem (no gradient) */}
    <div className="w-16 h-16 bg-white border border-neutral-200 rounded-xl flex items-center justify-center text-neutral-900 text-2xl font-bold mx-auto mb-4">
      45
    </div>
    <h2 className="text-3xl font-bold text-neutral-900">{title}</h2>
    {subtitle && <p className="text-neutral-600 mt-2">{subtitle}</p>}
  </div>
);

const SubjectChip: React.FC<{label: string; active: boolean; disabled?: boolean; onClick: () => void}> = ({ label, active, disabled, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled && !active}
    className={[
      'px-3 py-2 rounded-lg text-sm border transition',
      active
        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white border-purple-600 shadow-md'
        : `bg-white/80 ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-50/50'} border-neutral-200 text-neutral-800 hover:border-purple-300`
    ].join(' ')}
  >
    {label}
  </button>
);

const ProgressDots: React.FC<{step: number}> = ({ step }) => (
  <div className="flex items-center justify-center gap-2 mb-6">
    {[0,1,2].map(i => (
      <div
        key={i}
        className={`h-2 rounded-full transition-all ${i <= step ? 'bg-gradient-to-r from-purple-600 to-pink-600 w-8' : 'bg-neutral-200 w-2'}`}
      />
    ))}
  </div>
);



const container = { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -20 } };

/* ----------------------------- Component ----------------------------- */

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

  async function hydrateUserSubjectsFromNames(names: string[], userId?: string) {
    if (!names?.length) return;
    try {
      const { error } = await supabase.rpc('set_initial_subjects', {
        p_subject_names: names,
        ...(userId ? { p_user_id: userId } : {}),
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
        await hydrateUserSubjectsFromNames(subjects, data.user!.id);

        // keep your profile upsert
        try {
          await supabase.from('profiles').upsert(
            { id: data.user!.id, username, phone },
            { onConflict: 'id' }
          );
        } catch (_) {}

        toast.success('Account created!');
      } else {
        // no session yet (email verification flow)
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

  /* ----------------------------- Render ----------------------------- */

  return (
          <div className="relative min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-rose-50 text-neutral-900">
      

              <div className="relative z-10 max-w-3xl mx-auto px-4 py-10">
          <div className="absolute inset-0 bg-gradient-to-br from-white/80 to-white/60 backdrop-blur-sm rounded-3xl"></div>
        <div className="flex items-center justify-between mb-8">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-neutral-700 hover:text-neutral-900">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-neutral-300">45</span>
            <span className="font-medium">Project 45</span>
          </Link>
          <div className="text-sm">
            Already have an account?{' '}
            <Link to="/login" className="underline underline-offset-4 hover:no-underline">
              Log in
            </Link>
          </div>
        </div>

        <ProgressDots step={step} />

        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step-0"
              initial={container.initial}
              animate={container.animate}
              exit={container.exit}
            >
              <StepCard>
                <StepTitle
                  title="Create your account"
                  subtitle="Monochrome, clean, and simple — no gradients."
                />

                <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (canNext0) setStep(1); }}>
                  {/* Username */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Username</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 rounded-lg border border-neutral-300 bg-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="yourname"
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {usernameChecking ? (
                          <Sparkles className="w-4 h-4 text-neutral-400 animate-pulse" />
                        ) : username && !usernameTaken && username.trim().length >= 3 ? (
                          <Check className="w-4 h-4 text-neutral-900" />
                        ) : usernameTaken ? (
                          <AlertTriangle className="w-4 h-4 text-neutral-700" />
                        ) : null}
                      </div>
                    </div>
                    {usernameTaken && (
                      <p className="mt-1 text-sm text-neutral-600">That username is taken. Try another.</p>
                    )}
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 rounded-lg border border-neutral-300 bg-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="you@example.com"
                      />
                    </div>
                    {emailError && <p className="mt-1 text-sm text-neutral-700">{emailError}</p>}
                  </div>

                  {/* Phone (optional) */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Phone (optional)</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                      <input
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 rounded-lg border border-neutral-300 bg-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="+971 5x xxx xxxx"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-10 pr-10 py-2 rounded-lg border border-neutral-300 bg-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="••••••••"
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-900"
                        onClick={() => setShowPassword(v => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {/* Grayscale strength meter */}
                    <div className="flex gap-1 mt-2" aria-hidden>
                      {[0,1,2,3,4].map((i) => (
                        <div
                          key={i}
                          className={`h-1.5 flex-1 rounded ${i < score ? 'bg-neutral-900' : 'bg-neutral-200'}`}
                        />
                      ))}
                    </div>
                    <p className="mt-1 text-xs text-neutral-600">Use 8+ chars, an uppercase letter, a number, and a symbol.</p>
                  </div>

                  {/* Confirm */}
                  <div>
                    <label className="block text-sm font-medium mb-2">Confirm password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-500" />
                      <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 rounded-lg border border-neutral-300 bg-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-900"
                        placeholder="••••••••"
                      />
                    </div>
                    {confirm && confirm !== password && (
                      <p className="mt-1 text-sm text-neutral-700">Passwords don’t match.</p>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <Link to="/login" className="text-sm text-neutral-700 underline underline-offset-4 hover:no-underline">
                      I already have an account
                    </Link>
                    <button
                      type="submit"
                      disabled={!canNext0}
                                          className={[
                      'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
                      canNext0 ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-lg' : 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                    ].join(' ')}
                    >
                      Continue
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </form>
              </StepCard>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step-1"
              initial={container.initial}
              animate={container.animate}
              exit={container.exit}
            >
              <StepCard>
                <StepTitle
                  title="Pick your subjects"
                  subtitle={`Choose ${MIN_SUBJECTS}–${MAX_SUBJECTS} to personalize your experience.`}
                />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                  {IB_SUBJECTS.map((s) => {
                    const isActive = subjects.includes(s);
                    const atCap = !isActive && subjects.length >= MAX_SUBJECTS;
                    return (
                      <SubjectChip
                        key={s}
                        label={s}
                        active={isActive}
                        disabled={atCap}
                        onClick={() => toggleSubj(s)}
                      />
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-sm text-neutral-700 mb-6">
                  <span>
                    Selected: <span className="font-medium">{subjects.length}</span> / {MAX_SUBJECTS}
                  </span>
                  {subjects.length < MIN_SUBJECTS && (
                    <span>Pick at least {MIN_SUBJECTS}.</span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 text-neutral-800 hover:bg-neutral-100"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => canNext1 && setStep(2)}
                    disabled={!canNext1}
                    className={[
                      'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
                      canNext1 ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-lg' : 'bg-neutral-200 text-neutral-500 cursor-not-allowed'
                    ].join(' ')}
                  >
                    Continue
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </StepCard>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              initial={container.initial}
              animate={container.animate}
              exit={container.exit}
            >
              <StepCard>
                <StepTitle
                  title="Review & create"
                  subtitle="Check your details and create your account."
                />

                <div className="space-y-4 mb-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                      <div className="text-xs text-neutral-500">Username</div>
                      <div className="font-medium">{username || '—'}</div>
                    </div>
                    <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                      <div className="text-xs text-neutral-500">Email</div>
                      <div className="font-medium break-all">{email || '—'}</div>
                    </div>
                    <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                      <div className="text-xs text-neutral-500">Phone</div>
                      <div className="font-medium">{phone || '—'}</div>
                    </div>
                    <div className="p-3 rounded-lg border border-neutral-200 bg-neutral-50">
                      <div className="text-xs text-neutral-500">Subjects</div>
                      <div className="font-medium">
                        {subjects.length ? subjects.join(', ') : '—'}
                      </div>
                    </div>
                  </div>

                  {resendCooldown > 0 && (
                    <div className="flex items-center gap-2 text-sm text-neutral-700">
                      <Mail className="w-4 h-4" />
                      Verification link sent. You can request another in {resendCooldown}s.
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 text-neutral-800 hover:bg-neutral-100"
                  >
                    Back
                  </button>

                  <button
                    type="button"
                    onClick={handleCreate}
                    disabled={loading}
                    className={[
                      'inline-flex items-center gap-2 px-4 py-2 rounded-lg',
                      loading ? 'bg-neutral-300 text-neutral-600 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-lg'
                    ].join(' ')}
                  >
                    {loading ? 'Creating...' : 'Create account'}
                    {!loading && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>

                <p className="mt-6 text-xs text-neutral-500">
                  By creating an account you agree to our{' '}
                  <Link to="/terms" className="underline underline-offset-4 hover:no-underline">Terms</Link> &{' '}
                  <Link to="/privacy" className="underline underline-offset-4 hover:no-underline">Privacy Policy</Link>.
                </p>
              </StepCard>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Signup;
