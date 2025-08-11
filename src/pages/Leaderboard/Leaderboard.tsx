// src/pages/Leaderboard/Leaderboard.tsx
// Monochrome Leaderboard: clean, minimal, responsive. Podium + list; search/sort/filter/pagination.
// Live updates via Supabase channels. Optional "Challenge XP" action (creates a row in 'challenges').

import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Trophy, Crown, Filter, Search, ChevronLeft, ChevronRight,
  BadgeCheck, LocateFixed, SortAsc, SortDesc, MoreHorizontal, Target
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuthStore } from "../../store/authStore";

// shadcn/ui
import { Avatar, AvatarImage, AvatarFallback } from "../../components/ui/avatar";
import { Card, CardContent } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Progress } from "../../components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "../../components/ui/tabs";
import { Separator } from "../../components/ui/separator";
import { Skeleton } from "../../components/ui/skeleton";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator
} from "../../components/ui/dropdown-menu";
import toast from "react-hot-toast";

// -----------------------------
// Types
// -----------------------------
interface LeaderboardUser {
  id: string;
  username: string | null;
  xp: number;
  profile_picture: string | null;
  tier: string | null; // Free / Pro / Elite
  bio?: string | null;
}

type SortKey = "xp_desc" | "xp_asc" | "name_asc" | "name_desc";
type ScopeKey = "global" | "friends" | "school";

// -----------------------------
// Helpers
// -----------------------------
function formatNumber(n: number) { return new Intl.NumberFormat().format(n); }

function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let t: any; return (...args: Parameters<T>) => { clearTimeout(t); t = setTimeout(() => fn(...args), delay); };
}

// XP → Level (gentle curve)
function xpToLevel(xp: number) {
  let level = 1; let remaining = Math.max(0, xp); let cost = 100;
  while (remaining >= cost && level < 200) { remaining -= cost; level++; cost = Math.round(100 + level * 60); }
  const nextLevelCost = cost; const progress = Math.max(0, Math.min(1, remaining / nextLevelCost));
  return { level, progress, nextLevelCost };
}

// Monochrome plan styles
function planBadgeClasses(tier?: string | null) {
  const t = (tier || "Free").toLowerCase();
  if (t === "elite") return "bg-black text-white border border-black";
  if (t === "pro") return "bg-neutral-900 text-white border border-neutral-900";
  return "bg-neutral-100 text-neutral-800 border border-neutral-200"; // Free
}

// -----------------------------
// Component
// -----------------------------
const PAGE_SIZE = 10;

const Leaderboard: React.FC = () => {
  const { user, profile } = useAuthStore();

  const [allUsers, setAllUsers] = useState<LeaderboardUser[]>([]);
  const [currentUserRank, setCurrentUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [filter, setFilter] = useState<string>(() => localStorage.getItem("lb:filter") || "all");
  const [sort, setSort] = useState<SortKey>(() => (localStorage.getItem("lb:sort") as SortKey) || "xp_desc");
  const [q, setQ] = useState<string>(() => localStorage.getItem("lb:q") || "");
  const [scope, setScope] = useState<ScopeKey>(() => (localStorage.getItem("lb:scope") as ScopeKey) || "global");
  const [compact, setCompact] = useState<boolean>(() => localStorage.getItem("lb:compact") === "1");
  const [page, setPage] = useState(1);

  const channelsRef = useRef<any[]>([]);

  useEffect(() => {
    loadLeaderboard();
    // realtime updates
    const profilesChan = supabase
      .channel("lb:profiles")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => loadLeaderboard({ silent: true }))
      .subscribe();
    const xpChan = supabase
      .channel("lb:xp_events")
      .on("postgres_changes", { event: "*", schema: "public", table: "xp_events" }, () => loadLeaderboard({ silent: true }))
      .subscribe();
    channelsRef.current = [profilesChan, xpChan];
    return () => {
      for (const ch of channelsRef.current) {
        try { ch?.unsubscribe?.(); } catch {}
        try { supabase.removeChannel(ch); } catch {}
      }
      channelsRef.current = [];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadLeaderboard = async (opts?: { silent?: boolean }) => {
    try {
      if (!opts?.silent) setLoading(true);
      const { data: profilesRows, error: pErr } = await supabase
        .from("profiles")
        .select("id, username, xp, profile_picture, tier, bio");
      if (pErr) throw pErr;

      // Optionally fold xp_events onto profiles.xp to keep compatibility
      const xpMap = new Map<string, number>();
      try {
        const { data: xpRows } = await supabase.from("xp_events").select("user_id, amount");
        (xpRows || []).forEach((r: any) => xpMap.set(r.user_id, (xpMap.get(r.user_id) ?? 0) + (Number(r.amount) || 0)));
      } catch {}

      const combined: LeaderboardUser[] = (profilesRows || []).map((p: any) => ({
        id: p.id,
        username: p.username ?? null,
        profile_picture: p.profile_picture ?? null,
        tier: p.tier ?? "Free",
        bio: p.bio ?? null,
        xp: xpMap.has(p.id) ? xpMap.get(p.id)! : (p.xp ?? 0),
      }));

      const sorted = sortUsers(combined, "xp_desc");
      setAllUsers(sorted);
      if (user) {
        const idx = sorted.findIndex(u => u.id === user.id);
        setCurrentUserRank(idx !== -1 ? idx + 1 : null);
      } else {
        setCurrentUserRank(null);
      }
    } catch (e) {
      console.error(e);
      toast.error("Failed to load leaderboard");
    } finally {
      setLoading(false);
    }
  };

  const sortUsers = (list: LeaderboardUser[], mode: SortKey) => {
    const arr = [...list];
    switch (mode) {
      case "xp_asc": arr.sort((a,b)=>a.xp-b.xp); break;
      case "name_asc": arr.sort((a,b)=>(a.username||"").localeCompare(b.username||"")); break;
      case "name_desc": arr.sort((a,b)=>(b.username||"").localeCompare(a.username||"")); break;
      case "xp_desc": default: arr.sort((a,b)=>b.xp-a.xp);
    }
    return arr;
  };

  const applyFilters = (list: LeaderboardUser[]) => {
    let arr = [...list];
    if (scope === "friends") { /* TODO: add real filter */ }
    if (scope === "school") { /* TODO */ }
    if (filter !== "all") { arr = arr.filter(u => (u.tier||"").toLowerCase() === filter); }
    const term = q.trim().toLowerCase(); if (term) arr = arr.filter(u => (u.username||"").toLowerCase().includes(term));
    arr = sortUsers(arr, sort); return arr;
  };

  const debouncedSetQ = useMemo(() => debounce((val: string) => { setQ(val); localStorage.setItem("lb:q", val); }, 250), []);
  const filtered = useMemo(() => applyFilters(allUsers), [allUsers, filter, sort, q, scope]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageData = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => setPage(1), [filter, sort, q, scope]);
  useEffect(() => { localStorage.setItem("lb:filter", filter); }, [filter]);
  useEffect(() => { localStorage.setItem("lb:sort", sort); }, [sort]);
  useEffect(() => { localStorage.setItem("lb:scope", scope); }, [scope]);
  useEffect(() => { localStorage.setItem("lb:compact", compact ? "1" : "0"); }, [compact]);

  const jumpToMe = () => { if (!currentUserRank) return; setPage(Math.ceil(currentUserRank / PAGE_SIZE)); };

  // Simple Challenge XP: create a 7-day challenge row (if table exists)
  const startChallenge = async (opponentId: string) => {
    if (!user) { toast.error("Please sign in to challenge users"); return; }
    if (user.id === opponentId) { toast("You can’t challenge yourself 🙂"); return; }
    try {
      const now = new Date();
      const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const { error } = await supabase.from("challenges").insert({
        challenger_id: user.id,
        opponent_id: opponentId,
        status: "pending",
        start_at: now.toISOString(),
        end_at: end.toISOString(),
      });
      if (error) throw error;
      toast.success("Challenge sent! (7-day XP race)");
    } catch (e: any) {
      console.error(e);
      toast.error("Couldn’t start challenge (ask admin to add a 'challenges' table).");
    }
  };

  // -----------------------------
  // Loading
  // -----------------------------
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="space-y-6">
          <Skeleton className="h-24 rounded-2xl" />
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="rounded-2xl border border-neutral-200 bg-white">
              <CardContent className="p-5 flex items-center gap-4">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-5 w-1/3" />
                  <Skeleton className="h-2 w-full" />
                  <Skeleton className="h-2 w-2/3" />
                </div>
                <Skeleton className="h-10 w-24 rounded-lg" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Podium (top 3)
  const podium = filtered.slice(0, 3);
  const maxXP = Math.max(...(pageData.length ? pageData : filtered).map(u => u.xp), 1);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-6 rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="px-5 pt-5 mb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-[#000] p-2 text-white shadow-sm">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#000]">Leaderboard</h1>
              <p className="text-sm text-neutral-600">See how you rank across Project 45</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {currentUserRank && (
              <Badge variant="secondary" className="bg-neutral-100 text-neutral-800 border border-neutral-200">
                <BadgeCheck className="w-4 h-4 mr-1" /> Global rank: #{currentUserRank}
                <Button variant="outline" size="sm" className="ml-2" onClick={jumpToMe}>
                  <LocateFixed className="w-3 h-3 mr-1" /> Jump to me
                </Button>
              </Badge>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm"><MoreHorizontal className="w-4 h-4 mr-1"/>View</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Display</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setCompact(false)} className={!compact ? "bg-neutral-100" : ""}>
                  Comfortable
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setCompact(true)} className={compact ? "bg-neutral-100" : ""}>
                  Compact
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => loadLeaderboard()}>
                  Refresh data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <Separator />

        {/* Controls */}
        <div className="px-5 py-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
          <Tabs value={scope} onValueChange={(v: any) => setScope(v)}>
            <TabsList className="bg-neutral-100/70">
              <TabsTrigger value="global">Global</TabsTrigger>
              <TabsTrigger value="friends">Friends</TabsTrigger>
              <TabsTrigger value="school">My School</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex-1" />

          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              className="w-full pl-9 pr-3 py-2 rounded-xl border border-neutral-200 bg-white text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-200"
              placeholder="Search username…"
              defaultValue={q}
              onChange={(e) => debouncedSetQ(e.target.value)}
              aria-label="Search username"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-neutral-600" />
            <div className="flex rounded-xl overflow-hidden border border-neutral-200" role="tablist" aria-label="Tier filter">
              {[{value:"all",label:"All"},{value:"free",label:"Free"},{value:"pro",label:"Pro"},{value:"elite",label:"Elite"}].map(opt => (
                <button key={opt.value} onClick={() => setFilter(opt.value)} className={`px-3 py-2 text-sm transition ${filter===opt.value?"bg-[#000] text-white":"bg-white hover:bg-neutral-50"}`} aria-pressed={filter===opt.value}>{opt.label}</button>
              ))}
            </div>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="whitespace-nowrap">Sort</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Sort by</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {[
                { value: "xp_desc", label: "XP (High → Low)", icon: SortDesc },
                { value: "xp_asc", label: "XP (Low → High)", icon: SortAsc },
                { value: "name_asc", label: "Name (A → Z)", icon: SortAsc },
                { value: "name_desc", label: "Name (Z → A)", icon: SortDesc },
              ].map(opt => (
                <DropdownMenuItem key={opt.value} onClick={() => setSort(opt.value as SortKey)} className={sort===opt.value?"bg-neutral-100":""}>
                  <opt.icon className="w-4 h-4 mr-2" />{opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Podium (monochrome) */}
      {podium.length >= 3 && (
        <div className="mb-8 flex justify-center items-end gap-6">
          {podium.map((u, i) => {
            const rank = i === 0 ? 1 : i === 1 ? 2 : 3; // already sorted by XP desc
            const isFirst = rank === 1;
            const scale = isFirst ? 1.06 : 0.98;
            const y = isFirst ? -12 : -4;
            return (
              <motion.div
                key={u.id}
                className={`relative flex flex-col items-center rounded-2xl px-6 py-5 shadow-sm border ${
                  isFirst ? "bg-[#000] text-white border-[#000]" : "bg-white text-[#000] border-neutral-200"
                }`}
                initial={{ y: 0, scale: 1 }}
                animate={{ y, scale }}
                transition={{ type: "spring", stiffness: 200, damping: 20 }}
              >
                <Avatar className={`w-20 h-20 ring-2 ${isFirst ? "ring-white" : "ring-white"} shadow`}>
                  <AvatarImage src={u.profile_picture || ""} />
                  <AvatarFallback className={`${isFirst ? "bg-neutral-800 text-white" : "bg-neutral-200 text-neutral-800"} font-bold`}>
                    {(u.username||"?")[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className={`mt-3 font-semibold ${isFirst ? "text-white" : "text-[#000]"}`}>{u.username || "Unnamed"}</div>
                <div className={`${isFirst ? "text-neutral-200" : "text-neutral-600"} text-sm`}>{formatNumber(u.xp)} XP</div>
                <Badge className={`${planBadgeClasses(u.tier)} mt-2`}>{(u.tier || "Free")}</Badge>
                <div className={`mt-2 text-sm font-medium ${isFirst ? "text-white" : "text-neutral-700"}`}>
                  {rank===1?"1st":rank===2?"2nd":"3rd"} <Crown className={`inline w-4 h-4 ml-1 ${isFirst ? "text-white" : "text-neutral-800"}`} />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* List */}
      <div className={`space-y-4 ${compact ? "[&_.lb-row]:py-3" : ""}`}>
        {pageData.map((u, idx) => {
          const rank = (page - 1) * PAGE_SIZE + idx + 1;
          const isMe = profile?.id === u.id;
          const bar = Math.max(2, Math.min(100, (u.xp / maxXP) * 100));
          const { level, progress, nextLevelCost } = xpToLevel(u.xp);
          return (
            <motion.div key={u.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }} className="lb-row">
              <Card className={`rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden ${isMe ? "ring-2 ring-neutral-300" : ""}`} aria-label={`${u.username || "User"} — rank ${rank}`}>
                <CardContent className={`p-5 ${compact ? "py-3" : ""}`}>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-neutral-100 border border-neutral-200">
                      <span className="text-lg font-semibold text-neutral-800">{rank===1?"🥇":rank===2?"🥈":rank===3?"🥉":`#${rank}`}</span>
                    </div>

                    <Avatar className="w-12 h-12 ring-2 ring-white shadow-sm">
                      <AvatarImage src={u.profile_picture || ""} />
                      <AvatarFallback className="bg-neutral-200 text-neutral-800">
                        {(u.username || "?")[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-[#000] truncate max-w-[220px] sm:max-w-[360px]">
                          {u.username || 'Unnamed'} {isMe && <span className="ml-2 text-sm text-neutral-600">(You)</span>}
                        </h3>
                        <Badge className={planBadgeClasses(u.tier)}>{u.tier || "Free"}</Badge>
                        <Badge variant="secondary" className="bg-neutral-100 text-neutral-800 border">Level {level}</Badge>
                        <span className="text-xs text-neutral-500">Next: {formatNumber(nextLevelCost)} XP</span>
                      </div>
                      <div className="mt-2">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-sm text-neutral-700">{formatNumber(u.xp)} XP</span>
                          <span className="text-xs text-neutral-500">{bar.toFixed(1)}%</span>
                        </div>
                        <Progress value={bar} className="h-2" />
                      </div>
                      <div className="mt-2 text-xs text-neutral-600">
                        {Math.round(progress * 100)}% to next level • need {formatNumber(nextLevelCost - Math.round(progress * nextLevelCost))} XP
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => startChallenge(u.id)} aria-label="Challenge user">
                        <Target className="w-4 h-4 mr-1" /> Challenge
                      </Button>
                      <div className="text-right">{rank<=3 ? <Crown className="w-6 h-6 text-neutral-800"/> : <Trophy className="w-5 h-5 text-neutral-500"/>}</div>
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
          <Button variant="outline" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="w-4 h-4 mr-1" /> Prev</Button>
          <div className="text-sm text-neutral-800">Page <strong>{page}</strong> of <strong>{pageCount}</strong></div>
          <Button variant="outline" disabled={page === pageCount} onClick={() => setPage((p) => Math.min(pageCount, p + 1))}>Next <ChevronRight className="w-4 h-4 ml-1" /></Button>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="text-center py-16">
          <Trophy className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-[#000] mb-2">No rankings yet</h3>
          <p className="text-neutral-600">Start earning XP to appear on the board!</p>
        </div>
      )}
    </div>
  );
};

export default Leaderboard;
