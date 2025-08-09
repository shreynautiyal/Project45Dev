// src/pages/Learning/LearnHub.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Bot, User, BookOpen, ChevronUp, Flame, Trophy, Zap,
  Sparkles, ShieldCheck, Copy, RotateCcw, Trash2, FileDown, Clock, Loader2,
  Filter, Info, Bookmark, Menu, PenLine, FileText, Hammer, LayoutList, Wand2,
  Search, FunctionSquare, NotebookText, GraduationCap, AlertTriangle, X
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { aiService, ChatMessage } from '../services/aiService';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { tomorrow } from 'react-syntax-highlighter/dist/esm/styles/prism';
import TextareaAutosize from 'react-textarea-autosize';
import 'katex/dist/katex.min.css';

/* ===========================
   Config (NO DEFAULT SUBJECTS)
=========================== */

// Rate limits (client UI + backed by log_usage_and_count RPC)
const TIER_DAILY_QUOTA: Record<string, number> = { free: 30, pro: 400, elite: 2000 };
const TIER_BURST_CAP_PER_MIN: Record<string, number> = { free: 8, pro: 30, elite: 60 };

// Slash commands (IB-friendly)
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

// Modes chips per subject (names should match what you display)
const SUBJECT_MODES: Record<string, string[]> = {
  default: ['Explain', 'Worked Example', 'Practice', 'Exam-Style', 'Marking'],
  'Math AA': ['Explain', 'Worked Example', 'Practice', 'Exam-Style', 'Marking', 'Proof Sketch', 'CAS Tips'],
  'Math AI': ['Explain', 'Worked Example', 'Practice', 'Exam-Style', 'Marking', 'CAS Tips'],
  'English Lang & Lit': ['Explain', 'Close Analysis', 'Practice', 'Paper 1', 'Paper 2', 'Marking'],
  'Economics': ['Explain', 'Worked Example', 'Practice', 'Diagrams', 'Exam-Style', 'Marking'],
  'Physics': ['Explain', 'Worked Example', 'Practice', 'Derive', 'Exam-Style', 'Marking'],
  'Chemistry': ['Explain', 'Mechanism', 'Practice', 'Calculations', 'Exam-Style', 'Marking'],
  'Biology': ['Explain', 'Pathway Map', 'Practice', 'Exam-Style', 'Marking'],
  'Spanish Ab Initio': ['Explain', 'Vocab Drill', 'Practice', 'Roleplay', 'Writing', 'Marking'],
  'Spanish B (SL)': ['Explain', 'Vocab Drill', 'Practice', 'Roleplay', 'Writing', 'Marking'],
  'Spanish B (HL)': ['Explain', 'Vocab Drill', 'Practice', 'Roleplay', 'Writing', 'Marking'],
  'Spanish A: Lang & Lit (SL)': ['Explain', 'Close Analysis', 'Practice', 'Writing', 'Marking'],
  'Spanish A: Lang & Lit (HL)': ['Explain', 'Close Analysis', 'Practice', 'Writing', 'Marking'],
  'French Ab Initio': ['Explain', 'Vocab Drill', 'Practice', 'Roleplay', 'Writing', 'Marking'],
  'French B (SL)': ['Explain', 'Vocab Drill', 'Practice', 'Roleplay', 'Writing', 'Marking'],
  'French B (HL)': ['Explain', 'Vocab Drill', 'Practice', 'Roleplay', 'Writing', 'Marking'],
  'French A: Lang & Lit (SL)': ['Explain', 'Close Analysis', 'Practice', 'Writing', 'Marking'],
  'French A: Lang & Lit (HL)': ['Explain', 'Close Analysis', 'Practice', 'Writing', 'Marking'],
};

// Prefilled composer prompts per mode
const MODE_PROMPTS: Record<string, string> = {
  'Explain': 'Explain this concept clearly like an IB tutor. Include definitions, the “why”, and 1–2 classic traps.',
  'Worked Example': 'Give a fully worked example with step-by-step reasoning and common mistakes.',
  'Practice': 'Give 5 practice questions (easy→hard) with brief answers. Separate by level and include quick feedback.',
  'Exam-Style': 'Generate 3 exam-style questions with marks per step and concise markscheme answers.',
  'Marking': 'Mark this response using the official IB rubric. Give band, marks, and targeted improvements.',
  'Proof Sketch': 'Provide a proof sketch and the intuition behind it in IB-appropriate rigor.',
  'CAS Tips': 'Suggest how to approach this with a graphing calculator/CAS and show pitfalls.',
  'Close Analysis': 'Do a close analysis of language and structure, identifying devices and effects.',
  'Paper 1': 'Paper 1: Help me plan a commentary with hook, thesis, paragraph ideas, and key devices.',
  'Paper 2': 'Paper 2: Build a comparative plan with thematic throughline and quotes.',
  'Diagrams': 'Explain with the standard IB Economics diagrams and correct axes/labels.',
  'Derive': 'Derive the key formula and explain assumptions and where it breaks.',
  'Mechanism': 'Show the mechanism with steps, intermediates, and conditions.',
  'Calculations': 'Give calculation drills with units and sig figs.',
  'Pathway Map': 'Map the biological pathway/process with checkpoints and regulation.',
  'Vocab Drill': 'Drill vocab with spaced repetition style, topic-based, include sample sentences.',
  'Roleplay': 'Roleplay a conversation at this level and correct me kindly.',
  'Writing': 'Give me a writing prompt, outline, and a band-graded sample.',
};

// Types
type Subject = { id: string; name: string; icon: string; color: string; };
type RoomRow = { user_id: string; subject: string; messages: ChatMessage[] | string | null; updated_at?: string | null; };
type TierKey = 'free' | 'pro' | 'elite';

// tiny utils
const todayISO = () => new Date().toISOString().slice(0, 10);
const parseMessages = (raw: RoomRow['messages']): ChatMessage[] => {
  try {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw as ChatMessage[];
    return JSON.parse(raw as string) as ChatMessage[];
  } catch { return []; }
};
const copyToClipboard = async (text: string) => {
  try { await navigator.clipboard.writeText(text); toast.success('Copied!'); }
  catch { toast.error('Copy failed'); }
};

const STORAGE_SUBJECT_KEY = 'lh.selectedSubjectId';

/* ========================
   Component
======================== */

const LearnHub: React.FC = () => {
  const { user, profile } = useAuthStore();
  const tier: TierKey = ((profile?.tier || 'free').toLowerCase() as TierKey) || 'free';

  // subjects: strictly what the user picked — NO defaults
  const [subjects, setSubjects] = useState<Subject[] | null>(null);
  const [subjectsError, setSubjectsError] = useState<string | null>(null);
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);

  // chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  // slash command palette
  const [showCommands, setShowCommands] = useState(false);
  const [filteredCommands, setFilteredCommands] = useState<typeof SLASH_COMMANDS>(SLASH_COMMANDS as any);

  // mode (don’t force Explain; feels more GPT)
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

  const messagesEndRef = useRef<HTMLDivElement>(null);

  /* --------- Load User Subjects (blocking) ---------- */
  useEffect(() => {
  if (!user?.id) return;           // add this
  const loadSubjects = async () => {
    setSubjectsLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_my_subjects');
      if (error) throw error;

      if (data && data.length > 0) {
        const mapped = data.map((r: any) => ({
          id: r.subject_id, name: r.name, icon: r.icon, color: r.color,
        }));
        setSubjects(mapped);
        // restore last selected if available
        const stored = localStorage.getItem(STORAGE_SUBJECT_KEY);
        const found = mapped.find((m: any) => m.id === stored);
        setSelectedSubject(found || mapped[0]);
        return;
      }

      const u = await supabase.auth.getUser();
      const picked = (u.data.user?.user_metadata as any)?.subjects as string[] | undefined;

      if (picked?.length) {
        await supabase.rpc('set_initial_subjects', { p_subject_names: picked });
        const retry = await supabase.rpc('get_my_subjects');
        if (retry.data?.length) {
          const mapped = retry.data.map((r: any) => ({
            id: r.subject_id, name: r.name, icon: r.icon, color: r.color,
          }));
          setSubjects(mapped);
          const stored = localStorage.getItem(STORAGE_SUBJECT_KEY);
          const found = mapped.find((m: any) => m.id === stored);
          setSelectedSubject(found || mapped[0]);
          return;
        }
      }

      setSubjectsError('You need to finish subject setup before using the AI chat.');
      setSubjects([]);
    } catch (err: any) {
      console.error('Error loading subjects', err);
      setSubjectsError(err.message || 'Failed to load subjects.');
      setSubjects([]);
    } finally {
      setSubjectsLoading(false);
    }
  };
  loadSubjects();
}, [user?.id]);   // <— dependency



  // Persist selection
  useEffect(() => {
    if (selectedSubject?.id) {
      localStorage.setItem(STORAGE_SUBJECT_KEY, selectedSubject.id);
    }
  }, [selectedSubject?.id]);

  /* --------- Load history when subject changes ---------- */
  useEffect(() => {
    if (!selectedSubject || !user) return;
    setHistoryPage(0);
    loadChatHistory(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject?.id, user?.id]);

  /* --------- Scroll to bottom ---------- */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  /* --------- Cooldown countdown ---------- */
  useEffect(() => {
    if (cooldown === null) return;
    if (cooldown <= 0) { setCooldown(null); return; }
    const t = setTimeout(() => setCooldown((c) => (c ? c - 1 : null)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  /* --------- Slash menu open/close logic ---------- */
  useEffect(() => {
    const v = newMessage;
    const startsSlash = v.trimStart().startsWith('/');
    if (!startsSlash) {
      if (showCommands) setShowCommands(false);
      setFilteredCommands(SLASH_COMMANDS as any);
      return;
    }
    // Filter commands by partial after slash
    const token = v.trimStart().split(/\s+/)[0].toLowerCase();
    const list = SLASH_COMMANDS.filter(c => c.key.startsWith(token as SlashKey));
    setFilteredCommands(list.length ? list as any : SLASH_COMMANDS as any);
    if (!showCommands) setShowCommands(true);
  }, [newMessage, showCommands]);

  // Close palette on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setShowCommands(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* --------- Data operations ---------- */
  const loadChatHistory = async (page: number) => {
    if (!user || !selectedSubject) return;
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
    } finally {
      setLoadingHistory(false);
    }
  };

  const prependOlderHistory = async () => {
    if (!user || !selectedSubject) return;
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
      const end = Math.max(0, all.length - (nextPage) * chunkSize);
      const slice = all.slice(start, end);
      setMessages((prev) => [...slice, ...prev]);
      setHistoryPage(nextPage);
      setHasMoreHistory(start > 0);
    } catch (err) {
      console.error(err);
    }
  };

  const saveChatHistory = async (updated: ChatMessage[]) => {
    if (!user || !selectedSubject) return;
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
    if (!user || !selectedSubject) return;
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

  /* --------- Server-atomic daily usage ---------- */
  async function beforeSendRateChecks(): Promise<boolean> {
    // burst limiter (client)
    const capBurst = TIER_BURST_CAP_PER_MIN[tier] ?? 8;
    const now = Date.now();
    minuteWindowRef.current = minuteWindowRef.current.filter(t => now - t < 60_000);
    if (minuteWindowRef.current.length >= capBurst) {
      toast('You’re sending too fast—cooling down for 15s.', { icon: '⏱️' });
      setCooldown(15);
      return false;
    }

    if (!selectedSubject) return false;
    const capDaily = TIER_DAILY_QUOTA[tier] ?? 30;
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
    if (count > capDaily) {
      toast.error('Daily message limit reached for your tier.');
      return false;
    }

    // passed: push new timestamp into burst window
    minuteWindowRef.current.push(now);
    setMinuteCount(minuteWindowRef.current.length);
    return true;
  }

  /* --------- Send / Regenerate ---------- */
  const handleSendMessage = async () => {
    const content = newMessage.trim();
    if (!content || loading || !selectedSubject) return;

    // Instant greeting path (feels human + fixes “hola” lecture issue)
    const isGreeting = /^(\s*(hi|hello|hey|hola|buenas|salut|qué tal)\s*[!.]?\s*){1,3}$/i.test(content);
    if (isGreeting) {
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
        selectedSubject.name, // use human name for prompt routing
        (profile?.tier || 'free') as TierKey,
        { mode: activeMode || undefined }
      );

      const assistantMessage: ChatMessage = { role: 'assistant', content: response };
      const finalMessages = [...updatedMessages, assistantMessage];
      setMessages(finalMessages);
      await saveChatHistory(finalMessages);
      // XP optional; keep lightweight
      try { await supabase.from('xp_events').insert({ user_id: user!.id, source: 'ai_chat', amount: 5, description: `AI chat (${selectedSubject.id})` }); } catch {}
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerateLast = async () => {
    if (!messages.length || loading || !selectedSubject) return;
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
        { mode: activeMode || undefined, regenerate: true }
      );
      const assistantMessage: ChatMessage = { role: 'assistant', content: response };
      const final = [...base, assistantMessage];
      setMessages(final);
      await saveChatHistory(final);
      try { await supabase.from('xp_events').insert({ user_id: user!.id, source: 'ai_chat', amount: 3, description: `Regenerate (${selectedSubject.id})` }); } catch {}
    } catch (err: any) {
      toast.error('Could not regenerate.');
    } finally {
      setLoading(false);
    }
  };

  /* --------- Helpers ---------- */
  const insertCommand = (cmdKey: SlashKey) => {
    const slash = SLASH_COMMANDS.find(c => c.key === cmdKey);
    if (!slash) return;
    setNewMessage(`${cmdKey} `);
    setShowCommands(true);
  };
  const insertModePrompt = (mode: string) => {
    const prompt = MODE_PROMPTS[mode] || 'Explain like an IB tutor.';
    setNewMessage(prompt + '\n\n');
    setActiveMode(mode);
  };
  const insertRubric = () => {
    if (!selectedSubject) return;
    const subject = selectedSubject.name;
    const rubric = `**${subject} Marking Rubric (concise)**\n- **Criteria A**: Understanding & Focus\n- **Criteria B**: Organization & Development\n- **Criteria C**: Language & Accuracy\n- **Criteria D**: Evidence/Technique/Method\n\nProvide band, marks, and 2–3 actionable improvements.\n`;
    setNewMessage((prev) => rubric + '\n' + prev);
  };
  const onKeyDownComposer = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (!cooldown) handleSendMessage(); }
  };
  const exportChatJson = () => {
    const blob = new Blob([JSON.stringify(messages, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fileName = `${(selectedSubject?.id || 'subject').replace(/\s+/g, '_')}_chat_${todayISO()}.json`;
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  /* --------- Small components ---------- */
  const SubjectButton: React.FC<{ s: Subject; active: boolean; onSelect: () => void }> = ({ s, active, onSelect }) => (
    <motion.button
      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
      onClick={onSelect}
      className={`w-full text-left px-3 py-2.5 rounded-lg transition-colors ${
        active ? `bg-gradient-to-r ${s.color} text-white` : 'hover:bg-gray-100 text-gray-800'
      }`}
    >
      <div className="flex items-center">
        <span className="text-lg mr-3">{s.icon}</span>
        <span className="font-medium text-sm">{s.name}</span>
      </div>
    </motion.button>
  );

  const MessageBubble: React.FC<{ m: ChatMessage; i: number }> = ({ m, i }) => {
    const isUser = m.role === 'user';
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-3xl w-full flex ${isUser ? 'flex-row-reverse' : 'flex-row'} items-start gap-3`}>
          <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
              isUser ? 'bg-gradient-to-r from-purple-600 to-blue-600 ml-1' : 'bg-gray-200 mr-1'
            }`} title={isUser ? 'You' : 'AI Tutor'}>
            {isUser ? <User className="w-4 h-4 text-white" /> : <Bot className="w-4 h-4 text-gray-700" />}
          </div>
          <div className={`${isUser ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white' : 'bg-white text-gray-900 border'} px-4 py-3 rounded-2xl shadow-sm`}>
            {isUser ? (
              <p className="whitespace-pre-wrap text-[0.95rem] leading-6">{m.content}</p>
            ) : (
              <div className="prose prose-sm md:prose-base max-w-none">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    code({ className, children, ...props }: any) {
                      const match = /language-(\w+)/.exec(className || '');
                      const isInline = !className?.includes('language-');
                      return !isInline && match ? (
                        <div className="relative group">
                          <button
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition text-xs bg-white/80 px-2 py-1 rounded-md border"
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
                        <code className="px-1 py-0.5 rounded bg-gray-100" {...props}>{children}</code>
                      );
                    },
                    table(props) { return <div className="overflow-x-auto"><table {...props} /></div>; },
                    blockquote(props) { return <blockquote className="border-l-4 pl-3 italic text-gray-700" {...props} />; },
                  }}
                >
                  {m.content}
                </ReactMarkdown>
              </div>
            )}
            {!isUser && (
              <div className="flex gap-2 mt-2 opacity-70">
                <button className="text-xs flex items-center gap-1 hover:opacity-100" onClick={() => copyToClipboard(m.content)} title="Copy">
                  <Copy className="w-3 h-3" /> Copy
                </button>
                {i === messages.length - 1 && (
                  <button className="text-xs flex items-center gap-1 hover:opacity-100" onClick={handleRegenerateLast} title="Regenerate">
                    <RotateCcw className="w-3 h-3" /> Regenerate
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    );
  };

  /* --------- Render ---------- */

  const tierCap = TIER_DAILY_QUOTA[tier] ?? 30;
  const minuteCap = TIER_BURST_CAP_PER_MIN[tier] ?? 8;
  const streak = (profile as any)?.streak_days ?? (profile as any)?.streakDays ?? 0;

  // Still loading subjects?
  if (subjects === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white">
        <div className="flex items-center gap-3">
          <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
          <span>Loading your subjects…</span>
        </div>
      </div>
    );
  }

  // No subjects picked → block and instruct
  if ((subjects?.length ?? 0) === 0) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-white px-4">
        <div className="max-w-lg w-full text-center">
          <div className="w-14 h-14 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <h2 className="text-xl font-bold mb-2">Finish setup to continue</h2>
          <p className="text-gray-600 mb-6">{subjectsError || 'You haven’t selected any IB subjects yet.'}</p>
          <a
            href="/subject-setup"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
          >
            Go to subject setup
          </a>
        </div>
      </div>
    );
  }

  const subjectModes = SUBJECT_MODES[selectedSubject?.name || selectedSubject?.id || ''] || SUBJECT_MODES.default;

  return (
    <div className="fixed inset-0 flex flex-col bg-gray-50">
      {/* Top bar */}
      <div className="h-14 px-4 sm:px-6 lg:px-8 flex items-center justify-between border-b bg-white">
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSidebar((v) => !v)} className="lg:hidden p-2 rounded-lg border hover:bg-gray-50">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            <h1 className="text-base sm:text-lg font-semibold">LearnHub — IB AI Tutor</h1>
          </div>
          {selectedSubject && (
            <span className="hidden sm:inline ml-2 text-xs px-2 py-1 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white">
              {selectedSubject.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 hidden sm:inline-flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" /> {tier.toUpperCase()}
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 hidden md:inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> {minuteCount}/{minuteCap} /min
          </span>
          <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 hidden md:inline-flex items-center gap-1">
            <Zap className="w-3 h-3" /> {dailyCount}/{tierCap} today
          </span>
          {cooldown && (
            <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {cooldown}s
            </span>
          )}
          <button onClick={exportChatJson} className="text-xs px-2 py-1 rounded-md border hover:bg-gray-50 flex items-center gap-1" title="Export chat as JSON">
            <FileDown className="w-3 h-3" /> Export
          </button>
        </div>
      </div>

      {/* Main split */}
      <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-[320px_1fr]">
        {/* Sidebar */}
        <aside className={`${showSidebar ? '' : 'hidden lg:block'} border-r min-h-0 bg-white`}>
          <div className="h-full flex flex-col">
            <div className="p-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-purple-600" /> Your IB Subjects
              </h2>
              <a href="/signup" className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Manage
              </a>
            </div>
            <div className="px-4 pb-4 space-y-2 overflow-auto min-h-0">
              {subjects!.map((s) => (
                <SubjectButton key={s.id} s={s} active={selectedSubject?.id === s.id} onSelect={() => setSelectedSubject(s)} />
              ))}
            </div>

            <div className="mt-auto p-4 border-t">
              <div className="text-xs text-gray-600 mb-2 flex items-center gap-1">
                <Info className="w-3 h-3" /> IB Modes
              </div>
              <div className="px-0.5 pb-2 flex flex-wrap gap-2">
                {subjectModes.map((mode) => (
                  <button
                    key={mode}
                    onClick={() => insertModePrompt(mode)}
                    className={`text-xs px-2.5 py-1.5 rounded-full border ${
                      activeMode === mode ? 'bg-purple-50 border-purple-300 text-purple-700' : 'hover:bg-gray-50'
                    }`}
                    title={`Switch to ${mode}`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={insertRubric} className="text-xs px-2 py-1.5 rounded-md border hover:bg-gray-50 flex items-center gap-1" title="Insert rubric">
                  <Bookmark className="w-3 h-3" /> Rubric
                </button>
                <button onClick={clearChatForSubject} className="text-xs px-2 py-1.5 rounded-md border hover:bg-gray-50 flex items-center gap-1" title="Clear this subject's chat">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              </div>
            </div>
          </div>
        </aside>

        {/* Chat column */}
        <section className="min-h-0 flex flex-col">
          {/* header strip (colored) */}
          {selectedSubject && (
            <div className={`px-5 py-4 border-b bg-gradient-to-r ${selectedSubject.color} text-white`}>
              <div className="max-w-5xl mx-auto w-full flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{selectedSubject.icon}</span>
                  <div>
                    <h3 className="text-lg font-bold">{selectedSubject.name} — AI Tutor</h3>
                    <p className="text-white/80 text-xs sm:text-sm">
                      Ask anything. Use <code className="bg-white/20 px-1 rounded">/</code> for commands.
                    </p>
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-2 text-xs">
                  <button
                    onClick={() => setNewMessage('List the top IB-specific misconceptions and common traps for this topic, with fixes.\n\n')}
                    className="bg-white/15 hover:bg-white/25 px-3 py-1 rounded-full"
                  >
                    Common traps
                  </button>
                  <button
                    onClick={() => setNewMessage('Give markscheme-style bullet points for this problem. Concise, point-by-point, with marks in ( ).\n\n')}
                    className="bg-white/15 hover:bg-white/25 px-3 py-1 rounded-full"
                  >
                    Markscheme bullets
                  </button>
                  <span className="bg-white/15 px-2 py-1 rounded-full flex items-center gap-1">
                    <Flame className="w-3 h-3" /> {streak}d
                  </span>
                  <span className="bg-white/15 px-2 py-1 rounded-full flex items-center gap-1">
                    <Trophy className="w-3 h-3" /> {profile?.xp ?? 0}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* messages */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-5 py-4">
            <div className="max-w-5xl mx-auto w-full space-y-4">
              {hasMoreHistory && (
                <div className="flex justify-center mb-2">
                  <button onClick={prependOlderHistory} className="text-xs px-3 py-1.5 rounded-md border hover:bg-gray-50 flex items-center gap-1 bg-white">
                    <ChevronUp className="w-3 h-3" /> Load older
                  </button>
                </div>
              )}

              {loadingHistory ? (
                <div className="flex justify-center items-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-purple-600" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center text-gray-500 h-32 flex items-center justify-center">
                  <div>
                    <Bot className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>Start a conversation with your {selectedSubject?.name} AI tutor.</p>
                    <div className="mt-3 flex items-center justify-center gap-2 text-xs">
                      <button className="px-2 py-1.5 rounded-md border hover:bg-gray-50 bg-white" onClick={() => insertModePrompt('Explain')}>Explain a concept</button>
                      <button className="px-2 py-1.5 rounded-md border hover:bg-gray-50 bg-white" onClick={() => insertModePrompt('Worked Example')}>Worked example</button>
                      <button className="px-2 py-1.5 rounded-md border hover:bg-gray-50 bg-white" onClick={() => insertModePrompt('Exam-Style')}>Exam-style Qs</button>
                    </div>
                  </div>
                </div>
              ) : (
                messages.map((m, i) => <MessageBubble key={i} m={m} i={i} />)
              )}

              {/* typing */}
              <AnimatePresence>
                {loading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-start">
                    <div className="flex items-start space-x-3">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                        <Bot className="w-4 h-4 text-gray-700" />
                      </div>
                      <div className="bg-white border px-4 py-3 rounded-2xl">
                        <div className="flex space-x-1">
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                          <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* composer */}
          <div className="px-3 sm:px-5 py-4 border-t bg-white">
            {/* command palette */}
            <AnimatePresence>
              {showCommands && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="mb-3 rounded-lg border bg-white max-w-5xl mx-auto"
                >
                  <div className="p-2 text-xs text-gray-600 border-b flex items-center gap-2">
                    <Search className="w-3 h-3" /> Slash commands (IB-tailored)
                    <button className="ml-auto text-gray-500 hover:text-gray-700" onClick={() => setShowCommands(false)} title="Close">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-2 grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {filteredCommands.map((c) => (
                      <button
                        key={c.key}
                        onClick={() => setNewMessage(`${c.key} `)}
                        className="text-left text-sm rounded-md px-3 py-2 border hover:bg-gray-50 flex items-start gap-2"
                      >
                        <span className="mt-0.5">{c.icon}</span>
                        <span>
                          <span className="font-medium">{c.key}</span>
                          <div className="text-xs text-gray-600">{c.label} — {c.hint}</div>
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
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={onKeyDownComposer}
                  placeholder={`Ask your ${selectedSubject?.name} question… Use “/” for commands, or pick a mode.`}
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent leading-6"
                  minRows={1}
                  maxRows={12}
                />
                <div className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                  <button onClick={() => setShowCommands((v) => !v)} className="px-2 py-1 rounded-md border hover:bg-gray-50 flex items-center gap-1">
                    <Wand2 className="w-3 h-3" /> Commands
                  </button>
                  <button onClick={() => activeMode && setNewMessage(MODE_PROMPTS[activeMode] + '\n\n')} className="px-2 py-1 rounded-md border hover:bg-gray-50 flex items-center gap-1" title="Insert current mode prompt">
                    <Sparkles className="w-3 h-3" /> {activeMode || 'Mode'}
                  </button>
                  <span className="ml-auto hidden sm:flex items-center gap-2">Enter to send • Shift+Enter newline</span>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: (!cooldown && newMessage.trim()) ? 1.03 : 1 }}
                whileTap={{ scale: (!cooldown && newMessage.trim()) ? 0.97 : 1 }}
                onClick={handleSendMessage}
                disabled={!newMessage.trim() || loading || !!cooldown}
                className={`px-5 py-3 rounded-lg text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed
                  ${cooldown ? 'bg-gray-400' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700'}`}
                title={cooldown ? `Cooling down ${cooldown}s` : 'Send'}
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

export default LearnHub;

