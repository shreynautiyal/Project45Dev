// src/pages/Learning/LearnHub.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Bot, User, BookOpen, ChevronUp, Flame, Trophy, Zap,
  ShieldCheck, Copy, RotateCcw, Trash2, FileDown, Clock, Loader2,
  Filter, Info, Bookmark, Menu, PenLine, FileText, Hammer, LayoutList, Wand2,
  Search, FunctionSquare, NotebookText, GraduationCap, AlertTriangle, X, Lock, Image as ImageIcon
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { aiService, ChatMessage } from '../services/aiService';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
// import rehypeRaw from 'rehype-raw';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import TextareaAutosize from 'react-textarea-autosize';

/* ===========================
   Helpers
=========================== */
const normalizeMD = (s: string): string => {
  return s
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n');
};

const todayISO = () => new Date().toISOString().slice(0, 10);

type Subject = { id: string; name: string; icon: string; color: string };
type RoomRow = { user_id: string; subject: string; messages: ChatMessage[] | string | null; updated_at?: string | null };
type TierKey = 'free' | 'pro' | 'elite';
type Level = 'HL' | 'SL';

const parseMessages = (raw: RoomRow['messages']): ChatMessage[] => {
  try {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as ChatMessage[];
    return JSON.parse(raw as string) as ChatMessage[];
  } catch {
    return [];
  }
};

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success('Copied!');
  } catch {
    toast.error('Copy failed');
  }
};

const STORAGE_SUBJECT_KEY = 'lh.selectedSubjectId';
const STORAGE_LEVEL_KEY = 'lh.level';

/* ===========================
   Config (no default subjects)
=========================== */

// Quotas + burst caps (client hints; server RPC is the source of truth)
const TIER_DAILY_QUOTA: Record<string, number> = { free: 25, pro: 400, elite: 2000 };
const TIER_BURST_CAP_PER_MIN: Record<string, number> = { free: 6, pro: 30, elite: 60 };

// Slash commands
const SLASH_COMMANDS = [
  { key: '/explain',   label: 'Explain a concept',      hint: 'Clear overview + IB focus',          icon: <FunctionSquare className="w-4 h-4" /> },
  { key: '/example',   label: 'Worked example',         hint: 'Step-by-step with reasoning',        icon: <PenLine className="w-4 h-4" /> },
  { key: '/practice',  label: 'Practice questions',     hint: 'Easy→hard with brief answers',       icon: <Hammer className="w-4 h-4" /> },
  { key: '/mark',      label: 'Mark my work',           hint: 'Paper 1/2 IB rubric feedback',       icon: <NotebookText className="w-4 h-4" /> },
  { key: '/rubric',    label: 'Insert rubric',          hint: 'Subject + Paper rubric',             icon: <FileText className="w-4 h-4" /> },
  { key: '/plan',      label: 'Revision plan',          hint: 'SMART plan by topic + time',         icon: <LayoutList className="w-4 h-4" /> },
  { key: '/pastpaper', label: 'Past paper style',       hint: 'Exam-style Qs + marks',              icon: <GraduationCap className="w-4 h-4" /> },
] as const;
type SlashKey = typeof SLASH_COMMANDS[number]['key'];

/* ===========================
   Component
=========================== */
const MODE_PROMPTS: Record<string, string> = {
  Explain: 'Explain this concept clearly like an IB tutor. Include definitions, the “why”, and 1–2 classic traps.',
  'Worked Example': 'Give a fully worked example with step-by-step reasoning and common mistakes.',
  Practice: 'Give 5 practice questions (easy→hard) with brief answers. Separate by level and include quick feedback.',
  'Exam-Style': 'Generate 3 exam-style questions with marks per step and concise markscheme answers.',
  Marking: 'Mark this response using the official IB rubric. Give band, marks, and targeted improvements.',
  'Proof Sketch': 'Provide a proof sketch and the intuition behind it in IB-appropriate rigor.',
  'CAS Tips': 'Suggest how to approach this with a graphing calculator/CAS and show pitfalls.',
  'Close Analysis': 'Do a close analysis of language and structure, identifying devices and effects.',
  'Paper 1': 'Paper 1: Help me plan a commentary with hook, thesis, paragraph ideas, and key devices.',
  'Paper 2': 'Paper 2: Build a comparative plan with thematic throughline and quotes.',
  Diagrams: 'Explain with the standard IB Economics diagrams and correct axes/labels.',
  Derive: 'Derive the key formula and explain assumptions and where it breaks.',
  Mechanism: 'Show the mechanism with steps, intermediates, and conditions.',
  Calculations: 'Give calculation drills with units and sig figs.',
  'Pathway Map': 'Map the biological pathway/process with checkpoints and regulation.',
  'Vocab Drill': 'Drill vocab with spaced repetition style, topic-based, include sample sentences.',
  Roleplay: 'Roleplay a conversation at this level and correct me kindly.',
  Writing: 'Give me a writing prompt, outline, and a band-graded sample.',
};

const LearnHub: React.FC = () => {
  const { user, profile } = useAuthStore();
  const tier: TierKey = ((profile?.tier || 'free').toLowerCase() as TierKey) || 'free';

  // subjects: strictly user-picked
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  // IB Level (HL/SL)
  const [level, setLevel] = useState<Level>(() => (localStorage.getItem(STORAGE_LEVEL_KEY) as Level) || 'HL');

  // chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // slash palette
  const [showCommands, setShowCommands] = useState(false);
  const [palettePinned, setPalettePinned] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<typeof SLASH_COMMANDS>(SLASH_COMMANDS as any);

  // mode
  const [activeMode, setActiveMode] = useState<string>('');

  // rate limits
  const [dailyCount, setDailyCount] = useState(0);
  const [minuteCount, setMinuteCount] = useState(0);
  const [cooldown, setCooldown] = useState<number | null>(null);
  const minuteWindowRef = useRef<number[]>([]);

  // history paging
  const [historyPage, setHistoryPage] = useState(0);
  const [hasMoreHistory, setHasMoreHistory] = useState(false);
  const [subjectsLoading, setSubjectsLoading] = useState(false);

  // scrolling + composer height anchoring
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const prevComposerHeightRef = useRef(0);

  // composer ref for insertion
  const composerTextRef = useRef<HTMLTextAreaElement>(null);

  /* --------- Load User Subjects ---------- */
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    const loadSubjects = async () => {
      setSubjectsLoading(true);
      setSubjectsError(null);
      try {
        const { data, error } = await supabase.rpc('get_my_subjects');
        if (error) throw error;
        if (cancelled) return;

        if (data && data.length > 0) {
          const mapped: Subject[] = data.map((r: any) => ({
            id: r.subject_id, name: r.name, icon: r.icon, color: r.color,
          }));
          setSubjects(mapped);

          const stored = localStorage.getItem(STORAGE_SUBJECT_KEY);
          const found = stored ? mapped.find((m) => m.id === stored) : undefined;
          setSelectedSubject(found || mapped[0]);
        } else {
          setSubjectsError('You need to finish subject setup before using the AI chat.');
          setSubjects([]);
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error('Error loading subjects', err);
        setSubjectsError(err?.message || 'Failed to load subjects.');
        setSubjects([]);
      } finally {
        if (!cancelled) setSubjectsLoading(false);
      }
    };

    loadSubjects();
    return () => { cancelled = true; };
  }, [user?.id]);

  // Persist selection + level
  useEffect(() => {
    if (selectedSubject?.id) localStorage.setItem(STORAGE_SUBJECT_KEY, selectedSubject.id);
  }, [selectedSubject?.id]);

  useEffect(() => {
    localStorage.setItem(STORAGE_LEVEL_KEY, level);
  }, [level]);

  /* --------- Load history when subject changes ---------- */
  useEffect(() => {
    if (!selectedSubject?.id || !user?.id) return;
    setHistoryPage(0);
    loadChatHistory(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject?.id, user?.id]);

  const loadChatHistory = async (page: number) => {
    if (!user?.id || !selectedSubject?.id) return;
    setLoadingHistory(true);
    try {
      const { data, error } = await supabase
        .from('chat_history')
        .select('messages, updated_at')
        .eq('user_id', user.id)
        .eq('subject', selectedSubject.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      const all = parseMessages(data?.messages ?? []);
      const chunkSize = 80;
      const start = Math.max(0, all.length - (page + 1) * chunkSize);
      const end = all.length;
      const pageSlice = all.slice(start, end);
      setHasMoreHistory(start > 0);
      setMessages(pageSlice);
    } catch (err) {
      console.error('Error loading chat history:', err);
      setMessages([]);
      setHasMoreHistory(false);
    } finally {
      setLoadingHistory(false);
    }
  };

  const prependOlderHistory = async () => {
    if (!user?.id || !selectedSubject?.id) return;
    try {
      const { data } = await supabase
        .from('chat_history')
        .select('messages')
        .eq('user_id', user.id)
        .eq('subject', selectedSubject.id)
        .maybeSingle();

      const all = parseMessages(data?.messages ?? []);
      const nextPage = historyPage + 1;
      const chunkSize = 80;
      const start = Math.max(0, all.length - (nextPage + 1) * chunkSize);
      const end = Math.max(0, all.length - nextPage * chunkSize);
      const slice = all.slice(start, end);
      setMessages((prev) => [...slice, ...prev]);
      setHistoryPage(nextPage);
      setHasMoreHistory(start > 0);
    } catch (err) {
      console.error(err);
    }
  };

  const saveChatHistory = async (updated: ChatMessage[]) => {
    if (!user?.id || !selectedSubject?.id) return;
    try {
      const { error } = await supabase
        .from('chat_history')
        .upsert(
          {
            user_id: user.id,
            subject: selectedSubject.id,
            messages: updated,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,subject' }
        );
      if (error) throw error;
    } catch (err) {
      console.error('Error saving chat history:', err);
    }
  };

  const clearChatForSubject = async () => {
    if (!user?.id || !selectedSubject?.id) return;
    try {
      const { error } = await supabase
        .from('chat_history')
        .upsert({
          user_id: user.id,
          subject: selectedSubject.id,
          messages: [],
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,subject' });

      if (error) throw error;
      setMessages([]);
      toast.success(`Cleared ${selectedSubject.name} chat`);
    } catch (err: any) {
      toast.error('Could not clear chat');
      console.error(err);
    }
  };

  /* --------- Scroll pin + composer height ---------- */
  useEffect(() => {
    if (pinnedToBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messages, pinnedToBottom]);

  useEffect(() => {
    const scroller = messagesScrollRef.current;
    if (!scroller) return;
    const onScroll = () => {
      const dist = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
      setPinnedToBottom(dist < 24);
    };
    onScroll();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const measure = () => {
      const scroller = messagesScrollRef.current;
      const newH = composerRef.current?.offsetHeight ?? 0;
      const prevH = prevComposerHeightRef.current;
      setComposerHeight(newH);
      const delta = newH - prevH;
      if (Math.abs(delta) < 2) { prevComposerHeightRef.current = newH; return; }
      if (scroller) {
        if (!pinnedToBottom) scroller.scrollTop += delta;
        else messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
      }
      prevComposerHeightRef.current = newH;
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (composerRef.current) ro.observe(composerRef.current);
    window.addEventListener('resize', measure);
    return () => { window.removeEventListener('resize', measure); ro.disconnect(); };
  }, [pinnedToBottom]);

  /* --------- Cooldown ---------- */
  useEffect(() => {
    if (cooldown === null) return;
    if (cooldown <= 0) { setCooldown(null); return; }
    const t = setTimeout(() => setCooldown((c) => (c ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /* --------- Slash palette (respects manual pin) ---------- */
  useEffect(() => {
    const v = newMessage;
    const startsSlash = v.trimStart().startsWith('/');
    if (!startsSlash) {
      if (showCommands && !palettePinned) setShowCommands(false);
      setFilteredCommands(SLASH_COMMANDS as any);
      return;
    }
    const token = v.trimStart().split(/\s+/)[0].toLowerCase();
    const list = SLASH_COMMANDS.filter(c => c.key.startsWith(token as SlashKey));
    setFilteredCommands(list.length ? (list as any) : (SLASH_COMMANDS as any));
    if (!showCommands) setShowCommands(true);
  }, [newMessage, showCommands, palettePinned]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCommands(false);
        setPalettePinned(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* --------- Rate limiting (server + client) ---------- */
  async function beforeSendRateChecks(): Promise<boolean> {
    const capBurst = TIER_BURST_CAP_PER_MIN[tier] ?? 6;
    const now = Date.now();
    minuteWindowRef.current = minuteWindowRef.current.filter(t => now - t < 60_000);
    if (minuteWindowRef.current.length >= capBurst) {
      toast('You’re sending too fast—cooling down for 15s.', { icon: '⏱️' });
      setCooldown(15);
      return false;
    }

    if (!selectedSubject?.id) return false;
    const capDaily = TIER_DAILY_QUOTA[tier] ?? 25;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

    const { data, error } = await supabase.rpc('log_usage_and_count', {
      p_subject: selectedSubject.id,
      p_tz: tz,
    });

    if (error) {
      console.error('[log_usage_and_count] error', error);
      toast.error('Usage check failed. Try again in a bit.');
      return false;
    }

    const count = (data ?? 0) as number;
    setDailyCount(count);

    if (count >= capDaily) {
      if (tier === 'free') {
        toast.error('Daily message limit reached. Upgrade for more.');
        return false;
      }
      toast.error('You have reached today’s message limit for your tier.');
      return false;
    }

    minuteWindowRef.current.push(now);
    setMinuteCount(minuteWindowRef.current.length);
    return true;
  }

  /* --------- Image upload (Supabase Storage) ---------- */

  // Free plan: 1 image/day; Pro/Elite: unlimited (front-end)
  const canUploadImageNow = (): { ok: boolean; reason?: string } => {
    const plan = (profile?.tier || 'free').toLowerCase();
    if (plan !== 'free') return { ok: true };
    if (!user?.id) return { ok: false, reason: 'Please log in first.' };
    const key = `lh.img.${user.id}.${todayISO()}`;
    const count = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    if (count >= 1) {
      return { ok: false, reason: 'Free plan includes 1 image upload per day. Upgrade to Pro for more.' };
    }
    return { ok: true };
  };

  const bumpImageUploadCount = () => {
    if (!user?.id) return;
    const key = `lh.img.${user.id}.${todayISO()}`;
    const count = parseInt(localStorage.getItem(key) || '0', 10) || 0;
    localStorage.setItem(key, String(count + 1));
  };

  const insertAtCursor = (snippet: string) => {
    const el = composerTextRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const next = before + snippet + after;
    setNewMessage(next);
    requestAnimationFrame(() => {
      el.focus();
      const newPos = start + snippet.length;
      el.setSelectionRange(newPos, newPos);
    });
  };

  const handleImageUpload = async (file: File) => {
    if (!user?.id) { toast.error('Please log in first.'); return; }

    const check = canUploadImageNow();
    if (!check.ok) {
      toast.error(check.reason || 'Image uploads are limited on your plan.');
      return;
    }

    try {
      const ext = file.name.split('.').pop() || 'png';
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from('chat_uploads').upload(path, file, { upsert: false });
      if (error) throw error;
      const { data: pub } = supabase.storage.from('chat_uploads').getPublicUrl(path);
      const url = pub?.publicUrl;
      if (!url) throw new Error('Could not get public URL');
      const alt = file.name.replace(/\.[^.]+$/, '');
      insertAtCursor(`![${alt}](${url})`);
      bumpImageUploadCount();
      toast.success('Image added to message.');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Upload failed');
    }
  };

  /* --------- Send / Regenerate ---------- */
  const isGreeting = (s: string) =>
    /^(\s*(hi|hello|hey|hola|buenas|salut|qué tal)\s*[!.]?\s*){1,3}$/i.test(s);

  const handleSendMessage = async () => {
    const content = newMessage.trim();
    if (!content || loading || !selectedSubject?.name) return;

    // Redirects for marking / long answers
    const lower = content.toLowerCase();
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    const isMarkingIntent = lower.startsWith('/mark') || /(^|\s)(mark|grade|assess)\b/.test(lower);
    if (isMarkingIntent || wordCount > 400) {
      const dest = (profile?.tier || 'free').toLowerCase() === 'free'
        ? '/pricing'
        : '/essay-marking';
      toast('Marking long answers is available on the paid page.', { icon: '📝' });
      window.location.href = dest;
      return;
    }

    // Instant human-y greeting
    if (isGreeting(content)) {
      const s = selectedSubject.name.toLowerCase();
      const quick =
        /spanish|español/.test(s) ? '¡Hola! ¿En qué puedo ayudarte hoy?' :
        /french|français/.test(s) ? 'Salut ! Je peux t’aider avec quoi aujourd’hui ?' :
        'Hey! What are we tackling today?';

      const userMessage: ChatMessage = { role: 'user', content };
      const assistantMessage: ChatMessage = { role: 'assistant', content: quick };
      const final = [...messages, userMessage, assistantMessage];
      setMessages(final);
      setNewMessage('');
      await saveChatHistory(final);
      return;
    }

    const ok = await beforeSendRateChecks();
    if (!ok) return;

    const userMessage: ChatMessage = { role: 'user', content };
    const updatedMessages = [...messages, userMessage];

    setMessages(updatedMessages);
    setNewMessage('');
    setLoading(true);

    try {
      const response = await aiService.chatWithAI(
        updatedMessages,
        selectedSubject.name,
        (profile?.tier || 'free') as TierKey,
        { mode: activeMode || undefined, level } // pass HL/SL
      );

      const assistantMessage: ChatMessage = { role: 'assistant', content: response };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await saveChatHistory(finalMessages);

      try {
        await supabase.from('xp_events').insert({
          user_id: user!.id,
          source: 'ai_chat',
          amount: 5,
          description: `AI chat (${selectedSubject.id}, ${level})`
        });
      } catch { /* ignore */ }
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateLast = async () => {
    if (!messages.length || loading || !selectedSubject?.name) return;
    const lastUserIndex = [...messages].map((m, i) => ({ ...m, i }))
      .filter(m => m.role === 'user').pop()?.i;
    if (lastUserIndex == null) return;

    const ok = await beforeSendRateChecks();
    if (!ok) return;

    const base = messages.slice(0, lastUserIndex + 1);

    setLoading(true);
    try {
      const response = await aiService.chatWithAI(
        base,
        selectedSubject.name,
        (profile?.tier || 'free') as TierKey,
        { mode: activeMode || undefined, level, regenerate: true }
      );
      const assistantMessage: ChatMessage = { role: 'assistant', content: response };
      const final = [...base, assistantMessage];
      setMessages(final);
      await saveChatHistory(final);

      try {
        await supabase.from('xp_events').insert({
          user_id: user!.id,
          source: 'ai_chat',
          amount: 3,
          description: `Regenerate (${selectedSubject.id}, ${level})`
        });
      } catch { /* ignore */ }
    } catch {
      toast.error('Could not regenerate.');
    } finally {
      setLoading(false);
    }
  };

  /* --------- UI helpers ---------- */
  const subjectModesFor = (s: Subject | null, map: Record<string, string[]>): string[] => {
    if (!s) return map.default;
    return map[s.name] || map[s.id] || map.default;
  };

  const insertModePrompt = (mode: string) => {
    const base = MODE_PROMPTS[mode] || 'Explain like an IB tutor.';
    const withLvl = `[${level}] ${base}`;
    setNewMessage(withLvl + '\n\n');
    setActiveMode(mode);
  };

  const insertRubric = () => {
    if (!selectedSubject) return;
    const subject = selectedSubject.name;
    const rubric = `**${subject} (${level}) Marking Rubric (concise)**
- **Criteria A**: Understanding & Focus
- **Criteria B**: Organization & Development
- **Criteria C**: Language & Accuracy
- **Criteria D**: Evidence/Technique/Method

Provide band, marks, and 2–3 actionable improvements.
`;
    setNewMessage((prev) => rubric + '\n' + prev);
  };

  const onKeyDownComposer = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!cooldown && dailyCount < (TIER_DAILY_QUOTA[tier] ?? 25)) handleSendMessage(); }
  };

  const exportChatJson = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = `${(selectedSubject?.id || 'subject').replace(/\s+/g, '_')}_chat_${todayISO()}.json`;
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  /* --------- Render ---------- */

  const tierCap = TIER_DAILY_QUOTA[tier] ?? 25;
  const minuteCap = TIER_BURST_CAP_PER_MIN[tier] ?? 6;
  const streak = (profile as any)?.streak_days ?? (profile as any)?.streakDays ?? 0;

  // loading subjects
  if (subjects === null || subjectsLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="flex items-center gap-3 text-neutral-800">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span>Loading your subjects…</span>
        </div>
      </div>
    );
  }

  // no subjects
  if ((subjects?.length ?? 0) === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white px-4">
        <div className="max-w-lg w-full text-center">
          <div className="w-14 h-14 rounded-xl bg-neutral-100 text-neutral-800 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold mb-2 text-neutral-900">Finish setup to continue</h2>
          <p className="text-neutral-600 mb-6">{subjectsError || 'You haven’t selected any IB subjects yet.'}</p>
          <a
            href="/subject-setup"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-neutral-900 hover:bg-black"
          >
            Go to subject setup
          </a>
        </div>
      </div>
    );
  }

  const PaywallBanner = () => {
    const nearCap = dailyCount >= Math.max(5, Math.floor(0.8 * tierCap));
    if (!nearCap) return null;
    const overCap = dailyCount >= tierCap;
    return (
      <div className={`px-4 py-2 text-sm border-y ${overCap ? 'bg-neutral-50' : 'bg-white'}`}>
        <div className="max-w-5xl mx-auto flex items-center gap-2">
          <Lock className="w-4 h-4" />
          {overCap ? (
            <span>
              You’ve hit today’s limit on your plan.{' '}
              <a href="/pricing" className="underline underline-offset-4">Upgrade to Pro or Elite</a> for more messages.
            </span>
          ) : (
            <span>
              You’re close to today’s limit ({dailyCount}/{tierCap}).{' '}
              <a href="/pricing" className="underline underline-offset-4">Upgrade</a> for higher limits.
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 flex flex-col bg-white">
      {/* Top bar – monochrome */}
      <div className="h-14 px-4 sm:px-6 lg:px-8 flex items-center justify-between border-b bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSidebar((v) => !v)} className="lg:hidden p-2 rounded-lg border hover:bg-neutral-50" aria-label="Toggle sidebar">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-neutral-900" />
            <h1 className="text-base sm:text-lg font-semibold text-neutral-900">LearnHub — IB AI Tutor</h1>
          </div>
          {selectedSubject && (
            <span className="hidden sm:inline ml-2 text-xs px-2 py-1 rounded-full bg-neutral-900 text-white">
              {selectedSubject.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-800 hidden sm:inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> {tier.toUpperCase()}
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-800 hidden md:inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> {minuteCount}/{minuteCap} /min
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-800 hidden md:inline-flex items-center gap-1">
            <Zap className="w-3 h-3" /> {dailyCount}/{tierCap} today
          </span>
          {cooldown && (
            <span className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-800 flex items-center gap-1" title="Rate limit cooldown">
              <AlertTriangle className="w-3 h-3" /> {cooldown}s
            </span>
          )}
          <button onClick={exportChatJson} className="text-xs px-2 py-1 rounded-md border hover:bg-neutral-50 flex items-center gap-1" title="Export chat as JSON">
            <FileDown className="w-3 h-3" /> Export
          </button>
        </div>
      </div>

      {/* Near-cap / paywall banner */}
      <PaywallBanner />

      {/* Main split */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr]">
        {/* Sidebar – monochrome */}
        <aside className={`${showSidebar ? '' : 'hidden lg:block'} border-r min-h-0 bg-white`}>
          <div className="h-full flex flex-col">
            <div className="p-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-neutral-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4" /> Your IB Subjects
              </h2>
              <a href="/subject-setup" className="text-xs text-neutral-500 hover:text-neutral-800 flex items-center gap-1" title="Manage subjects">
                <Filter className="w-3 h-3" /> Manage
              </a>
            </div>
            <div className="px-4 pb-4 space-y-2 overflow-auto min-h-0" aria-label="Subject list">
              {subjects!.map((s) => (
                <motion.button
                  key={s.id}
                  whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}
                  onClick={() => setSelectedSubject(s)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
                    selectedSubject?.id === s.id ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50 text-neutral-900'
                  }`}
                  aria-pressed={selectedSubject?.id === s.id}
                  title={s.name}
                >
                  <div className="flex items-center">
                    <span className="text-lg mr-3" aria-hidden="true">{s.icon}</span>
                    <span className="font-medium text-sm">{s.name}</span>
                  </div>
                </motion.button>
              ))}
            </div>

            <div className="mt-auto p-4 border-t space-y-3">
              {/* HL / SL toggle */}
              <div className="flex items-center justify-between">
                <div className="text-xs text-neutral-600 flex items-center gap-1">
                  <Info className="w-3 h-3" /> IB Level
                </div>
                <div className="inline-flex rounded-md border p-0.5">
                  {(['HL','SL'] as Level[]).map(l => (
                    <button
                      key={l}
                      onClick={() => setLevel(l)}
                      className={`text-xs px-2 py-1 rounded ${level === l ? 'bg-neutral-900 text-white' : 'text-neutral-800 hover:bg-neutral-50'}`}
                      aria-pressed={level === l}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              {/* Modes */}
              <div>
                <div className="text-xs text-neutral-600 mb-2 flex items-center gap-1">
                  <Info className="w-3 h-3" /> Modes
                </div>
                <div className="px-0.5 pb-2 flex flex-wrap gap-2">
                  {subjectModesFor(selectedSubject, {
                    default: ['Explain', 'Worked Example', 'Practice', 'Exam-Style', 'Marking'],
                    'Math AA': ['Explain', 'Worked Example', 'Practice', 'Exam-Style', 'Marking', 'Proof Sketch', 'CAS Tips'],
                    'Math AI': ['Explain', 'Worked Example', 'Practice', 'Exam-Style', 'Marking', 'CAS Tips'],
                    'English Lang & Lit': ['Explain', 'Close Analysis', 'Practice', 'Paper 1', 'Paper 2', 'Marking'],
                    'Economics': ['Explain', 'Worked Example', 'Practice', 'Diagrams', 'Exam-Style', 'Marking'],
                    'Physics': ['Explain', 'Worked Example', 'Practice', 'Derive', 'Exam-Style', 'Marking'],
                    'Chemistry': ['Explain', 'Mechanism', 'Practice', 'Calculations', 'Exam-Style', 'Marking'],
                    'Biology': ['Explain', 'Pathway Map', 'Practice', 'Exam-Style', 'Marking'],
                    'Spanish Ab Initio': ['Explain', 'Vocab Drill', 'Practice', 'Roleplay', 'Writing', 'Marking'],
                  }).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => insertModePrompt(mode)}
                      className={`text-xs px-2.5 py-1.5 rounded-full border ${
                        activeMode === mode ? 'bg-neutral-100 border-neutral-300 text-neutral-900' : 'hover:bg-neutral-50'
                      }`}
                      title={`Switch to ${mode}`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button onClick={insertRubric} className="text-xs px-2 py-1.5 rounded-md border hover:bg-neutral-50 flex items-center gap-1" title="Insert rubric">
                  <Bookmark className="w-3 h-3" /> Rubric
                </button>
                <button onClick={clearChatForSubject} className="text-xs px-2 py-1.5 rounded-md border hover:bg-neutral-50 flex items-center gap-1" title="Clear this subject's chat">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Chat column */}
        <section className="min-h-0 flex flex-col">
          {/* Subject header strip – monochrome */}
          {selectedSubject && (
            <div className="px-5 py-4 border-b bg-white">
              <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl" aria-hidden="true">{selectedSubject.icon}</span>
                  <div>
                    <h3 className="text-lg font-bold text-neutral-900">{selectedSubject.name} — {level} AI Tutor</h3>
                    <p className="text-neutral-600 text-xs sm:text-sm">
                      Ask anything. Use <code className="px-1 rounded bg-neutral-100">/</code> for commands. Need math? Just type it out as you would normally!
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs text-neutral-800">
                  <span className="px-2 py-1 rounded-full bg-neutral-100 flex items-center gap-1" title="Streak days">
                    <Flame className="w-3 h-3" /> {streak}d
                  </span>
                  <span className="px-2 py-1 rounded-full bg-neutral-100 flex items-center gap-1" title="Total XP">
                    <Trophy className="w-3 h-3" /> {profile?.xp ?? 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          <div
            ref={messagesScrollRef}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 sm:px-5 py-4"
            style={{ paddingBottom: composerHeight }}
          >
            <div className="max-w-5xl mx-auto w-full space-y-4">
              {hasMoreHistory && (
                <div className="flex justify-center mb-2">
                  <button onClick={prependOlderHistory} className="text-xs px-3 py-1.5 rounded-md border hover:bg-neutral-50 flex items-center gap-1 bg-white">
                    <ChevronUp className="w-3 h-3" /> Load older
                  </button>
                </div>
              )}

              {loadingHistory ? (
                <div className="flex justify-center items-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-neutral-800" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-neutral-500 h-32 flex items-center justify-center">
                  <div>
                    <Bot className="w-12 h-12 mx-auto mb-3 text-neutral-200" />
                    <p>Start a conversation with your {selectedSubject?.name} {level} AI tutor.</p>
                    <div className="mt-3 flex items-center justify-center gap-2 text-xs">
                      <span className="text-neutral-400">Pick a mode or just type your question.</span>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((m, i) => <MessageBubble key={i} m={m} i={i} onRegenerate={i === messages.length - 1 ? handleRegenerateLast : undefined} />)
              )}

              {/* typing */}
              <AnimatePresence>
                {loading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-start">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neutral-200 flex items-center justify-center" title="AI typing">
                        <Bot className="w-4 h-4 text-neutral-800" />
                      </div>
                      <div className="bg-white border px-4 py-3 rounded-2xl">
                        <div className="flex space-x-1" aria-live="polite" aria-label="Typing indicator">
                          <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Composer */}
          <div ref={composerRef} className="px-3 sm:px-5 py-4 border-t bg-white">
            {/* Command palette */}
            <AnimatePresence>
              {showCommands && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="mb-3 rounded-lg border bg-white max-w-5xl mx-auto"
                >
                  <div className="p-2 text-xs text-neutral-600 border-b flex items-center gap-2">
                    <Search className="w-3 h-3" /> Slash commands (IB-tailored)
                    <button
                      className="ml-auto text-neutral-500 hover:text-neutral-800"
                      onClick={() => { setShowCommands(false); setPalettePinned(false); }}
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-2 grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {filteredCommands.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => { setNewMessage(`${c.key} `); setPalettePinned(true); setShowCommands(true); }}
                        className="text-left text-sm rounded-md px-3 py-2 border hover:bg-neutral-50 flex items-start gap-2"
                      >
                        <span className="mt-0.5">{c.icon}</span>
                        <span>
                          <span className="font-medium">{c.key}</span>
                          <div className="text-xs text-neutral-600">{c.label} — {c.hint}</div>
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="max-w-5xl mx-auto w-full flex items-end gap-3">
              <div className="flex-1">
                <TextareaAutosize
                  ref={composerTextRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={onKeyDownComposer}
                  placeholder={`Ask your ${selectedSubject?.name} (${level}) question… Use “/” for commands. Type LaTeX directly if needed.`}
                  className="w-full border border-neutral-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-black focus:border-transparent leading-6"
                  minRows={1}
                  maxRows={12}
                  aria-label="Message composer"
                />
                <div className="mt-2 flex items-center gap-2 text-xs text-neutral-600">
                  <button
                    onClick={() => { setPalettePinned(v => !v); setShowCommands(v => !v); }}
                    className="px-2 py-1 rounded-md border hover:bg-neutral-50 flex items-center gap-1"
                  >
                    <Wand2 className="w-3 h-3" /> {palettePinned ? 'Close' : 'Commands'}
                  </button>

                  <button
                    onClick={() => {
                      if (activeMode) {
                        setNewMessage(`[${level}] ` + (MODE_PROMPTS[activeMode] || 'Explain like an IB tutor.') + '\n\n');
                      }
                    }}
                    className="px-2 py-1 rounded-md border hover:bg-neutral-50 flex items-center gap-1"
                    title="Insert current mode prompt"
                  >
                    <SparklesIcon /> {activeMode || 'Mode'}
                  </button>

                  {/* Image upload */}
                  <input
                    id="img-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                      e.currentTarget.value = '';
                    }}
                  />
                  <label
                    htmlFor="img-input"
                    className="px-2 py-1 rounded-md border hover:bg-neutral-50 flex items-center gap-1 cursor-pointer"
                    title="Insert image (Free: 1/day; Pro/Elite: unlimited)"
                  >
                    <ImageIcon className="w-3 h-3" /> Image
                  </label>

                  <span className="ml-auto hidden sm:flex items-center gap-2">
                    Tip: Type LaTeX directly (e.g. \int_0^1 x^2 dx). I’ll understand it.
                  </span>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: (!cooldown && newMessage.trim() && dailyCount < tierCap) ? 1.02 : 1 }}
                whileTap={{ scale: (!cooldown && newMessage.trim() && dailyCount < tierCap) ? 0.98 : 1 }}
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || loading || !!cooldown || dailyCount >= tierCap}
                className={`px-5 py-3 rounded-lg text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  (cooldown || dailyCount >= tierCap) ? 'bg-neutral-400' : 'bg-neutral-900 hover:bg-black'
                }`}
                title={cooldown ? `Cooling down ${cooldown}s` : (dailyCount >= tierCap ? 'Daily limit reached' : 'Send')}
                aria-label="Send message"
              >
                <Send className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

/* ============ Small utils/components ============ */

const SparklesIcon: React.FC = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" className="inline-block align-middle">
    <path d="M12 2l1.9 5.8L20 10l-6.1 2.2L12 18l-1.9-5.8L4 10l6.1-2.2L12 2z" fill="currentColor" />
  </svg>
);

const MessageBubble: React.FC<{ m: ChatMessage; i: number; onRegenerate?: () => void }> = React.memo(({ m, i, onRegenerate }) => {
  const isUser = m.role === 'user';
  return (
    <motion.div initial={false} animate={{ opacity: 1, y: 0 }} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-3xl w-full flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
        <div
          className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${isUser ? 'bg-neutral-900 ml-1' : 'bg-neutral-200 mr-1'}`}
          title={isUser ? 'You' : 'AI Tutor'}
        >
          {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-neutral-800" />}
        </div>
        <div className={`${isUser ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-900 border'} px-4 py-3 rounded-2xl shadow-sm`}>
          {isUser ? (
            <p className="whitespace-pre-wrap text-[0.95rem] leading-6">{m.content}</p>
          ) : (
            <div className="prose prose-sm md:prose-base max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                components={{
                  p: (p) => <p className="my-3 leading-7" {...p} />,
                  strong: (p) => <strong className="font-semibold" {...p} />,
                  em: (p) => <em className="italic" {...p} />,
                  ul: (p) => <ul className="my-3 list-disc pl-5" {...p} />,
                  ol: (p) => <ol className="my-3 list-decimal pl-5" {...p} />,
                  li: (p) => <li className="my-1" {...p} />,
                  blockquote: (p) => <blockquote className="border-l-4 pl-3 italic text-neutral-700 my-3" {...p} />,
                  code({ className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const isInline = !className?.includes('language-');
                    return !isInline && match ? (
                      <div className="relative group my-3">
                        <button
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition text-xs bg-white/90 px-2 py-1 rounded border"
                          onClick={() => copyToClipboard(String(children))}
                          title="Copy code"
                        >
                          Copy
                        </button>
                        <SyntaxHighlighter style={tomorrow} language={match[1]} PreTag="div">
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      </div>
                    ) : (
                      <code className="px-1 py-0.5 rounded bg-neutral-100" {...props}>{children}</code>
                    );
                  },
                  table: (p) => <div className="overflow-x-auto my-3"><table {...p} /></div>,
                }}
              >
                {normalizeMD(m.content)}
              </ReactMarkdown>
            </div>
          )}
          {!isUser && onRegenerate && (
            <div className="flex gap-2 mt-2 opacity-70">
              <button className="text-xs flex items-center gap-1 hover:opacity-100" onClick={() => copyToClipboard(m.content)} title="Copy">
                <Copy className="w-3 h-3" /> Copy
              </button>
              <button className="text-xs flex items-center gap-1 hover:opacity-100" onClick={onRegenerate} title="Regenerate">
                <RotateCcw className="w-3 h-3" /> Regenerate
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

export default LearnHub;
