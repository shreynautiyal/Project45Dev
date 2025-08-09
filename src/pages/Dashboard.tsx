// src/pages/Dashboard.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen, MessageCircle, PenTool, Trophy, Target, TrendingUp, Zap, ArrowRight,
  Star, Lock, Award, Play, CheckCircle2, Flame, ListChecks, Brain, Sparkles, RefreshCw, AlertTriangle, Crown
} from 'lucide-react';
// import { motion } from 'framer-motion'; // unused right now

import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/ProgressBar';
import { Badge as BadgeUI } from '../components/ui/Badge';
import { getXPProgress } from '../lib/utils';
// import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';

import type { Profile, Badge as BadgeType, UserBadge } from '../lib/supabase';

/* ------------------------------------------------
   Time helpers (pure)
-------------------------------------------------*/
const startOfTodayISO = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
};
const daysAgoISO = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};
const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

/* ------------------------------------------------
   Lightweight skeletons / utilities
-------------------------------------------------*/
function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-100 dark:bg-neutral-800 ${className}`} />;
}
const srOnly = 'sr-only';

/* ------------------------------------------------
   Types
-------------------------------------------------*/
type ActivityRow = { description: string; source: string; amount: number; created_at: string };

type WeeklySnapshot = {
  reviews: number;
  words: number;
  chats: number;
  xp: number;
  loading: boolean;
};

type TodaySnapshot = {
  chat: number;
  reviews: number;
  words: number;
  loading: boolean;
};

type SectionError = {
  message: string;
  retry?: () => void;
} | null;

/* ------------------------------------------------
   Component
-------------------------------------------------*/
export default function Dashboard() {
  const { profile } = useAuthStore() as { profile: Profile | null };

  // Treat any of these as "Pro"
  const isPro = useMemo(
    () => Boolean((profile as any)?.is_pro ?? ((profile as any)?.plan === 'pro')),
    [profile]
  );

  const sinceToday = useMemo(() => startOfTodayISO(), []);
  const since7 = useMemo(() => daysAgoISO(7), []);

  const [loadingOverview, setLoadingOverview] = useState(true);
  const [overviewError, setOverviewError] = useState<SectionError>(null);
  const [stats, setStats] = useState({
    flashcardCount: 0,
    essayCount: 0,
    chatMessages: 0,
    testResults: 0,
    recentActivity: [] as ActivityRow[],
  });

  const [actualXp, setActualXp] = useState<number>(profile?.xp || 0);
  const [xpPoliteMsg, setXpPoliteMsg] = useState<string>(''); // aria-live

  const [today, setToday] = useState<TodaySnapshot>({ chat: 0, reviews: 0, words: 0, loading: true });
  const [todayError, setTodayError] = useState<SectionError>(null);

  const [weekly, setWeekly] = useState<WeeklySnapshot>({ reviews: 0, words: 0, chats: 0, xp: 0, loading: true });
  const [weeklyError, setWeeklyError] = useState<SectionError>(null);

  const [userBadges, setUserBadges] = useState<UserBadge[]>([]);
  const [allBadges, setAllBadges] = useState<BadgeType[]>([]);
  const [badgesError, setBadgesError] = useState<SectionError>(null);

  const [questsOpen, setQuestsOpen] = useState(false);
  const [claimed, setClaimed] = useState<Record<string, boolean>>({});
  const [claimBusy, setClaimBusy] = useState<Record<string, boolean>>({});

  const countWords = useCallback((texts: string[] = []) => {
    let sum = 0;
    for (const t of texts) {
      if (!t) continue;
      sum += t.trim().split(/\s+/).length;
    }
    return sum;
  }, []);

  /* ------------------------------------------------
     Data loaders (batched, with error isolation)
  -------------------------------------------------*/
  const loadOverview = useCallback(async (userId: string) => {
    setOverviewError(null);
    setLoadingOverview(true);
    try {
      const [flashcards, essays, messages, tests, xpRows] = await Promise.all([
        supabase.from('flashcards').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('essays').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('chat_messages').select('*', { count: 'exact', head: true }).eq('user_id', userId).eq('role', 'user'),
        supabase.from('test_results').select('*', { count: 'exact', head: true }).eq('user_id', userId),
        supabase.from('xp_events')
          .select('amount, description, source, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
      ]);

      const recent = (xpRows.data ?? []) as ActivityRow[];
      const totalXp = recent.reduce((sum, r) => sum + (r.amount ?? 0), 0);

      setStats({
        flashcardCount: flashcards.count ?? 0,
        essayCount: essays.count ?? 0,
        chatMessages: messages.count ?? 0,
        testResults: tests.count ?? 0,
        recentActivity: recent.slice(0, 50),
      });
      setActualXp(totalXp);
      setXpPoliteMsg(`XP updated. You now have ${totalXp} total XP.`);
    } catch (e: any) {
      setOverviewError({ message: e?.message ?? 'Failed to load overview.' });
    } finally {
      setLoadingOverview(false);
    }
  }, []);

  const loadToday = useCallback(async (userId: string) => {
    setTodayError(null);
    setToday((t) => ({ ...t, loading: true }));
    try {
      const [chat, essays, reviews] = await Promise.all([
        supabase.from('chat_messages').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('role', 'user').gte('created_at', sinceToday),
        supabase.from('essays').select('content').eq('user_id', userId).gte('created_at', sinceToday),
        supabase.from('test_results').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).gte('created_at', sinceToday),
      ]);

      const words = countWords((essays.data as any[] | null)?.map(e => e.content) ?? []);
      setToday({ chat: chat.count ?? 0, reviews: reviews.count ?? 0, words, loading: false });
    } catch (e: any) {
      setTodayError({ message: e?.message ?? 'Failed to load today metrics.' });
      setToday((t) => ({ ...t, loading: false }));
    }
  }, [countWords, sinceToday]);

  const loadWeekly = useCallback(async (userId: string) => {
    setWeeklyError(null);
    setWeekly((w) => ({ ...w, loading: true }));
    try {
      const [chat, essays, reviews, xp] = await Promise.all([
        supabase.from('chat_messages').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).eq('role', 'user').gte('created_at', since7),
        supabase.from('essays').select('content').eq('user_id', userId).gte('created_at', since7),
        supabase.from('test_results').select('id', { count: 'exact', head: true })
          .eq('user_id', userId).gte('created_at', since7),
        supabase.from('xp_events').select('amount').eq('user_id', userId).gte('created_at', since7),
      ]);

      const words = countWords((essays.data as any[] | null)?.map(e => e.content) ?? []);
      const xpSum = (xp.data ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

      setWeekly({ chats: chat.count ?? 0, words, reviews: reviews.count ?? 0, xp: xpSum, loading: false });
    } catch (e: any) {
      setWeeklyError({ message: e?.message ?? 'Failed to load weekly snapshot.' });
      setWeekly((w) => ({ ...w, loading: false }));
    }
  }, [countWords, since7]);

  const loadBadges = useCallback(async (userId: string) => {
    setBadgesError(null);
    try {
      const [{ data: all }, { data: unlocked }] = await Promise.all([
        supabase.from('badges').select('*'),
        supabase.from('user_badges').select('*, badge:badge_id(*)').eq('user_id', userId),
      ]);
      setAllBadges((all ?? []) as BadgeType[]);
      setUserBadges((unlocked ?? []) as UserBadge[]);
    } catch (e: any) {
      setBadgesError({ message: e?.message ?? 'Failed to load badges.' });
    }
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    const uid = profile.id;
    void loadOverview(uid);
    void loadToday(uid);
    void loadWeekly(uid);
    void loadBadges(uid);
  }, [profile?.id, loadOverview, loadToday, loadWeekly, loadBadges]);

  /* ------------------------------------------------
     Derived / memoized bits
  -------------------------------------------------*/
  const xpProgress = useMemo(() => getXPProgress(actualXp), [actualXp]);
  // xpProgress shape: { level, progress, total, percentage }

  const unlockedBadgeIds = useMemo(
    () => userBadges.map((ub) => ub.badge_id),
    [userBadges]
  );

  const quests = useMemo(() => ([
    { code: 'reviews20', title: 'Do 20 Reviews', icon: Target, target: 20, progress: today.reviews, href: '/flashcards', rewardXp: 25, helper: 'Finish 20 spaced reviews.' },
    { code: 'chat8',     title: '8 Tutor Messages', icon: MessageCircle, target: 8,  progress: today.chat,    href: '/chat',       rewardXp: 20, helper: 'Ask your tutor focused questions.' },
    { code: 'words150',  title: 'Write 150 Words',  icon: PenTool,       target: 150,progress: today.words,   href: '/essays',     rewardXp: 30, helper: 'Draft an essay or structured notes.' },
  ]), [today.reviews, today.chat, today.words]);

  const questsRemaining = useMemo(
    () => quests.filter(q => (claimed[q.code] ? q.target : q.progress) < q.target).length,
    [quests, claimed]
  );

  const nextAction = useMemo(() => {
    if (today.reviews < 20) return { label: 'Start Reviews', href: '/flashcards', icon: Play };
    if (today.words < 150) return { label: 'Write 150 Words', href: '/essays', icon: PenTool };
    return { label: 'Ask the Tutor', href: '/chat', icon: MessageCircle };
  }, [today.reviews, today.words]);
  const NextIcon = nextAction.icon;

  const weeklySeries = useMemo(() => {
    const toSeries = (total: number) => {
      const base = Math.max(0, total);
      const step = base / 6;
      return [0, step * 1, step * 2, step * 2.8, step * 3.6, step * 4.6, base];
    };
    return {
      reviews: toSeries(weekly.reviews),
      words: toSeries(weekly.words),
      chats: toSeries(weekly.chats),
      xp: toSeries(weekly.xp),
    };
  }, [weekly.reviews, weekly.words, weekly.chats, weekly.xp]);

  const groupedActivity = useMemo(() => groupActivityByDay(stats.recentActivity), [stats.recentActivity]);

  /* ------------------------------------------------
     Optimistic Quest Claim
  -------------------------------------------------*/
  const claimQuest = useCallback(async (q: typeof quests[number]) => {
    if (!profile) return;
    if (claimed[q.code] || q.progress < q.target) return;

    setClaimBusy(b => ({ ...b, [q.code]: true }));
    setClaimed(prev => ({ ...prev, [q.code]: true }));
    setActualXp(x => {
      const nx = x + q.rewardXp;
      setXpPoliteMsg(`Quest claimed. +${q.rewardXp} XP from “${q.title}”.`);
      return nx;
    });

    try {
      const { error } = await supabase.from('xp_events').insert({
        user_id: profile.id,
        amount: q.rewardXp,
        description: `Daily Quest: ${q.title}`,
        source: 'quest',
        created_at: new Date().toISOString(),
      });

      if (error) throw error;
    } catch (e: any) {
      setClaimed(prev => {
        const clone = { ...prev };
        delete clone[q.code];
        return clone;
      });
      setActualXp(x => x - q.rewardXp);
      setXpPoliteMsg('Sorry — claiming that quest failed. Try again.');
    } finally {
      setClaimBusy(b => ({ ...b, [q.code]: false }));
    }
  }, [claimed, profile]);

  /* ------------------------------------------------
     Render helpers
  -------------------------------------------------*/
  function compactNumber(n: number) {
    try {
      return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
    } catch {
      return String(n);
    }
  }

  function pct(n: number, d: number) {
    if (!d) return 0;
    return Math.min(100, Math.round((n / d) * 100));
  }

  function groupActivityByDay(rows: ActivityRow[]) {
    const map = new Map<string, ActivityRow[]>();
    for (const r of rows) {
      const d = new Date(r.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, items]) => ({ date, items }));
  }

  /* ------------------------------------------------
     UI
  -------------------------------------------------*/
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      {/* SR live region for XP updates */}
      <p aria-live="polite" className={srOnly}>{xpPoliteMsg}</p>

      {/* Header / greeting */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {profile?.username ? `Welcome back, ${profile.username}` : 'Welcome back'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Keep the streak alive. Small, consistent wins stack fast.
          </p>
        </div>

        {/* Pro CTA */}
        {!isPro && (
          <Link to="/upgrade" className="group">
            <Button variant="primary" className="gap-2">
              <Crown className="h-4 w-4" />
              Upgrade to Pro
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
          </Link>
        )}
      </div>

      {/* Top summary: XP + quick actions */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" /> XP
            </CardTitle>
            <BadgeUI variant="info">{compactNumber(actualXp)} total</BadgeUI>
          </CardHeader>
          <CardContent>
            <div className="mb-2 text-sm text-muted-foreground">
              Level {xpProgress.level} • {xpProgress.progress} / {xpProgress.total} to next
            </div>
            <ProgressBar value={xpProgress.progress} max={xpProgress.total} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Today
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {today.loading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Chats</div>
                  <div className="text-lg font-semibold">{today.chat}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Reviews</div>
                  <div className="text-lg font-semibold">{today.reviews}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Words</div>
                  <div className="text-lg font-semibold">{today.words}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-4 w-4" /> Quick Start
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="text-sm text-muted-foreground">
              Next best step based on your day.
            </div>
            <Link to={nextAction.href}>
              <Button variant="secondary" className="gap-2">
                <NextIcon className="h-4 w-4" />
                {nextAction.label}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Quests */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Target className="h-5 w-5" /> Today’s Quests
          </h2>
          {questsRemaining > 0 ? (
            <BadgeUI variant="default">{questsRemaining} remaining</BadgeUI>
          ) : (
            <BadgeUI variant="success" className="gap-1">
              <CheckCircle2 className="h-4 w-4" /> All done
            </BadgeUI>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {quests.map((q) => {
            const done = q.progress >= q.target;
            const alreadyClaimed = !!claimed[q.code];
            const canClaim = done && !alreadyClaimed && !claimBusy[q.code];

            return (
              <Card key={q.code}>
                <CardHeader className="flex items-start justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <q.icon className="h-4 w-4" /> {q.title}
                  </CardTitle>
                  <BadgeUI variant={done ? 'success' : 'info'}>
                    +{q.rewardXp} XP
                  </BadgeUI>
                </CardHeader>
                <CardContent>
                  <div className="mb-2 text-sm text-muted-foreground">{q.helper}</div>
                  <div className="mb-2 text-xs">
                    {Math.min(q.progress, q.target)} / {q.target}
                  </div>
                  <ProgressBar value={Math.min(q.progress, q.target)} max={q.target} />

                  <div className="mt-3 flex items-center justify-between">
                    <Link to={q.href}>
                      <Button size="sm" variant="secondary" className="gap-2">
                        <ArrowRight className="h-4 w-4" />
                        Go
                      </Button>
                    </Link>

                    <Button
                      size="sm"
                      disabled={!canClaim}
                      onClick={() => claimQuest(q)}
                      className="gap-2"
                    >
                      {claimBusy[q.code] ? (
                        <>
                          <RefreshCw className="h-4 w-4 animate-spin" />
                          Claiming…
                        </>
                      ) : alreadyClaimed ? (
                        <>
                          <CheckCircle2 className="h-4 w-4" />
                          Claimed
                        </>
                      ) : done ? (
                        <>
                          <Star className="h-4 w-4" />
                          Claim
                        </>
                      ) : (
                        <>
                          <Lock className="h-4 w-4" />
                          Locked
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Weekly snapshot */}
      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-4">
        {(['reviews', 'words', 'chats', 'xp'] as const).map((k) => (
          <Card key={k}>
            <CardHeader>
              <CardTitle className="capitalize flex items-center gap-2">
                {k === 'reviews' && <ListChecks className="h-4 w-4" />}
                {k === 'words' && <PenTool className="h-4 w-4" />}
                {k === 'chats' && <MessageCircle className="h-4 w-4" />}
                {k === 'xp' && <Zap className="h-4 w-4" />}
                {k}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {weekly.loading ? (
                <Skeleton className="h-10 w-full" />
              ) : (
                <>
                  <div className="mb-2 text-2xl font-semibold">
                    {compactNumber((weekly as any)[k])}
                  </div>
                  <div className="flex h-12 items-end gap-1">
                    {(weeklySeries as any)[k].map((v: number, i: number) => (
                      <div
                        key={i}
                        className="w-full rounded-sm bg-muted"
                        style={{ height: `${(v === 0 ? 4 : (v / ((weekly as any)[k] || 1)) * 100)}%` }}
                        title={`${Math.round(v)} ${k}`}
                      />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Activity & Badges */}
      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent Activity */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Recent Activity
            </CardTitle>
            <BadgeUI variant="info">
              {stats.recentActivity.length} events
            </BadgeUI>
          </CardHeader>
          <CardContent>
            {loadingOverview ? (
              <Skeleton className="h-24 w-full" />
            ) : overviewError ? (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" />
                {overviewError.message}
              </div>
            ) : stats.recentActivity.length === 0 ? (
              <div className="text-sm text-muted-foreground">No activity yet.</div>
            ) : (
              <ul className="divide-y">
                {stats.recentActivity.slice(0, 10).map((r, i) => (
                  <li key={i} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex min-w-0 items-center gap-2">
                        <Sparkles className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{r.description}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">+{r.amount} XP</span>
                        <span className="text-xs text-muted-foreground">{timeAgo(r.created_at)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Badges */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-4 w-4" /> Badges
            </CardTitle>
            <BadgeUI variant="info">
              {unlockedBadgeIds.length}/{allBadges.length} unlocked
            </BadgeUI>
          </CardHeader>
          <CardContent>
            {badgesError ? (
              <div className="flex items-center gap-2 text-sm text-red-600">
                <AlertTriangle className="h-4 w-4" />
                {badgesError.message}
              </div>
            ) : allBadges.length === 0 ? (
              <div className="text-sm text-muted-foreground">No badges found.</div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {allBadges.map((b) => {
                  const unlocked = unlockedBadgeIds.includes(b.id);
                  return (
                    <div
                      key={b.id}
                      className={`rounded-md border p-3 ${unlocked ? 'opacity-100' : 'opacity-50'}`}
                      title={b.description ?? b.name}
                    >
                      <div className="mb-1 flex items-center gap-2">
                        <Award className="h-4 w-4" />
                        <div className="font-medium">{b.name}</div>
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2">
                        {b.description || '—'}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer links */}
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-muted-foreground">
          {stats.flashcardCount} folders/cards • {stats.essayCount} essays • {stats.chatMessages} tutor msgs • {stats.testResults} tests
        </div>
        <div className="flex items-center gap-2">
          <Link to="/flashcards"><Button size="sm" variant="ghost" className="gap-2"><BookOpen className="h-4 w-4" /> Flashcards</Button></Link>
          <Link to="/essays"><Button size="sm" variant="ghost" className="gap-2"><PenTool className="h-4 w-4" /> Essays</Button></Link>
          <Link to="/chat"><Button size="sm" variant="ghost" className="gap-2"><MessageCircle className="h-4 w-4" /> Tutor</Button></Link>
        </div>
      </div>
    </div>
  );
}
export { Dashboard};