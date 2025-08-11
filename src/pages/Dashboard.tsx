// src/pages/Dashboard.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight, BookOpen, MessageCircle, PenTool, Trophy, Zap, Crown, LineChart as LineChartIcon
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
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

/* ------------------------------------------------
   Normalize whatever getXPProgress() returns
-------------------------------------------------*/
function normalizeXP(p: any) {
  const level = p?.level ?? 1;
  const progress = p?.progress ?? p?.current ?? 0;
  const total =
    p?.total ??
    p?.goal ??
    p?.toNext ??
    100;
  const percentage =
    p?.percentage ?? (total ? Math.min(100, Math.round((progress / total) * 100)) : 0);
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

/* ------------------------------------------------
   Background Ornaments (subtle, monochrome)
-------------------------------------------------*/
const BackgroundOrnaments: React.FC = () => {
  // Tiny floating dots + very soft drifting grid
  const dots = Array.from({ length: 22 }).map((_, i) => {
    // deterministic-ish layout without Math.random at runtime
    const seed = i + 1;
    const size = (seed % 7) + 3; // 3–9px
    const left = (seed * 37) % 100; // 0–99
    const top = (seed * 53) % 100;  // 0–99
    const delay = (seed % 8) * 0.35;
    const duration = 10 + (seed % 9); // 10–18s
    const opacity = 0.05 + ((seed % 5) * 0.015); // 0.05–0.11
    return { size, left, top, delay, duration, opacity, key: i };
  });

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Soft drifting grid overlay */}
      <motion.div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(0,0,0,0.04) 1px, transparent 1px),' +
            'linear-gradient(to bottom, rgba(0,0,0,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
        animate={{ x: [-20, 0, -20] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Floating dots */}
      {dots.map(d => (
        <motion.span
          key={d.key}
          className="absolute rounded-full bg-neutral-400"
          style={{ width: d.size, height: d.size, left: `${d.left}%`, top: `${d.top}%`, opacity: d.opacity, filter: 'blur(0.2px)' }}
          animate={{ y: [0, -18, 0] }}
          transition={{ duration: d.duration, delay: d.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
      {/* Center vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.03),transparent_60%)]" />
    </div>
  );
};

/* ------------------------------------------------
   Motion variants
-------------------------------------------------*/
const pageVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.5, ease: 'easeOut' } },
};

const gridVariants = {
  animate: {
    transition: { staggerChildren: 0.06, delayChildren: 0.05 }
  }
};

const cardVariants = {
  initial: { opacity: 0, y: 10, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.35, ease: 'easeOut' } },
};

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

  const [flashcardsCount, setFlashcardsCount] = useState(0);
  const [essaysCount, setEssaysCount] = useState(0);
  const [chatsCount, setChatsCount] = useState(0);

  const [xpTotal, setXpTotal] = useState<number>(profile?.xp || 0);

  const isPro = useMemo(
    () => Boolean((profile as any)?.is_pro ?? ((profile as any)?.plan === 'pro')),
    [profile]
  );

  const xpRaw = useMemo(() => getXPProgress(xpTotal), [xpTotal]);
  const xpProgress = useMemo(() => normalizeXP(xpRaw), [xpRaw]);

  /* ------------------------------------------------
     Data
  -------------------------------------------------*/
  const loadCore = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    try {
      const sinceToday = startOfDayISO();
      const since7 = daysAgoISO(6); // inclusive: 7 points including today

      const [xpRes, flashRes, essayRes, chatRes, lbRes, xpAll] = await Promise.all([
        supabase.from('xp_events').select('amount, created_at').eq('user_id', uid).gte('created_at', since7).order('created_at', { ascending: true }),
        supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('essays').select('*', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('user_id', uid).eq('role', 'user'),
        supabase.from('profiles').select('id, username, xp, streak, profile_picture').order('xp', { ascending: false }).limit(5),
        supabase.from('xp_events').select('amount').eq('user_id', uid),
      ]);

      // Totals (fallback if profile.xp isn't maintained)
      const xpSum = (xpAll.data ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
      setXpTotal(xpSum || profile?.xp || 0);

      // Counts
      setFlashcardsCount(flashRes.count ?? 0);
      setEssaysCount(essayRes.count ?? 0);
      setChatsCount(chatRes.count ?? 0);

      // Leaderboard
      setLeaderboard((lbRes.data as LeaderRow[]) || []);

      // Build 7-day XP series
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

  /* ------------------------------------------------
     UI
  -------------------------------------------------*/
  return (
    <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 text-neutral-900 dark:text-neutral-100">
      <BackgroundOrnaments />

      {/* Header */}
      <motion.div
        variants={pageVariants}
        initial="initial"
        animate="animate"
        className="relative z-10 mb-6 flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile?.username ? `Welcome back, ${profile.username}` : 'Welcome back'}
          </h1>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Keep the streak alive. Calm monochrome mode.
          </p>
        </div>
        {!isPro && (
          <Link to="/upgrade" className="group">
            <Button variant="secondary" className="gap-2">
              <Crown className="h-4 w-4" /> Upgrade
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        )}
      </motion.div>

      {/* Grid */}
      <motion.div
        variants={gridVariants}
        initial="initial"
        animate="animate"
        className="relative z-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
      >
        {/* Card 1: XP & Level */}
        <motion.div variants={cardVariants} className={hoverLift}>
          <Card className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Zap className="h-4 w-4" /> XP</CardTitle>
              <BadgeUI variant="secondary">{xpTotal} total</BadgeUI>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
                    Level {xpProgress.level} • {xpProgress.progress} / {xpProgress.total}
                  </div>
                  <ProgressBar value={xpProgress.progress} max={xpProgress.total} />
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.15 }}
                    className="mt-3 text-xs text-neutral-500 dark:text-neutral-400"
                  >
                    Today: <span className="tabular-nums">+{todayXP}</span> • Week: <span className="tabular-nums">+{weekXP}</span>
                  </motion.div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Card 2: Activity Summary */}
        <motion.div variants={cardVariants} className={hoverLift}>
          <Card className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><LineChartIcon className="h-4 w-4" /> Today</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-16 w-full" />
              ) : (
                <div className="grid grid-cols-3 gap-2 text-sm">
                  {[
                    { label: 'Chats', value: chatsCount },
                    { label: 'Essays', value: essaysCount },
                    { label: 'Cards', value: flashcardsCount },
                  ].map((item) => (
                    <motion.div
                      key={item.label}
                      whileHover={{ scale: 1.02 }}
                      className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 text-center"
                    >
                      <div className="text-xs text-neutral-500 dark:text-neutral-400">{item.label}</div>
                      <div className="text-lg font-semibold tabular-nums">{item.value}</div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Card 3: 7-day XP Area Chart */}
        <motion.div variants={cardVariants} className={`md:col-span-2 lg:col-span-2 ${hoverLift}`}>
          <Card className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><LineChartIcon className="h-4 w-4" /> 7-Day Progress</CardTitle>
            </CardHeader>
            <CardContent className="h-48">
              {loading ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key="xp-area"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.35 }}
                    className="h-full w-full"
                  >
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={weekSeries} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                        <defs>
                          <linearGradient id="xpFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#737373" stopOpacity={0.35} />
                            <stop offset="95%" stopColor="#737373" stopOpacity={0.06} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="#A3A3A3" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#A3A3A3" fontSize={12} tickLine={false} axisLine={false} width={32} />
                        <Tooltip
                          contentStyle={{ background: '#111', border: '1px solid #333', borderRadius: 8, color: '#eee' }}
                          labelFormatter={(d) => `Day ${d}`}
                          formatter={(v: any) => [v, 'XP']}
                        />
                        <Area type="monotone" dataKey="xp" stroke="#525252" strokeWidth={2} fill="url(#xpFill)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </motion.div>
                </AnimatePresence>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Card 4: Daily Leaderboard */}
        <motion.div variants={cardVariants} className={`lg:col-span-2 ${hoverLift}`}>
          <Card className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
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
                        <div
                          className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                            i < 3
                              ? 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900'
                              : 'bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-200'
                          }`}
                        >
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
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Card 5: Quick Actions */}
        <motion.div variants={cardVariants} className={hoverLift}>
          <Card className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <CardHeader>
              <CardTitle>Quick actions</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-2">
              <Link to="/flashcards">
                <Button size="sm" variant="secondary" className="gap-2">
                  <BookOpen className="h-4 w-4" /> Flashcards
                </Button>
              </Link>
              <Link to="/essays">
                <Button size="sm" variant="secondary" className="gap-2">
                  <PenTool className="h-4 w-4" /> Essays
                </Button>
              </Link>
              <Link to="/chat">
                <Button size="sm" variant="secondary" className="gap-2">
                  <MessageCircle className="h-4 w-4" /> Tutor
                </Button>
              </Link>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Subtle footer counts */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.9 }}
        transition={{ delay: 0.2 }}
        className="relative z-10 mt-8 text-xs text-neutral-500 dark:text-neutral-400"
      >
        {flashcardsCount} cards • {essaysCount} essays • {chatsCount} chats logged
      </motion.div>
    </div>
  );
}

export { Dashboard };
