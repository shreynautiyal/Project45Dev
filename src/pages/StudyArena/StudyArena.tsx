import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import toast from 'react-hot-toast';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  MessageSquare,
  Plus,
  Search,
  X,
  ChevronLeft,
  Send,
  Sparkles,
  Hash,
  Shield,
  Clock,
  Loader2,
  Pause,
  Play,
  Coffee,
  TimerReset,
  Trophy,
  List,
} from 'lucide-react';

/* ----------------------------- Types ----------------------------- */

type Room = {
  id: string;
  name: string;
  subject: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  host_id: string;
  created_at: string;
};

type Profile = {
  id: string;
  username: string;
  profile_picture: string | null;
};

type Message = {
  id: string;
  room_id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles: {
    username: string;
    profile_picture: string | null;
  };
  __optimistic?: boolean;
};

type PresenceUser = {
  user_id: string;
  username: string;
  profile_picture: string | null;
  last_active: number; // epoch ms
};

type PomodoroMode = 'idle' | 'focus' | 'break';

type PomodoroState = {
  mode: PomodoroMode;
  cycle_idx: number; // 1..4
  ends_at: string | null; // ISO
  config: { focus: number; short: number; long: number; long_every: number };
  updated_by?: string | null;
  updated_at?: string | null;
};

type LeaderRow = {
  user_id: string;
  username: string;
  profile_picture: string | null;
  seconds: number;
};

/* -------------------------- Small helpers ------------------------ */

const DIFF_COLORS: Record<Room['difficulty'], string> = {
  Easy: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200',
  Medium: 'bg-amber-100 text-amber-800 ring-1 ring-amber-200',
  Hard: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200',
};

function cx(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(' ');
}

function timeSince(dateStr: string) {
  const d = new Date(dateStr);
  const diff = Math.max(0, Date.now() - d.getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const D = Math.floor(h / 24);
  return `${D}d`;
}

function formatDuration(sec: number) {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

const nowUtc = () => new Date().toISOString();

/* Idle if no user input for 60s OR tab hidden for >60s */
function isActive(lastInputMs: number, hiddenSinceMs: number | null) {
  const now = Date.now();
  const inputOk = now - lastInputMs <= 60_000;
  const tabOk = hiddenSinceMs === null || now - hiddenSinceMs <= 60_000;
  return inputOk && tabOk;
}

/* --------------------------- Component --------------------------- */

export default function StudyArena() {
  const { user } = useAuthStore();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const [roomName, setRoomName] = useState('');
  const [subject, setSubject] = useState('');
  const [difficulty, setDifficulty] = useState<Room['difficulty']>('Easy');
  const [showCreate, setShowCreate] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);

  const [roomsChannel, setRoomsChannel] = useState<RealtimeChannel | null>(null);
  const [msgsChannel, setMsgsChannel] = useState<RealtimeChannel | null>(null);
  const [presenceChannel, setPresenceChannel] = useState<RealtimeChannel | null>(null);
  const [typingChannel, setTypingChannel] = useState<RealtimeChannel | null>(null);
  const [pomodoroChannel, setPomodoroChannel] = useState<RealtimeChannel | null>(null);

  const [onlineUsers, setOnlineUsers] = useState<Record<string, PresenceUser>>({});
  const [typingMap, setTypingMap] = useState<Record<string, number>>({}); // user_id -> expiresAt

  const [q, setQ] = useState('');
  const [diffFilter, setDiffFilter] = useState<'All' | Room['difficulty']>('All');
  const [subjectFilter, setSubjectFilter] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timer | null>(null);

  // Activity + session state
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionActiveSeconds, setSessionActiveSeconds] = useState(0);
  const [lastInputAt, setLastInputAt] = useState<number>(Date.now());
  const [hiddenSince, setHiddenSince] = useState<number | null>(document.visibilityState === 'hidden' ? Date.now() : null);
  const [endSummaryOpen, setEndSummaryOpen] = useState(false);
  const [endSummary, setEndSummary] = useState<{ seconds: number; cycles: number; focusPct: number }>({ seconds: 0, cycles: 0, focusPct: 0 });
  const [endNote, setEndNote] = useState('');

  // Solo Pomodoro
  const [soloMode, setSoloMode] = useState<PomodoroMode>('idle');
  const [soloEndsAt, setSoloEndsAt] = useState<string | null>(null);
  const [soloCycle, setSoloCycle] = useState(0);
  const defaultPomodoro = { focus: 1500, short: 300, long: 900, long_every: 4 };

  // Shared Pomodoro
  const [shared, setShared] = useState<PomodoroState>({
    mode: 'idle',
    cycle_idx: 0,
    ends_at: null,
    config: defaultPomodoro,
  });

  // Leaderboards
  const [top5Today, setTop5Today] = useState<LeaderRow[]>([]);
  const [top5All, setTop5All] = useState<LeaderRow[]>([]);
  const [showBoards, setShowBoards] = useState(false);

  /* -------------------- Rooms list load + subscribe -------------------- */
  useEffect(() => {
    if (!user) return;

    (async () => {
      setLoadingRooms(true);
      const { data, error } = await supabase
        .from('study_rooms')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        toast.error('Could not load rooms.');
      } else {
        setRooms((data || []) as Room[]);
      }
      setLoadingRooms(false);
    })();

    const channel = supabase
      .channel('room-list')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'study_rooms' }, (payload) => {
        setRooms((prev) => {
          const next = [payload.new as Room, ...prev];
          return next.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
        });
      })
      .subscribe();

    setRoomsChannel(channel);
    return () => {
      try { channel.unsubscribe(); supabase.removeChannel(channel); } catch {}
    };
  }, [user]);

  /* ------------------------- Join room routine ------------------------- */
  const joinRoom = async (room: Room) => {
    if (!user) return;
    setSelectedRoom(room);
    setMessages([]);
    setOnlineUsers({});
    setTypingMap({});
    setTop5Today([]);
    setTop5All([]);

    // Clean channels
    for (const ch of [msgsChannel, presenceChannel, typingChannel, pomodoroChannel]) {
      if (ch) { try { ch.unsubscribe(); supabase.removeChannel(ch); } catch {} }
    }
    setMsgsChannel(null); setPresenceChannel(null); setTypingChannel(null); setPomodoroChannel(null);

    // Upsert membership
    await supabase.from('study_room_members').upsert({ room_id: room.id, user_id: user.id });

    // Load messages
    const { data, error } = await supabase
      .from('study_room_messages')
      .select('*, profiles(username, profile_picture)')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true });
    if (error) toast.error('Could not load messages.');
    else setMessages((data || []) as Message[]);

    // Subscribe to new messages
    const mChannel = supabase
      .channel(`room:${room.id}:messages`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'study_room_messages', filter: `room_id=eq.${room.id}`,
      }, (payload) => setMessages((m) => [...m, payload.new as Message]))
      .subscribe();
    setMsgsChannel(mChannel);

    // Presence (who's online)
    const pChannel = supabase.channel(`presence:room:${room.id}`, { config: { presence: { key: user.id } } });
    pChannel
      .on('presence', { event: 'sync' }, () => {
        const state = pChannel.presenceState() as Record<string, Array<PresenceUser>>;
        const aggregated: Record<string, PresenceUser> = {};
        for (const key of Object.keys(state)) for (const u of state[key]) aggregated[u.user_id] = u;
        setOnlineUsers(aggregated);
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        setOnlineUsers((prev) => {
          const copy = { ...prev };
          for (const u of newPresences as unknown as PresenceUser[]) copy[u.user_id] = u;
          return copy;
        });
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        setOnlineUsers((prev) => {
          const copy = { ...prev };
          for (const u of leftPresences as unknown as PresenceUser[]) delete copy[u.user_id];
          return copy;
        });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const { data: prof } = await supabase
            .from('profiles')
            .select('id, username, profile_picture')
            .eq('id', user.id).single();
          await pChannel.track({
            user_id: user.id,
            username: prof?.username ?? 'You',
            profile_picture: prof?.profile_picture ?? null,
            last_active: Date.now(),
          } as PresenceUser);
        }
      });
    setPresenceChannel(pChannel);

    // Typing broadcasts
    const tChannel = supabase.channel(`typing:room:${room.id}`);
    tChannel.on('broadcast', { event: 'typing' }, (payload: any) => {
      const { user_id, ttlMs = 2500 } = payload.payload || {};
      if (!user_id || user_id === user.id) return;
      setTypingMap((prev) => ({ ...prev, [user_id]: Date.now() + ttlMs }));
    }).subscribe();
    setTypingChannel(tChannel);

    // Shared Pomodoro realtime
    const pdChannel = supabase.channel(`pomodoro:room:${room.id}`);
    pdChannel.on('broadcast', { event: 'pomodoro' }, (payload: any) => {
      const p = payload.payload as PomodoroState;
      setShared(p);
    }).subscribe();
    setPomodoroChannel(pdChannel);

    // Load current shared pomodoro row
    const { data: rp } = await supabase.from('room_pomodoro').select('*').eq('room_id', room.id).maybeSingle();
    if (rp) setShared({
      mode: rp.mode as PomodoroMode,
      cycle_idx: rp.cycle_idx,
      ends_at: rp.ends_at,
      config: rp.config ?? defaultPomodoro,
      updated_by: rp.updated_by,
      updated_at: rp.updated_at,
    });
    // Start session
    await startSession(room.id);
    // Load leaderboards
    await refreshLeaderboards(room.id);
  };

  /* ------------------------ Typing map cleanup ------------------------ */
  useEffect(() => {
    if (typingIntervalRef.current) clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = setInterval(() => {
      setTypingMap((prev) => {
        const now = Date.now();
        const next: Record<string, number> = {};
        for (const [uid, until] of Object.entries(prev)) if (until > now) next[uid] = until;
        return next;
      });
    }, 800);
    return () => { if (typingIntervalRef.current) clearInterval(typingIntervalRef.current); };
  }, []);

  const broadcastTyping = () => {
    if (!typingChannel || !user) return;
    typingChannel.send({ type: 'broadcast', event: 'typing', payload: { user_id: user.id, ttlMs: 2500 } });
  };

  /* ---------------------- Session start / heartbeat --------------------- */

  async function startSession(room_id: string) {
    if (!user) return;
    // Close any previous open sessions for safety
    await supabase.from('study_sessions')
      .update({ ended_at: nowUtc() })
      .eq('user_id', user.id)
      .is('ended_at', null);

    // Create new
    const { data, error } = await supabase
      .from('study_sessions')
      .insert({ room_id, user_id: user.id, started_at: nowUtc() })
      .select('id')
      .single();
    if (error || !data) {
      toast.error('Could not start session.');
      return;
    }
    setSessionId(data.id);
    setSessionActiveSeconds(0);
    setLastInputAt(Date.now());
    setHiddenSince(document.visibilityState === 'hidden' ? Date.now() : null);
  }

  async function finalizeSession(note?: string) {
    if (!sessionId) return;
    const seconds = sessionActiveSeconds;
    const { error } = await supabase
      .from('study_sessions')
      .update({
        ended_at: nowUtc(),
        seconds_active: seconds,
        ...(note ? { notes: note } : {}),
      })
      .eq('id', sessionId);
    if (error) console.error(error);
  }

  // Heartbeat every 20s AND local 1s tick
  useEffect(() => {
    if (!sessionId || !presenceChannel) return;
    let hbTimer: NodeJS.Timer | null = null;
    let tickTimer: NodeJS.Timer | null = null;

    const sendHeartbeat = async () => {
      // Presence
      try {
        await presenceChannel.track({
          ...(onlineUsers[user!.id] || {}),
          last_active: Date.now(),
        });
      } catch {}
      // DB heartbeat
      try {
        await supabase.rpc('hb_session', { p_session: sessionId });
      } catch {}
    };

    const tick = () => {
      const active = isActive(lastInputAt, hiddenSince);
      if (active) setSessionActiveSeconds((s) => s + 1);
    };

    hbTimer = setInterval(sendHeartbeat, 20_000);
    tickTimer = setInterval(tick, 1000);

    return () => {
      if (hbTimer) clearInterval(hbTimer);
      if (tickTimer) clearInterval(tickTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, presenceChannel, lastInputAt, hiddenSince]);

  // Global activity listeners
  useEffect(() => {
    const onInput = () => setLastInputAt(Date.now());
    const onVis = () => {
      if (document.visibilityState === 'hidden') setHiddenSince(Date.now());
      else setHiddenSince(null);
    };
    window.addEventListener('mousemove', onInput, { passive: true });
    window.addEventListener('keydown', onInput);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('mousemove', onInput as any);
      window.removeEventListener('keydown', onInput as any);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  /* ---------------------------- Leave room ---------------------------- */
  const leaveRoom = async () => {
    // finalize
    if (sessionId) {
      await finalizeSession(endNote || undefined);
      setEndSummary({ seconds: sessionActiveSeconds, cycles: soloCycle, focusPct: soloMode === 'focus' ? 100 : 100 }); // basic; solo summary
      setEndSummaryOpen(true);
    }
    setSelectedRoom(null);
    setMessages([]);
    setTypingMap({});
    setSessionId(null);
    for (const ch of [msgsChannel, presenceChannel, typingChannel, pomodoroChannel]) {
      if (ch) { try { ch.unsubscribe(); supabase.removeChannel(ch); } catch {} }
    }
    setMsgsChannel(null); setPresenceChannel(null); setTypingChannel(null); setPomodoroChannel(null);
  };

  useEffect(() => {
    const beforeUnload = async () => { if (sessionId) await finalizeSession(endNote || undefined); };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload as any);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, endNote, sessionActiveSeconds]);

  /* ----------------------------- Messaging ---------------------------- */

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !selectedRoom || !user) return;
    const content = newMessage.trim();
    setNewMessage('');

    const optimistic: Message = {
      id: `optimistic-${Math.random().toString(36).slice(2)}`,
      room_id: selectedRoom.id,
      user_id: user.id,
      content,
      created_at: new Date().toISOString(),
      profiles: { username: 'You', profile_picture: null },
      __optimistic: true,
    };
    setMessages((m) => [...m, optimistic]);
    setIsSending(true);

    const { error } = await supabase.from('study_room_messages').insert({
      room_id: selectedRoom.id,
      user_id: user.id,
      content,
    });

    if (error) {
      setMessages((m) => m.filter((msg) => msg.id !== optimistic.id));
      toast.error('Failed to send. Try again.');
    }
    setIsSending(false);
  };

  /* ------------------------ Room totals + badges ----------------------- */

  const onlineList = useMemo(() => Object.values(onlineUsers), [onlineUsers]);

  // Who’s active now (client-computed from presence)
  const activeNowCount = useMemo(() => {
    const now = Date.now();
    return onlineList.filter(u => now - u.last_active <= 60_000).length;
  }, [onlineList]);

  // Room "focus total" = sum of visible active timers
  const roomFocusSeconds = useMemo(() => {
    // We can't know precise seconds for others; show "soft" total: count * (approx)
    // Here we just multiply active users by 0 (we avoid misleading sum) and show count.
    // If you want a true rolling sum, you could track client start times via presence.
    return sessionActiveSeconds; // use your own contribution + badge per user
  }, [sessionActiveSeconds]);

  /* --------------------------- Leaderboards --------------------------- */

  async function refreshLeaderboards(roomId: string) {
    // Today (room) using study_sessions (intersection with today) or stats.today_seconds
    // We’ll read from user_room_stats for performance.

    const { data: todayRows } = await supabase
      .rpc('exec_sql', {  /* fallback if you don’t have postgres rpc extension, comment this and use select below */ });

    // Fallback: select with joins
    const { data: today, error: e1 } = await supabase
      .from('user_room_stats')
      .select('user_id, today_seconds, profiles:profiles(username, profile_picture)')
      .eq('room_id', roomId)
      .order('today_seconds', { ascending: false })
      .limit(5);
    if (!e1 && today) {
      setTop5Today(today.map((r: any) => ({
        user_id: r.user_id,
        seconds: r.today_seconds,
        username: r.profiles?.username || 'User',
        profile_picture: r.profiles?.profile_picture || null,
      })));
    }

    const { data: all, error: e2 } = await supabase
      .from('user_room_stats')
      .select('user_id, total_seconds, profiles:profiles(username, profile_picture)')
      .eq('room_id', roomId)
      .order('total_seconds', { ascending: false })
      .limit(5);
    if (!e2 && all) {
      setTop5All(all.map((r: any) => ({
        user_id: r.user_id,
        seconds: r.total_seconds,
        username: r.profiles?.username || 'User',
        profile_picture: r.profiles?.profile_picture || null,
      })));
    }
  }

  useEffect(() => {
    if (!selectedRoom) return;
    const t = setInterval(() => refreshLeaderboards(selectedRoom.id), 20_000);
    return () => clearInterval(t);
  }, [selectedRoom]);

  /* --------------------------- Pomodoro logic -------------------------- */

  const remainingSolo = useMemo(() => {
    if (!soloEndsAt) return 0;
    return Math.max(0, Math.floor((+new Date(soloEndsAt) - Date.now()) / 1000));
  }, [soloEndsAt]);

  const remainingShared = useMemo(() => {
    if (!shared.ends_at) return 0;
    return Math.max(0, Math.floor((+new Date(shared.ends_at) - Date.now()) / 1000));
  }, [shared.ends_at]);

  // Solo tick
  useEffect(() => {
    const t = setInterval(() => {
      if (soloMode === 'idle' || !soloEndsAt) return;
      if (Date.now() >= +new Date(soloEndsAt)) {
        // advance
        if (soloMode === 'focus') {
          const nextCycle = (soloCycle % defaultPomodoro.long_every) + 1;
          setSoloCycle(nextCycle);
          const dur = nextCycle === defaultPomodoro.long_every ? defaultPomodoro.long : defaultPomodoro.short;
          setSoloMode('break');
          setSoloEndsAt(new Date(Date.now() + dur * 1000).toISOString());
        } else {
          // was break -> focus
          setSoloMode('focus');
          setSoloEndsAt(new Date(Date.now() + defaultPomodoro.focus * 1000).toISOString());
        }
      }
    }, 1000);
    return () => clearInterval(t);
  }, [soloMode, soloEndsAt, soloCycle]);

  // Shared controls (host only)
  const isHost = selectedRoom && user && selectedRoom.host_id === user.id;

  async function pushShared(next: PomodoroState) {
    if (!selectedRoom) return;
    // Upsert DB
    await supabase.from('room_pomodoro').upsert({
      room_id: selectedRoom.id,
      mode: next.mode,
      cycle_idx: next.cycle_idx,
      ends_at: next.ends_at,
      config: next.config,
      updated_by: user!.id,
      updated_at: nowUtc(),
    });
    // Broadcast
    if (pomodoroChannel) {
      pomodoroChannel.send({ type: 'broadcast', event: 'pomodoro', payload: next });
    }
    setShared(next);
  }

  const startSharedFocus = async () => {
    if (!selectedRoom) return;
    const ends = new Date(Date.now() + shared.config.focus * 1000).toISOString();
    await pushShared({ ...shared, mode: 'focus', ends_at: ends, cycle_idx: (shared.cycle_idx % shared.config.long_every) + 1 });
  };
  const startSharedBreak = async () => {
    if (!selectedRoom) return;
    const useLong = shared.cycle_idx === shared.config.long_every;
    const dur = useLong ? shared.config.long : shared.config.short;
    const ends = new Date(Date.now() + dur * 1000).toISOString();
    await pushShared({ ...shared, mode: 'break', ends_at: ends });
  };
  const stopShared = async () => pushShared({ ...shared, mode: 'idle', ends_at: null, cycle_idx: 0 });

  /* ----------------------------- UI Pieces ----------------------------- */

  const filteredRooms = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const subj = subjectFilter.trim().toLowerCase();
    return rooms.filter((r) => {
      const matchesQ = !ql || r.name.toLowerCase().includes(ql) || r.subject.toLowerCase().includes(ql);
      const matchesDiff = diffFilter === 'All' || r.difficulty === diffFilter;
      const matchesSubj = !subj || r.subject.toLowerCase().includes(subj);
      return matchesQ && matchesDiff && matchesSubj;
    });
  }, [rooms, q, diffFilter, subjectFilter]);

  if (!user) return null;

  /* ------------------------------ Render ------------------------------ */

  return (
    <div className="relative min-h-[calc(100vh-4rem)]">
      <div className="absolute inset-x-0 top-0 h-64 bg-gradient-to-br from-indigo-600 via-fuchsia-600 to-orange-500 opacity-20 blur-2xl pointer-events-none" />
      <div className="relative p-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-0 shadow-lg ring-1 ring-black/5">
            <CardHeader className="flex flex-row justify-between items-center">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Study Arena
              </CardTitle>
              <Button variant="primary" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Create
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <Input className="pl-9" placeholder="Search rooms or subjects..." value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <select className="col-span-1 w-full border rounded px-3 py-2 text-sm bg-white" value={diffFilter} onChange={(e) => setDiffFilter(e.target.value as any)}>
                  <option value="All">All</option>
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
                <div className="col-span-2">
                  <Input placeholder="Filter by subject (e.g., Physics)" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg ring-1 ring-black/5">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Hash className="h-5 w-5" />
                Available Rooms
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[28rem] overflow-y-auto pr-1">
              {loadingRooms ? (
                <div className="flex items-center justify-center py-10 text-gray-500">
                  <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  Loading rooms…
                </div>
              ) : filteredRooms.length === 0 ? (
                <div className="text-gray-500 text-sm py-8 text-center">No rooms match your filters.</div>
              ) : (
                filteredRooms.map((r) => (
                  <motion.button
                    key={r.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    className={cx('w-full text-left p-3 rounded-lg border bg-white hover:bg-gray-50 transition',
                      selectedRoom?.id === r.id && 'border-indigo-300 ring-2 ring-indigo-200')}
                    onClick={() => joinRoom(r)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium">{r.name}</p>
                      <span className={cx('text-[10px] px-2 py-0.5 rounded-full', DIFF_COLORS[r.difficulty])}>
                        {r.difficulty}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                      <span className="inline-flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        {r.subject}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {timeSince(r.created_at)} ago
                      </span>
                      {r.host_id === user.id && (
                        <span className="inline-flex items-center gap-1 text-indigo-600">
                          <Shield className="h-3.5 w-3.5" />
                          Host
                        </span>
                      )}
                    </div>
                  </motion.button>
                ))
              )}
            </CardContent>
          </Card>

          {/* Leaderboards (Top 5) */}
          {selectedRoom && (
            <Card className="border-0 shadow-lg ring-1 ring-black/5">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  Leaderboards
                </CardTitle>
                <Button size="sm" variant="secondary" onClick={() => setShowBoards(true)}>
                  <List className="h-4 w-4 mr-1" /> View full
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-2">Today</div>
                  <div className="space-y-2">
                    {top5Today.length === 0 && <div className="text-xs text-gray-500">No data yet.</div>}
                    {top5Today.map((r, i) => (
                      <div key={r.user_id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-5 text-gray-400">{i + 1}.</span>
                          <img src={r.profile_picture || ''} className="h-6 w-6 rounded-full bg-gray-200" />
                          <span className="truncate max-w-[9rem]">{r.username}</span>
                        </div>
                        <span className="tabular-nums text-gray-700">{formatDuration(r.seconds)}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-2">All-time</div>
                  <div className="space-y-2">
                    {top5All.length === 0 && <div className="text-xs text-gray-500">No data yet.</div>}
                    {top5All.map((r, i) => (
                      <div key={r.user_id} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span className="w-5 text-gray-400">{i + 1}.</span>
                          <img src={r.profile_picture || ''} className="h-6 w-6 rounded-full bg-gray-200" />
                          <span className="truncate max-w-[9rem]">{r.username}</span>
                        </div>
                        <span className="tabular-nums text-gray-700">{formatDuration(r.seconds)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Chat Panel */}
        <div className="lg:col-span-2 flex flex-col">
          {!selectedRoom ? (
            <Card className="border-0 shadow-xl ring-1 ring-black/5 h-[80vh] flex items-center justify-center">
              <div className="text-center max-w-md">
                <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-indigo-600/10 flex items-center justify-center">
                  <Sparkles className="h-7 w-7 text-indigo-600" />
                </div>
                <h2 className="text-xl font-semibold">Welcome to Study Arena</h2>
                <p className="text-gray-500 mt-1">Create a room or join one from the list to start collaborating in real time.</p>
              </div>
            </Card>
          ) : (
            <Card className="border-0 shadow-xl ring-1 ring-black/5 h-[80vh] flex flex-col overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 border-b bg-white/70 backdrop-blur flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Button variant="secondary" onClick={leaveRoom} className="hidden sm:inline-flex">
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Rooms
                  </Button>
                  <div>
                    <div className="flex items-center gap-2">
                      <CardTitle>{selectedRoom.name}</CardTitle>
                      <span className={cx('text-[10px] px-2 py-0.5 rounded-full', DIFF_COLORS[selectedRoom.difficulty])}>
                        {selectedRoom.difficulty}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">{selectedRoom.subject}</div>
                  </div>
                </div>

                {/* Presence + Focus total */}
                <div className="flex items-center gap-4">
                  <div className="hidden md:flex items-center gap-2">
                    <Users className="h-4 w-4 text-gray-400" />
                    <div className="flex -space-x-2">
                      {onlineList.slice(0, 5).map((u) => (
                        <img key={u.user_id} src={u.profile_picture || ''} alt={u.username}
                          className="h-6 w-6 rounded-full object-cover bg-gray-200 ring-2 ring-white" title={u.username} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-600 ml-1">{onlineList.length} online</span>
                  </div>
                  <div className="text-xs text-gray-700" aria-live="polite">
                    <span className="font-medium">Room Focus:</span> {formatDuration(roomFocusSeconds)} total
                    <span className="ml-2 text-gray-500">({activeNowCount} active now)</span>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 bg-gradient-to-b from-white to-gray-50">
                <div className="space-y-4">
                  {/* Online badges */}
                  <div className="flex flex-wrap gap-3 mb-2">
                    {onlineList.map((u) => {
                      const active = Date.now() - u.last_active <= 60_000;
                      return (
                        <div key={u.user_id} className="flex items-center gap-2 px-2 py-1 rounded-full border bg-white">
                          <img src={u.profile_picture || ''} className="h-5 w-5 rounded-full bg-gray-200" />
                          <span className="text-xs">{u.username}</span>
                          <span className={cx('text-[10px] px-2 py-0.5 rounded-full',
                            active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-600')}>
                            {active ? `Studying ${u.user_id === user.id ? formatDuration(sessionActiveSeconds) : 'now'}` : 'Idle'}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <AnimatePresence initial={false}>
                    {messages.map((msg) => {
                      const mine = msg.user_id === user.id;
                      return (
                        <motion.div
                          key={msg.id}
                          initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                          className={cx('flex items-start gap-2', mine && 'flex-row-reverse')}
                        >
                          <img src={msg.profiles.profile_picture || ''} alt="" className="h-8 w-8 rounded-full object-cover bg-gray-200" />
                          <div className={cx('max-w-[80%]')}>
                            <div className={cx('text-[11px] mb-0.5', mine ? 'text-right' : 'text-left')}>
                              <span className="font-semibold">{mine ? 'You' : msg.profiles.username}</span>
                              <span className="text-gray-400 ml-2">{timeSince(msg.created_at)} ago</span>
                              {msg.__optimistic && <span className="ml-2 text-indigo-500">sending…</span>}
                            </div>
                            <div className={cx('px-3 py-2 rounded-2xl border',
                              mine ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-gray-900 border-gray-200')}>
                              {msg.content}
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* Typing indicator */}
                  {Object.keys(typingMap).length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-gray-500 pl-10">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {Object.keys(typingMap).length === 1 ? 'Someone is typing…' : 'Multiple people are typing…'}
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>
              </div>

              {/* Composer + Pomodoro */}
              <div className="p-3 border-t bg-white/70 backdrop-blur space-y-3">
                {/* Pomodoro row */}
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  {/* Solo controls */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600">Solo</span>
                    {soloMode !== 'focus' && (
                      <Button size="sm" variant="secondary" onClick={() => {
                        setSoloMode('focus');
                        setSoloEndsAt(new Date(Date.now() + defaultPomodoro.focus * 1000).toISOString());
                        setSoloCycle((c) => (c % defaultPomodoro.long_every) + 1);
                      }}>
                        <Play className="h-4 w-4 mr-1" /> Focus
                      </Button>
                    )}
                    {soloMode !== 'idle' && (
                      <Button size="sm" variant="secondary" onClick={() => { setSoloMode('idle'); setSoloEndsAt(null); }}>
                        <Pause className="h-4 w-4 mr-1" /> Stop
                      </Button>
                    )}
                    {soloMode !== 'idle' && (
                      <span className={cx('text-[11px] px-2 py-0.5 rounded-full border',
                        soloMode === 'focus' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-800 border-amber-200')}
                        aria-live="polite">
                        {soloMode === 'focus' ? 'Focus' : 'Break'} • {formatDuration(remainingSolo)}
                      </span>
                    )}
                  </div>

                  {/* Shared controls */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-gray-600">Shared</span>
                    {isHost ? (
                      <>
                        <Button size="sm" variant="secondary" onClick={startSharedFocus}><Play className="h-4 w-4 mr-1" /> Focus</Button>
                        <Button size="sm" variant="secondary" onClick={startSharedBreak}><Coffee className="h-4 w-4 mr-1" /> Break</Button>
                        <Button size="sm" variant="secondary" onClick={stopShared}><TimerReset className="h-4 w-4 mr-1" /> End</Button>
                      </>
                    ) : (
                      <span className="text-[11px] text-gray-500">host controls</span>
                    )}
                    <span className={cx('text-[11px] px-2 py-0.5 rounded-full border',
                      shared.mode === 'focus' ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                        : shared.mode === 'break' ? 'bg-amber-100 text-amber-800 border-amber-200'
                        : 'bg-gray-100 text-gray-600 border-gray-200')}
                      aria-live="polite">
                      {shared.mode === 'idle' ? 'Idle' : shared.mode === 'focus' ? 'Focus' : 'Break'} • {formatDuration(remainingShared)}
                    </span>
                    <span className="text-[10px] text-gray-500">Cycle {shared.cycle_idx || 0}</span>
                  </div>
                </div>

                {/* Message input */}
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Type a message…"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); else broadcastTyping(); }}
                  />
                  <Button onClick={handleSendMessage} disabled={isSending || !newMessage.trim()}>
                    {isSending ? (<><Loader2 className="h-4 w-4 animate-spin mr-1" /> Sending</>)
                      : (<><Send className="h-4 w-4 mr-1" /> Send</>)}
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Create Room Modal */}
      <AnimatePresence>
        {showCreate && (
          <motion.div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onMouseDown={() => setShowCreate(false)}>
            <motion.div className="w-full max-w-md bg-white rounded-2xl shadow-2xl ring-1 ring-black/5"
              initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }}
              onMouseDown={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  <h3 className="font-semibold">Create Room</h3>
                </div>
                <button onClick={() => setShowCreate(false)} className="p-1 rounded-md hover:bg-gray-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <Input placeholder="Room name" value={roomName} onChange={(e) => setRoomName(e.target.value)} />
                <Input placeholder="Subject (e.g., Physics)" value={subject} onChange={(e) => setSubject(e.target.value)} />
                <select className="w-full border rounded px-3 py-2" value={difficulty} onChange={(e) => setDifficulty(e.target.value as Room['difficulty'])}>
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </div>
              <div className="px-5 pb-5">
                <Button className="w-full" onClick={async () => {
                  if (!roomName.trim() || !subject.trim()) return toast.error('Please fill in room name and subject.');
                  if (!user) return;

                  const { data: created, error: err } = await supabase
                    .from('study_rooms')
                    .insert({
                      name: roomName.trim(),
                      subject: subject.trim(),
                      difficulty,
                      host_id: user.id,
                    })
                    .select('*')
                    .single();

                  if (err || !created) {
                    toast.error('Could not create room.');
                    return;
                  }
                  toast.success('Room created');
                  setShowCreate(false);
                  setRoomName('');
                  setSubject('');
                  setDifficulty('Easy');
                  // auto-join the new room
                  await joinRoom(created as Room);
                }}>
                  Create Room
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Full Leaderboards Modal */}
      <AnimatePresence>
        {showBoards && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setShowBoards(false)}
          >
            <motion.div
              className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl ring-1 ring-black/5"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Trophy className="h-5 w-5" />
                  <h3 className="font-semibold">Leaderboards</h3>
                </div>
                <button
                  onClick={() => setShowBoards(false)}
                  className="p-1 rounded-md hover:bg-gray-100"
                  aria-label="Close leaderboards"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5">
                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-2">Today</div>
                  <div className="space-y-2 max-h-[24rem] overflow-y-auto pr-1">
                    {top5Today.length === 0 && (
                      <div className="text-sm text-gray-500">No data yet.</div>
                    )}
                    {top5Today.map((r, i) => (
                      <div
                        key={`full-today-${r.user_id}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-gray-400 tabular-nums">{i + 1}.</span>
                          <img
                            src={r.profile_picture || ''}
                            className="h-7 w-7 rounded-full bg-gray-200"
                          />
                          <span className="truncate max-w-[10rem]">{r.username}</span>
                        </div>
                        <span className="tabular-nums text-gray-700">
                          {formatDuration(r.seconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold text-gray-600 mb-2">All-time</div>
                  <div className="space-y-2 max-h-[24rem] overflow-y-auto pr-1">
                    {top5All.length === 0 && (
                      <div className="text-sm text-gray-500">No data yet.</div>
                    )}
                    {top5All.map((r, i) => (
                      <div
                        key={`full-all-${r.user_id}`}
                        className="flex items-center justify-between text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-6 text-gray-400 tabular-nums">{i + 1}.</span>
                          <img
                            src={r.profile_picture || ''}
                            className="h-7 w-7 rounded-full bg-gray-200"
                          />
                          <span className="truncate max-w-[10rem]">{r.username}</span>
                        </div>
                        <span className="tabular-nums text-gray-700">
                          {formatDuration(r.seconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5">
                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={() => setShowBoards(false)}
                >
                  Close
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* End-of-session Summary Modal */}
      <AnimatePresence>
        {endSummaryOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onMouseDown={() => setEndSummaryOpen(false)}
          >
            <motion.div
              className="w-full max-w-md bg-white rounded-2xl shadow-2xl ring-1 ring-black/5"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              onMouseDown={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5" />
                  <h3 className="font-semibold">Session Summary</h3>
                </div>
                <button
                  onClick={() => setEndSummaryOpen(false)}
                  className="p-1 rounded-md hover:bg-gray-100"
                  aria-label="Close summary"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Active time</span>
                    <span className="font-medium tabular-nums">
                      {formatDuration(endSummary.seconds)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Focus %</span>
                    <span className="font-medium tabular-nums">{Math.round(endSummary.focusPct)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray-500">Pomodoro cycles</span>
                    <span className="font-medium tabular-nums">{endSummary.cycles}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Add a quick note (optional)</label>
                  <textarea
                    className="w-full border rounded-md p-2 text-sm"
                    rows={3}
                    placeholder="What did you accomplish? What to do next?"
                    value={endNote}
                    onChange={(e) => setEndNote(e.target.value)}
                  />
                </div>
              </div>

              <div className="px-5 pb-5 grid grid-cols-2 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setEndSummaryOpen(false)}
                >
                  Close
                </Button>
                <Button
                  onClick={async () => {
                    if (!endNote.trim()) {
                      setEndSummaryOpen(false);
                      return;
                    }
                    // Save note to the most recent ended session for this user
                    try {
                      const { data: last, error: e1 } = await supabase
                        .from('study_sessions')
                        .select('id')
                        .eq('user_id', user!.id)
                        .not('ended_at', 'is', null)
                        .order('ended_at', { ascending: false })
                        .limit(1)
                        .single();

                      if (!e1 && last?.id) {
                        await supabase
                          .from('study_sessions')
                          .update({ notes: endNote })
                          .eq('id', last.id);
                        toast.success('Note saved');
                      }
                    } catch {}
                    setEndNote('');
                    setEndSummaryOpen(false);
                  }}
                >
                  Save Note
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
