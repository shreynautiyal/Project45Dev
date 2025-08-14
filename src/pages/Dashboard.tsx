// src/pages/Dashboard.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BookOpen, MessageCircle, PenTool, Trophy, Crown, LineChart as LineChartIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge as BadgeUI } from '../components/ui/Badge';
import { getXPProgress } from '../lib/utils';
import type { Profile } from '../lib/supabase';
import { Area, AreaChart, Tooltip, XAxis, YAxis } from 'recharts';

/* ------------------------------------------------
   Hook: element size via ResizeObserver (no deps)
-------------------------------------------------*/
function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (!r) return;
      // guard against tiny/negative values during layout thrash
      setSize({ width: Math.max(1, Math.round(r.width)), height: Math.max(1, Math.round(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return [ref, size] as const;
}

/* ------------------------------------------------
   Measured chart container (no ResponsiveContainer)
-------------------------------------------------*/
function SafeAreaChart({ data }: { data: { date: string; xp: number }[] }) {
  const [ref, size] = useElementSize<HTMLDivElement>();
  const ready = size.width > 10 && size.height > 10;

  return (
    <div ref={ref} className="h-full w-full min-w-0">
      {ready ? (
        <AreaChart width={size.width} height={size.height} data={data} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.08} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="#A3A3A3" fontSize={12} tickLine={false} axisLine={false} />
          <YAxis stroke="#A3A3A3" fontSize={12} tickLine={false} axisLine={false} width={32} />
          <Tooltip
            contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8, color: '#eee' }}
            labelFormatter={(d) => `Day ${d}`}
            formatter={(v: any) => [v, 'XP']}
          />
          <Area type="monotone" dataKey="xp" stroke="#2563eb" strokeWidth={2.25} fill="url(#xpFill)" />
        </AreaChart>
      ) : (
        // tiny fallback placeholder to avoid layout jump while width is 0
        <div className="h-full w-full" />
      )}
    </div>
  );
}

/* ------------------------------------------------
   No-deps vertical resizer (locks width = 100%)
-------------------------------------------------*/
type VerticalResizableProps = {
  initialHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  className?: string;
  children: React.ReactNode;
};
function VerticalResizable({
  initialHeight = 192,
  minHeight = 140,
  maxHeight = 600,
  className = '',
  children
}: VerticalResizableProps) {
  const [h, setH] = useState(initialHeight);
  const state = useRef<{ y0: number; h0: number } | null>(null);

  const onDown = (e: React.PointerEvent) => {
    e.preventDefault();
    state.current = { y0: e.clientY, h0: h };
    (e.target as Element).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!state.current) return;
    const dy = e.clientY - state.current.y0;
    const next = Math.max(minHeight, Math.min(maxHeight, state.current.h0 + dy));
    setH(next);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!state.current) return;
    state.current = null;
    (e.target as Element).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className={`relative w-full min-w-0 overflow-y-auto overflow-x-hidden rounded-md ${className}`}
      style={{ height: h, minHeight, maxHeight }}
    >
      {children}
      <div
        role="slider"
        aria-label="Resize height"
        title="Drag to resize"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        className="absolute bottom-1 right-1 h-3 w-3 cursor-ns-resize rounded-sm bg-neutral-300 dark:bg-neutral-700"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}

/* ------------------------------------------------
   Normalize whatever getXPProgress() returns
-------------------------------------------------*/
function normalizeXP(p: any) {
  const level = p?.level ?? 1;
  const progress = p?.progress ?? p?.current ?? 0;
  const total = p?.total ?? p?.goal ?? p?.toNext ?? 100;
  const percentage = p?.percentage ?? (total ? Math.min(100, Math.round((progress / total) * 100)) : 0);
  return { level, progress, total, percentage };
}

/* ------------------------------------------------
   Helpers
-------------------------------------------------*/
const startOfDayISO = (d = new Date()) => { const x = new Date(d); x.setHours(0,0,0,0); return x.toISOString(); };
const daysAgoISO = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(0,0,0,0); return d.toISOString(); };

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-neutral-200 dark:bg-neutral-800 ${className}`} />;
}

/* ------------------------------------------------
   Types
-------------------------------------------------*/
type XpRow = { amount: number; created_at: string };
type LeaderRow = { id: string; username: string | null; xp: number | null; streak?: number | null; profile_picture?: string | null };

// (Background ornaments removed from Dashboard for a cleaner full-bleed layout)

/* ------------------------------------------------
   Motion variants
-------------------------------------------------*/
const pageVariants = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as any } } } as const;
const gridVariants = { animate: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } } as const;
const cardVariants = { initial: { opacity: 0, y: 10, scale: 0.98 }, animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as any } } } as const;
const hoverLift = 'transition-transform will-change-transform hover:-translate-y-0.5';

/* ------------------------------------------------
   Component
-------------------------------------------------*/
export default function Dashboard() {
  const { profile } = useAuthStore() as { profile: Profile | null };
  const uid = profile?.id || '';

  const [loading, setLoading] = useState(true);
  const [todayXP, setTodayXP] = useState(0);
  const [weekXP, setWeekXP] = useState(0);
  const [weekSeries, setWeekSeries] = useState<{ date: string; xp: number }[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([]);
  const [subjects, setSubjects] = useState<Array<{ id: string; name: string; icon?: string }>>([]);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  const [flashcardsCount, setFlashcardsCount] = useState(0);
  const [essaysCount, setEssaysCount] = useState(0);
  const [chatsCount, setChatsCount] = useState(0);

  const [xpTotal, setXpTotal] = useState<number>(profile?.xp || 0);

  const isPro = useMemo(() => Boolean((profile as any)?.is_pro ?? ((profile as any)?.plan === 'pro')), [profile]);
  const xpRaw = useMemo(() => getXPProgress(xpTotal), [xpTotal]);
  const xpProgress = useMemo(() => normalizeXP(xpRaw), [xpRaw]);

  const loadCore = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const sinceToday = startOfDayISO();
      const since7 = daysAgoISO(6);

      const [xpRes, flashRes, essayRes, chatRes, lbRes, xpAll] = await Promise.all([
        supabase.from('xp_events').select('amount, created_at').eq('user_id', uid).gte('created_at', since7).order('created_at', { ascending: true }),
        supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('essays').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('role', 'user'),
        supabase.from('profiles').select('id, username, xp, streak, profile_picture').order('xp', { ascending: false }).limit(5),
        supabase.from('xp_events').select('amount').eq('user_id', uid),
      ]);

      const xpSum = (xpAll.data ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
      setXpTotal(xpSum || profile?.xp || 0);

      setFlashcardsCount(flashRes.count ?? 0);
      setEssaysCount(essayRes.count ?? 0);
      setChatsCount(chatRes.count ?? 0);

      setLeaderboard((lbRes.data as LeaderRow[]) || []);

      const byDay = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0,0,0,0);
        const key = d.toISOString().slice(0,10);
        byDay.set(key, 0);
      }
      (xpRes.data as XpRow[] | null)?.forEach((r) => {
        const key = new Date(r.created_at).toISOString().slice(0,10);
        if (byDay.has(key)) byDay.set(key, (byDay.get(key) || 0) + (r.amount || 0));
      });
      const series = Array.from(byDay.entries()).map(([date, xp]) => ({ date, xp }));
      setWeekSeries(series);

      const tKey = new Date(sinceToday).toISOString().slice(0,10);
      const wXP = series.reduce((s, p) => s + p.xp, 0);
      const tXP = series.find((p) => p.date === tKey)?.xp || 0;
      setWeekXP(wXP);
      setTodayXP(tXP);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [uid, profile?.xp]);

  useEffect(() => { void loadCore(); }, [loadCore]);

  // Load user's subjects for Quick Access (subject-specific chat)
  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    const loadSubjects = async () => {
      setSubjectsLoading(true);
      try {
        const { data, error } = await supabase.rpc('get_my_subjects');
        if (error) throw error;
        if (cancelled) return;
        const mapped = (data || []).map((r: any) => ({ id: r.subject_id, name: r.name, icon: r.icon }));
        setSubjects(mapped);
      } catch {
        setSubjects([]);
      } finally {
        if (!cancelled) setSubjectsLoading(false);
      }
    };
    loadSubjects();
    return () => { cancelled = true; };
  }, [uid]);

  const streakDays = (profile as any)?.streak ?? (profile as any)?.streak_days ?? 0;

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-transparent text-neutral-900 dark:text-neutral-100">
      <div className="relative w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <motion.div variants={pageVariants} initial="initial" animate="animate" className="relative z-10 mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
              {profile?.username ? `Welcome back, ${profile.username}` : 'Welcome back'}
            </h1>
            <p className="text-sm text-neutral-600">Stay on streak and level up.</p>
          </div>
          {!isPro && (
            <Link to="/upgrade" className="group">
              <Button className="gap-2 bg-neutral-900 text-white hover:bg-black">
                <Crown className="h-4 w-4" /> Upgrade
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
            </Link>
          )}
        </motion.div>

        {/* Grid */}
        <motion.div variants={gridVariants} initial="initial" animate="animate" className="relative z-10 grid grid-cols-1 gap-6 md:grid-cols-6 xl:grid-cols-12">
          {/* Left stack: banner + chart (chart sits immediately under progress bar) */}
          <motion.div variants={cardVariants} className={`md:col-span-4 xl:col-span-8 min-w-0`}>
            <div className="grid grid-cols-1 gap-3 md:min-w-0">
              <div className={`${hoverLift}`}>
                <Card className="bg-gradient-to-r from-blue-50 to-white dark:from-neutral-900/60 dark:to-neutral-900/40 border-0 shadow-none">
                  <CardContent className="p-5">
                    {loading ? <Skeleton className="h-10 w-full" /> : (
                      <>
                        <div className="flex items-center justify-between text-sm">
                          <div className="font-semibold text-neutral-800">{xpProgress.progress} XP</div>
                          <div className="text-neutral-600">Level {xpProgress.level}</div>
                        </div>
                        <div className="mt-2"><ProgressBar value={xpProgress.progress} max={xpProgress.total} /></div>
                        <div className="mt-2 flex items-center justify-between text-sm text-neutral-600">
                          <span className="tabular-nums">{streakDays}-day streak</span>
                          <span>Today +{todayXP} • Week +{weekXP}</span>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className={`${hoverLift}`}>
                <Card className="bg-white/60 dark:bg-neutral-900/60 border border-neutral-200/60 dark:border-neutral-800/60">
                  <CardHeader className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2"><LineChartIcon className="h-4 w-4" /> 7-Day Progress</CardTitle>
                    {!loading && (
                      <div className="hidden md:flex items-center gap-2">
                        {[{ label: 'Chats', value: chatsCount }, { label: 'Essays', value: essaysCount }, { label: 'Cards', value: flashcardsCount }].map((item) => (
                          <div key={item.label} className="rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-center text-sm bg-white">
                            <div className="text-[11px] text-neutral-500">{item.label}</div>
                            <div className="text-base font-semibold tabular-nums">{item.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    {loading ? (
                      <Skeleton className="h-48 w-full" />
                    ) : (
                      <div className="flex flex-col md:flex-row gap-3 md:min-w-0">
                        <div className="flex-1 min-w-0">
                          <AnimatePresence mode="wait">
                            <motion.div key="xp-area" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }}>
                              <VerticalResizable initialHeight={192} minHeight={160} maxHeight={560}>
                                <SafeAreaChart data={weekSeries} />
                              </VerticalResizable>
                            </motion.div>
                          </AnimatePresence>
                        </div>
                        <div className="md:hidden grid grid-cols-3 gap-2">
                          {[{ label: 'Chats', value: chatsCount }, { label: 'Essays', value: essaysCount }, { label: 'Cards', value: flashcardsCount }].map((item) => (
                            <div key={item.label} className="rounded-md border border-neutral-200 dark:border-neutral-800 px-3 py-2 text-center text-sm bg-white">
                              <div className="text-[11px] text-neutral-500">{item.label}</div>
                              <div className="text-base font-semibold tabular-nums">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </motion.div>

          {/* Daily Leaderboard (right column) */}
          <motion.div variants={cardVariants} className={`md:col-span-2 xl:col-span-4 min-w-0 ${hoverLift}`}>
            <Card className="bg-white/60 dark:bg-neutral-900/60 border border-neutral-200/60 dark:border-neutral-800/60">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><Trophy className="h-4 w-4" /> Daily Leaderboard</CardTitle>
                <BadgeUI variant="secondary">Top 5</BadgeUI>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-24 w-full" />
                ) : leaderboard.length === 0 ? (
                  <div className="text-sm text-neutral-500 dark:text-neutral-400">No data yet.</div>
                ) : (
                  <VerticalResizable initialHeight={200} minHeight={140} maxHeight={480}>
                    <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
                      {leaderboard.map((p, i) => (
                        <motion.li
                          key={p.id}
                          className="flex items-center justify-between py-2 text-sm"
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: i * 0.04 }}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                              i < 3 ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                                    : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                            }`}>
                              {i + 1}
                            </div>
                            <span className="truncate">{p.username || 'Anon'}</span>
                          </div>
                          <div className="flex items-center gap-4">
                            {typeof p.streak === 'number' && (
                              <span className="text-xs text-neutral-500 dark:text-neutral-400">🔥 {p.streak}</span>
                            )}
                            <span className="text-xs text-neutral-500 dark:text-neutral-400">XP {p.xp ?? 0}</span>
                          </div>
                        </motion.li>
                      ))}
                    </ul>
                  </VerticalResizable>
                )}
              </CardContent>
            </Card>
          </motion.div>

          

          {/* Quick Access (under leaderboard, same right column) */}
          <motion.div variants={cardVariants} className={`md:col-span-2 xl:col-span-4 min-w-0 ${hoverLift}`}>
            <Card className="bg-transparent border-0 shadow-none">
              <CardHeader className="pb-2"><CardTitle>Quick access</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                <Link to="/flashcards" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-white hover:bg-neutral-50 text-sm">
                  <BookOpen className="h-4 w-4" /> Flashcards
                </Link>
                <Link to="/essays" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-white hover:bg-neutral-50 text-sm">
                  <PenTool className="h-4 w-4" /> Essays
                </Link>
                <Link to="/chat" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border bg-white hover:bg-neutral-50 text-sm">
                  <MessageCircle className="h-4 w-4" /> AI Chat
                </Link>
                </div>

                {/* Subjects quick jump */}
                {subjectsLoading ? (
                  <Skeleton className="h-8 w-40" />
                ) : subjects.length ? (
                  <div>
                    <div className="text-xs text-neutral-500 mb-2">Your subjects</div>
                    <div className="flex flex-wrap gap-2">
                      {subjects.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => { try { localStorage.setItem('lh.selectedSubjectId', s.id); } catch {}; window.location.href = '/chat'; }}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border bg-white hover:bg-neutral-50 text-sm"
                          title={`Open ${s.name} chat`}
                        >
                          <span className="text-base" aria-hidden="true">{s.icon || '📘'}</span>
                          <span className="truncate max-w-[10rem]">{s.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </CardContent>
            </Card>
          </motion.div>
        </motion.div>

        {/* Subtle footer counts */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 0.9 }} transition={{ delay: 0.2 }} className="relative z-10 mt-8 text-xs text-neutral-500 dark:text-neutral-400">
          {flashcardsCount} cards • {essaysCount} essays • {chatsCount} chats logged
        </motion.div>
      </div>
    </div>
  );
}

export { Dashboard };
