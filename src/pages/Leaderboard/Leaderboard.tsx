// src/pages/Leaderboard/Leaderboard.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Medal, Award, Crown, Filter, Search, ChevronLeft, ChevronRight,
  Sparkles, Star, BadgeCheck, Activity, Calendar, X, LocateFixed
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { Avatar, AvatarImage, AvatarFallback } from '../../components/ui/avatar';
import { Card, CardContent } from '../../components/ui/Card';
import toast from 'react-hot-toast';

// -----------------------------
// Types
// -----------------------------
interface LeaderboardUser {
  id: string;
  username: string | null;
  xp: number; // computed “real” XP
  profile_picture: string | null;
  tier: string | null;
  bio?: string | null;
}

interface Badge {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
}

interface RecentXpItem {
  user_id: string;
  amount: number;
}

// -----------------------------
// Constants & helpers
// -----------------------------
const TIER_FILTERS = [
  { value: 'all', label: 'All Tiers' },
  { value: 'gold', label: 'Gold' },
  { value: 'silver', label: 'Silver' },
  { value: 'bronze', label: 'Bronze' },
];

const SORTS = [
  { value: 'xp_desc', label: 'XP (High → Low)' },
  { value: 'xp_asc', label: 'XP (Low → High)' },
  { value: 'name_asc', label: 'Name (A → Z)' },
  { value: 'name_desc', label: 'Name (Z → A)' },
];

function getTierColor(tier: string | null | undefined) {
  switch ((tier || '').toLowerCase()) {
    case 'gold':
      return 'from-yellow-400 to-yellow-600';
    case 'silver':
      return 'from-gray-300 to-gray-500';
    case 'bronze':
      return 'from-amber-600 to-amber-800';
    default:
      return 'from-gray-400 to-gray-600';
  }
}

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown className="w-6 h-6 text-yellow-500" />;
    case 2:
      return <Medal className="w-6 h-6 text-gray-400" />;
    case 3:
      return <Award className="w-6 h-6 text-amber-600" />;
    default:
      return <Trophy className="w-5 h-5 text-gray-400" />;
  }
}

function getRankEmoji(rank: number) {
  switch (rank) {
    case 1:
      return '🥇';
    case 2:
      return '🥈';
    case 3:
      return '🥉';
    default:
      return `#${rank}`;
  }
}

function formatNumber(n: number) {
  return new Intl.NumberFormat().format(n);
}

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), delay);
  };
}

// Level math (simple curve)
function xpToLevel(xp: number) {
  // Level 1 at 0 XP; growing requirement
  // next level cost = 100 + level*50
  let level = 1;
  let remaining = xp;
  let cost = 100;

  while (remaining >= cost && level < 99) {
    remaining -= cost;
    level++;
    cost = 100 + level * 50;
  }

  const nextLevelCost = cost;
  const progress = Math.max(0, Math.min(1, remaining / nextLevelCost));
  return { level, progress, nextLevelCost };
}

// -----------------------------
// Main component
// -----------------------------
const Leaderboard: React.FC = () => {
  const { user, profile } = useAuthStore();

  // Data
  const [allUsers, setAllUsers] = useState<LeaderboardUser[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(() => localStorage.getItem('lb:filter') || 'all');
  const [sort, setSort] = useState<string>(() => localStorage.getItem('lb:sort') || 'xp_desc');
  const [q, setQ] = useState<string>(() => localStorage.getItem('lb:q') || '');

  // Pagination
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // Profile drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerUser, setDrawerUser] = useState<LeaderboardUser | null>(null);
  const [drawerBadges, setDrawerBadges] = useState<Badge[]>([]);
  const [drawerRecent, setDrawerRecent] = useState<RecentXpItem[]>([]);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // -----------------------------
  // Load leaderboards
  // -----------------------------
  useEffect(() => {
    loadLeaderboard();
    // Realtime subscriptions
    const profilesChan = supabase
      .channel('lb:profiles')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        loadLeaderboard({ silent: true });
      })
      .subscribe();

    const xpChan = supabase
      .channel('lb:xp_events')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'xp_events' }, () => {
        loadLeaderboard({ silent: true });
      })
      .subscribe();

    return () => {
      profilesChan.unsubscribe();
      xpChan.unsubscribe();
      supabase.removeChannel(profilesChan);
      supabase.removeChannel(xpChan);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLeaderboard = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);

      // 1) Pull profiles
      const { data: profilesRows, error: pErr } = await supabase
        .from('profiles')
        .select('id, username, xp, profile_picture, tier, bio');

      if (pErr) throw pErr;

      // 2) Try aggregating real XP from xp_events (user_id, amount)
      const xpMap = new Map<string, number>();

      // Probe xp_events existence/permission without information_schema
      let xpEventsExists = false;
      try {
        const { error: probeErr } = await supabase
          .from('xp_events')
          .select('user_id')
          .limit(1);
        xpEventsExists = !probeErr;
      } catch {
        xpEventsExists = false;
      }

      if (xpEventsExists) {
        const { data: xpRows, error: xErr } = await supabase
          .from('xp_events')
          .select('user_id, amount');

        if (!xErr && xpRows) {
          for (const row of xpRows as Array<{ user_id: string; amount: number }>) {
            xpMap.set(row.user_id, (xpMap.get(row.user_id) ?? 0) + (Number(row.amount) || 0));
          }
        }
      }

      // 3) Combine → compute xp
      const combined: LeaderboardUser[] = (profilesRows || []).map((p) => ({
        id: p.id,
        username: p.username ?? null,
        profile_picture: p.profile_picture ?? null,
        tier: p.tier ?? null,
        bio: p.bio ?? null,
        xp: xpMap.has(p.id) ? xpMap.get(p.id)! : (p.xp ?? 0),
      }));

      // 4) Sort default by xp desc
      const sorted = sortUsers(combined, 'xp_desc');
      setAllUsers(sorted);

      // 5) Current user rank
      if (user) {
        const idx = sorted.findIndex((u) => u.id === user.id);
        setCurrentUserRank(idx !== -1 ? idx + 1 : null);
      } else {
        setCurrentUserRank(null);
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      toast.error('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  // -----------------------------
  // Filters / search / sort / pagination
  // -----------------------------
  const applyFilters = (list: LeaderboardUser[]) => {
    let arr = [...list];

    // filter tier
    if (filter !== 'all') {
      arr = arr.filter((u) => (u.tier || '').toLowerCase() === filter);
    }

    // search
    const term = q.trim().toLowerCase();
    if (term) {
      arr = arr.filter((u) => (u.username || '').toLowerCase().includes(term));
    }

    // sort
    arr = sortUsers(arr, sort);

    return arr;
  };

  const sortUsers = (list: LeaderboardUser[], mode: string) => {
    const arr = [...list];
    switch (mode) {
      case 'xp_asc':
        arr.sort((a, b) => a.xp - b.xp);
        break;
      case 'name_asc':
        arr.sort((a, b) => (a.username || '').localeCompare(b.username || ''));
        break;
      case 'name_desc':
        arr.sort((a, b) => (b.username || '').localeCompare(a.username || ''));
        break;
      case 'xp_desc':
      default:
        arr.sort((a, b) => b.xp - a.xp);
    }
    return arr;
  };

  const debouncedSetQ = useMemo(() => debounce((val: string) => {
    setQ(val);
    localStorage.setItem('lb:q', val);
  }, 250), []);

  const filtered = useMemo(() => applyFilters(allUsers), [allUsers, filter, sort, q]);


  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    // Reset page on filter/sort/search change
    setPage(1);
  }, [filter, sort, q]);

  // Persist filter/sort when changed
  useEffect(() => { localStorage.setItem('lb:filter', filter); }, [filter]);
  useEffect(() => { localStorage.setItem('lb:sort', sort); }, [sort]);

  // -----------------------------
  // Drawer: load profile details
  // -----------------------------
  const openDrawer = async (u: LeaderboardUser) => {
    setDrawerOpen(true);
    setDrawerUser(u);
    setDrawerLoading(true);
    setDrawerBadges([]);
    setDrawerRecent([]);

    try {
      // Fetch badges (optional table)
      let badgesExists = false;
      try {
        const { error } = await supabase.from('badges').select('id').limit(1);
        badgesExists = !error;
      } catch { badgesExists = false; }

      if (badgesExists) {
        const { data: badges } = await supabase
          .from('badges')
          .select('id, name, icon, color')
          .eq('user_id', u.id)
          .limit(12);
        if (badges) setDrawerBadges(badges as Badge[]);
      }

      // Recent XP (last 7 events)
      let xpEventsExists = false;
      try {
        const { error } = await supabase.from('xp_events').select('user_id').limit(1);
        xpEventsExists = !error;
      } catch { xpEventsExists = false; }

      if (xpEventsExists) {
        const { data: recent } = await supabase
          .from('xp_events')
          .select('user_id, amount, created_at')
          .eq('user_id', u.id)
          .order('created_at', { ascending: false })
          .limit(7);
        if (recent) setDrawerRecent(recent as any as RecentXpItem[]);
      }
    } catch {
      // non-fatal
    } finally {
      setDrawerLoading(false);
    }
  };

  const jumpToMe = () => {
    if (!currentUserRank) return;
    const myPage = Math.ceil(currentUserRank / PAGE_SIZE);
    setPage(myPage);
  };

  // -----------------------------
  // Render
  // -----------------------------
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
        </div>
      </div>
    );
  }

  const podium = filtered.slice(0, 3);
  const maxXP = Math.max(...(pageData.length ? pageData : filtered).map(u => u.xp), 1);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {/* Header & Controls */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center">
            <Trophy className="w-8 h-8 mr-3 text-purple-600" />
            Leaderboard
          </h1>
          <p className="text-gray-600">See how you rank against other IB students</p>
          {currentUserRank && (
            <div className="mt-2 inline-flex items-center gap-2 text-sm text-purple-700 bg-purple-50 px-3 py-1 rounded-full">
              <BadgeCheck className="w-4 h-4" />
              Your global rank: <strong>#{currentUserRank}</strong>
              <button
                onClick={jumpToMe}
                className="ml-2 inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border hover:bg-gray-50"
                title="Jump to my position"
              >
                <LocateFixed className="w-3 h-3" /> Jump to me
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="pl-9 pr-3 py-2 border rounded-md text-sm"
              placeholder="Search by username…"
              defaultValue={q}
              onChange={(e) => debouncedSetQ(e.target.value)}
            />
          </div>

          {/* Tier Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-500" />
            <select
              className="border px-2 py-2 rounded text-sm"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              {TIER_FILTERS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Sort */}
          <select
            className="border px-2 py-2 rounded text-sm"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            {SORTS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Podium */}
      {podium.length >= 3 && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <div className="flex justify-center items-end gap-4">
            {/* 2nd */}
            <PodiumSlot
              rank={2}
              user={podium[1]}
              height="h-36"
              ringClass="ring-gray-300"
              bgClass="from-gray-300 to-gray-100"
            />
            {/* 1st */}
            <PodiumSlot
              rank={1}
              user={podium[0]}
              height="h-44"
              ringClass="ring-yellow-400"
              bgClass="from-yellow-400 to-yellow-200"
            />
            {/* 3rd */}
            <PodiumSlot
              rank={3}
              user={podium[2]}
              height="h-32"
              ringClass="ring-amber-500"
              bgClass="from-amber-600 to-amber-400"
              textOnDark
            />
          </div>
        </motion.div>
      )}

      {/* Leaderboard list */}
      <div className="space-y-4">
        {pageData.map((u, idx) => {
          const rank = (page - 1) * PAGE_SIZE + idx + 1;
          const isCurrentUser = profile?.id === u.id;
          const progress = Math.max(2, Math.min(100, (u.xp / maxXP) * 100));
          const { level, progress: lvlProgress, nextLevelCost } = xpToLevel(u.xp);

          return (
            <motion.div
              key={u.id}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.025 }}
            >
              <Card className={`transition-all hover:shadow-md ${isCurrentUser ? 'ring-2 ring-purple-500 bg-purple-50' : ''}`}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-4">
                    {/* Rank */}
                    <div className="flex items-center justify-center w-12 h-12 rounded-full bg-gray-100">
                      <span className="text-lg font-bold text-gray-700">{getRankEmoji(rank)}</span>
                    </div>

                    {/* Avatar */}
                    <Avatar className="w-12 h-12">
                      <AvatarImage src={u.profile_picture || ''} />
                      <AvatarFallback className={`bg-gradient-to-r ${getTierColor(u.tier)} text-white`}>
                        {(u.username || '?')[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-gray-900 truncate max-w-[200px] sm:max-w-[320px]">
                          {u.username || 'Unnamed'}
                          {isCurrentUser && (
                            <span className="ml-2 text-sm text-purple-600 font-medium">(You)</span>
                          )}
                        </h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded-full bg-gradient-to-r ${getTierColor(u.tier)} text-white`}>
                          {u.tier || 'Unranked'}
                        </span>
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Level {level}
                        </span>
                      </div>

                      {/* XP Progress vs max on page */}
                      <div className="mt-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-gray-600">{formatNumber(u.xp)} XP</span>
                          <span className="text-xs text-gray-500">{progress.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ duration: 0.6 }}
                            className="bg-gradient-to-r from-purple-500 to-blue-500 h-2 rounded-full"
                          />
                        </div>
                      </div>

                      {/* Level progress */}
                      <div className="mt-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs text-gray-600">Next level: {formatNumber(nextLevelCost)} XP</span>
                          <span className="text-xs text-gray-500">{(lvlProgress * 100).toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(2, lvlProgress * 100)}%` }}
                            transition={{ duration: 0.6 }}
                            className="bg-gradient-to-r from-emerald-500 to-teal-500 h-1.5 rounded-full"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openDrawer(u)}
                        className="inline-flex items-center gap-1 px-3 py-2 text-sm rounded-md border hover:bg-gray-50"
                      >
                        <Sparkles className="w-4 h-4" />
                        View Profile
                      </button>
                      <div className="text-right">{getRankIcon(rank)}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          );
        })}
      </div>

      {/* Pagination */}
      {pageCount > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 px-3 py-2 border rounded-md disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" /> Prev
          </button>
          <div className="text-sm text-gray-700">
            Page <strong>{page}</strong> of <strong>{pageCount}</strong>
          </div>
          <button
            disabled={page === pageCount}
            onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
            className="inline-flex items-center gap-1 px-3 py-2 border rounded-md disabled:opacity-50"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Trophy className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No rankings yet</h3>
          <p className="text-gray-600">Start earning XP to appear on the board!</p>
        </div>
      )}

      {/* Profile Drawer */}
      <AnimatePresence>
        {drawerOpen && drawerUser && (
          <motion.div
            className="fixed inset-0 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={() => setDrawerOpen(false)} />

            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', stiffness: 280, damping: 30 }}
              className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl p-5 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Avatar className="w-12 h-12">
                    <AvatarImage src={drawerUser.profile_picture || ''} />
                    <AvatarFallback className={`bg-gradient-to-r ${getTierColor(drawerUser.tier)} text-white`}>
                      {(drawerUser.username || '?')[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-lg">{drawerUser.username || 'Unnamed'}</h3>
                      <span className={`px-2 py-0.5 text-xs rounded-full bg-gradient-to-r ${getTierColor(drawerUser.tier)} text-white`}>
                        {drawerUser.tier || 'Unranked'}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">{formatNumber(drawerUser.xp)} XP</div>
                  </div>
                </div>
                <button
                  className="p-2 rounded-md hover:bg-gray-100"
                  onClick={() => setDrawerOpen(false)}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Bio */}
              {drawerUser.bio && (
                <div className="mb-4 p-3 rounded-lg bg-gray-50 border text-sm text-gray-700">
                  {drawerUser.bio}
                </div>
              )}

              {/* Badges */}
              {drawerBadges.length > 0 && (
                <section className="mb-5">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Star className="w-4 h-4 text-yellow-500" />
                    Badges
                  </h4>
                  <div className="grid grid-cols-3 gap-2">
                    {drawerBadges.map((b) => (
                      <div
                        key={b.id}
                        className="p-3 rounded-lg border bg-white flex flex-col items-center justify-center text-center"
                        title={b.name}
                      >
                        <div className="w-8 h-8 rounded-full flex items-center justify-center bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white mb-1">
                          {b.icon ? <img src={b.icon} alt="" className="w-5 h-5" /> : <Star className="w-5 h-5" />}
                        </div>
                        <div className="text-xs text-gray-700 line-clamp-2">{b.name}</div>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Recent activity */}
              {(drawerRecent.length > 0 || drawerLoading) && (
                <section className="mb-5">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600" />
                    Recent XP Events
                  </h4>
                  <div className="space-y-2">
                    {drawerLoading && (
                      <div className="text-sm text-gray-500">Loading recent activity…</div>
                    )}
                    {!drawerLoading &&
                      drawerRecent.map((r, i) => (
                        <div key={i} className="p-2 rounded-md border bg-white flex items-center justify-between">
                          <span className="text-sm text-gray-700">Event</span>
                          <span className="text-sm font-medium text-gray-900">+{r.amount} XP</span>
                        </div>
                      ))}
                  </div>
                </section>
              )}

              {/* Placeholder actions */}
              <section className="mt-6">
                <div className="grid grid-cols-2 gap-2">
                  <button className="px-3 py-2 rounded-md border hover:bg-gray-50 text-sm inline-flex items-center justify-center gap-2">
                    <Calendar className="w-4 h-4" />
                    Challenge
                  </button>
                  <button className="px-3 py-2 rounded-md border hover:bg-gray-50 text-sm inline-flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Add Friend
                  </button>
                </div>
              </section>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// -----------------------------
// Podium Slot subcomponent
// -----------------------------
function PodiumSlot({
  rank,
  user,
  height,
  ringClass,
  bgClass,
  textOnDark = false,
}: {
  rank: number;
  user: LeaderboardUser;
  height: string;
  ringClass: string;
  bgClass: string;
  textOnDark?: boolean;
}) {
  const nameClass = textOnDark ? 'text-white' : 'text-gray-900';
  const xpClass = textOnDark ? 'text-amber-100' : 'text-gray-700';

  return (
    <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
      <div className={`bg-gradient-to-t ${bgClass} rounded-t-lg p-6 ${height} flex flex-col justify-end`}>
        <Avatar className={`mx-auto mb-2 ${rank === 1 ? 'w-20 h-20' : rank === 2 ? 'w-16 h-16' : 'w-14 h-14'} ring-4 ${ringClass}`}>
          <AvatarImage src={user?.profile_picture || ''} />
          <AvatarFallback className={`bg-gradient-to-r ${getTierColor(user?.tier)} text-white`}>
            {(user?.username || '?')[0]?.toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <h3 className={`font-semibold ${rank === 1 ? 'text-lg' : 'text-base'} ${nameClass}`}>{user?.username || 'Unnamed'}</h3>
        <p className={`text-sm ${xpClass}`}>{formatNumber(user?.xp || 0)} XP</p>
      </div>
      <div className={`py-2 rounded-b-lg font-bold ${textOnDark ? 'bg-amber-600 text-amber-100' : 'bg-gray-300 text-gray-800'}`}>
        {rank === 1 ? '🥇 1st' : rank === 2 ? '🥈 2nd' : '🥉 3rd'}
      </div>
    </motion.div>
  );
}

export default Leaderboard;
