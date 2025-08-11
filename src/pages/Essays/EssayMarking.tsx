// src/pages/EssayMarking/EssayMarking.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload, FileText, Download, CheckCircle, Clock, X, Trophy, Star,
  Trash2, Plus, Target, Sparkles, Zap, Eye, BarChart3, PenTool,
  Brain, Lightbulb, RefreshCw, Lock, Crown, Info
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthStore } from '../../store/authStore';
import { aiService, EssayFeedback } from '../services/aiService';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

type Status = 'draft' | 'pending' | 'completed' | 'error';

interface EssayRow {
  id: string;
  title: string;
  type: string; // English | TOK | EE | IA | etc.
  subject?: string | null;
  paper_type?: string | null;
  content: string;
  feedback?: any;
  status: Status;
  created_at: string;
  score?: number | null;
}

const englishPaperTypes = [
  { value: 'Paper 1 SL', label: 'Paper 1 SL - Literary Analysis' },
  { value: 'Paper 1 HL', label: 'Paper 1 HL - Literary Analysis' },
  { value: 'Paper 2 SL', label: 'Paper 2 SL - Comparative Essay' },
  { value: 'Paper 2 HL', label: 'Paper 2 HL - Comparative Essay' },
];

const iaSubjects = [
  'Math AA', 'Math AI', 'Chemistry', 'Physics', 'Biology',
  'Economics', 'Business Management', 'Spanish', 'French', 'History', 'Geography', 'Psychology'
];

// where a text-based model answer makes sense
const TEXT_SUBJECTS = new Set([
  'English', 'TOK', 'Economics', 'Business Management', 'History', 'Geography', 'Psychology', 'Spanish', 'French'
]);

const MODEL_MARKS = [4, 10, 15];
const MIN_WORDS = 150;
const MAX_WORDS = 2000;

// --- helpers ---
const digitsIn = (s: string) => (s.match(/\d/g)?.length ?? 0);
const looksMathy = (s: string) => {
  const latex = /\\(frac|sum|int|sqrt|begin|end)|\^\{|\_\{|\\cdot|\\times|\\pi/;
  const sym = /[=≈≠≤≥∑∫√∆π∞±×÷]/;
  const density = digitsIn(s) / Math.max(1, s.length);
  return latex.test(s) || sym.test(s) || density > 0.12;
};

const words = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;

const getScoreColor = (score: number, max: number = 5) => {
  const pct = (score / max) * 100;
  if (pct >= 80) return 'text-[#000] bg-neutral-50 border-neutral-200';
  if (pct >= 65) return 'text-neutral-800 bg-neutral-100 border-neutral-200';
  if (pct >= 50) return 'text-neutral-700 bg-neutral-100 border-neutral-300';
  return 'text-neutral-600 bg-neutral-100 border-neutral-300';
};
const letter = (score: number) => {
  if (score >= 18) return { l: 'A', c: 'text-[#000]' };
  if (score >= 16) return { l: 'B', c: 'text-neutral-800' };
  if (score >= 14) return { l: 'C', c: 'text-neutral-700' };
  if (score >= 12) return { l: 'D', c: 'text-neutral-600' };
  if (score >= 10) return { l: 'E', c: 'text-neutral-600' };
  return { l: 'F', c: 'text-neutral-600' };
};

const EssayMarking: React.FC = () => {
  const { user } = useAuthStore();
  const [profileTier, setProfileTier] = useState<'Free' | 'Pro' | 'Elite'>('Free');
  const [essays, setEssays] = useState<EssayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<EssayRow | null>(null);
  const [xpAnim, setXpAnim] = useState<{ show: boolean, id: string | null }>({ show: false, id: null });
  const [markingAnimation, setMarkingAnimation] = useState<{ show: boolean, stage: number }>({ show: false, stage: 0 });

  // usage meter (Free)
  const [freeInfo, setFreeInfo] = useState<{ first: boolean; left: number | '∞'; reset?: Date }>({ first: false, left: '∞' });

  const [form, setForm] = useState({
    title: '',
    type: 'English',
    subject: '',
    paper_type: '',
    content: '',
    wantModelAnswer: true, // gated
    modelMarks: 10 as 4 | 10 | 15
  });

  // autosave (localStorage)
  useEffect(() => {
    const saved = localStorage.getItem('ib-examiner-draft');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setForm((p) => ({ ...p, ...parsed }));
      } catch {}
    }
  }, []);
  useEffect(() => {
    localStorage.setItem('ib-examiner-draft', JSON.stringify(form));
  }, [form]);

  const isProOrElite = useMemo(() => ['Pro', 'Elite'].includes(profileTier), [profileTier]);

  // determine if model answer is text-eligible
  const isTextEligible = useMemo(() => {
    if (form.type === 'IA') return TEXT_SUBJECTS.has(form.subject);
    return TEXT_SUBJECTS.has(form.type);
  }, [form.type, form.subject]);

  // EE/IA: allowed to mark, but NO feedback shown
  const isNoFeedbackType = useMemo(() => form.type === 'EE' || form.type === 'IA', [form.type]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('tier').eq('id', user.id).single();
      if (data?.tier) setProfileTier((data.tier as any) || 'Free');
      await loadEssays();
      await hydrateFreeInfo();
    })();
  }, [user]);

  const hydrateFreeInfo = async () => {
    if (!user) return;
    if (isProOrElite) return setFreeInfo({ first: false, left: '∞' });
    const total = await supabase.from('essays').select('*', { count: 'exact', head: true }).eq('user_id', user.id);
    const first = (total.count ?? 0) === 0;
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = await supabase
      .from('essays')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString());
    const left = (today.count ?? 0) >= 1 ? 0 : 1;
    setFreeInfo({ first, left, reset: new Date(start.getTime() + 86400000) });
  };

  const loadEssays = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('essays')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setEssays((data || []) as EssayRow[]);
    } catch (e) {
      console.error(e);
      toast.error('Failed to load submissions');
    }
  };

  // ===== rate limit for Free: 1 total free use, then max 1 per day =====
  const checkFreeRateLimit = async () => {
    if (!user) return { allowed: false, reason: 'Not signed in' };
    if (isProOrElite) return { allowed: true };

    // total submissions ever
    const total = await supabase
      .from('essays')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);
    const totalCount = total.count ?? 0;
    if (totalCount === 0) return { allowed: true }; // first-ever free use

    // after first use, allow max 1 per day
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = await supabase
      .from('essays')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', start.toISOString());
    const todayCount = today.count ?? 0;

    if (todayCount >= 1) {
      const nextReset = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      return { allowed: false, reason: 'Daily limit reached', nextReset };
    }
    return { allowed: true };
  };

  // uploads
  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    const isPDF = /\.pdf$/i.test(file.name);
    if (isPDF) {
      toast('PDF text extraction is limited — for best results, paste or upload .txt');
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string) || '';
      setForm(prev => ({ ...prev, content: text, title: prev.title || file.name.replace(/\.[^/.]+$/, '') }));
    };
    reader.readAsText(file);
  };
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/plain': ['.txt'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
  });

  const runStages = async () => {
    for (let i = 0; i < 5; i++) {
      setMarkingAnimation({ show: true, stage: i });
      await new Promise(r => setTimeout(r, 850));
    }
  };

  const awardXP = async (source: string, amount: number, description: string) => {
    if (!user) return;
    try {
      await supabase.from('xp_events').insert({ user_id: user.id, source, amount, description });
    } catch (e) {
      console.error(e);
    }
  };

  // Save Draft (status: draft) — allows users to save everything before marking
  const handleSaveDraft = async () => {
    if (!user) return toast.error('Please sign in');
    if (!form.title.trim() && !form.content.trim()) return toast.error('Nothing to save yet');
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('essays')
        .insert({
          user_id: user.id,
          title: form.title || 'Untitled Draft',
          type: form.type,
          subject: form.subject || null,
          paper_type: form.paper_type || null,
          content: form.content,
          status: 'draft',
        })
        .select()
        .single();
      if (error) throw error;
      toast.success('Draft saved');
      await loadEssays();
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Failed to save draft');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.content.trim()) return toast.error('Please provide essay content');

    const wc = words(form.content);
    if (wc < MIN_WORDS) return toast.error(`Essay must be at least ${MIN_WORDS} words`);
    if (wc > MAX_WORDS) return toast.error(`Essay cannot exceed ${MAX_WORDS} words`);

    // rate limit (Free)
    const rl = await checkFreeRateLimit();
    if (!rl.allowed) {
      const msg = rl.nextReset
        ? `Daily limit reached. Try again after ${rl.nextReset.toLocaleTimeString()} or upgrade for more.`
        : 'Limit reached. Please upgrade for more usage.';
      toast.error(msg);
      return;
    }

    // gentle guard: if they toggled model answer but content looks mathy
    if (form.wantModelAnswer && looksMathy(form.content)) {
      toast('Model Answer is for text responses — maths-style questions are excluded');
    }

    setLoading(true);
    try {
      await runStages();

      // create row (pending)
      const created = await supabase.from('essays').insert({
        user_id: user.id,
        title: form.title || 'Untitled',
        type: form.type,
        subject: form.subject || null,
        paper_type: form.paper_type || null,
        content: form.content,
        status: 'pending',
      }).select().single();
      if (created.error) throw created.error;
      const row = created.data as EssayRow;

      // main marking — scoreOnly for EE/IA
      const raw = await aiService.markEssay(
        form.content,
        form.type,
        form.subject,
        form.paper_type
      );

      // keep this guard right after:
      let fb: Partial<EssayFeedback> = raw || {};
      if (row.type === 'EE' || row.type === 'IA') {
        fb = { overall_score: raw?.overall_score ?? null }; // strip details for EE/IA
      }

      // gated model answer (Pro/Elite + text-eligible + allowed marks + NOT EE/IA)
      let model: any = {};
      const canModel =
        form.wantModelAnswer &&
        isProOrElite &&
        isTextEligible &&
        (row.type !== 'EE' && row.type !== 'IA') &&
        MODEL_MARKS.includes(form.modelMarks) &&
        !looksMathy(form.content);

      if (canModel && (aiService as any).generateModelAnswer) {
        const subjectForModel = row.type === 'IA' ? (row.subject || 'IA') : row.type;
        const mf = await (aiService as any).generateModelAnswer(
          `Write a ${form.modelMarks}-mark examiner-grade model answer for a text-based IB ${subjectForModel} response.
           Use a clear intro, well-structured development, and a decisive conclusion. Provide mark-by-mark points.`,
          subjectForModel,
          'TextResponse',
          form.modelMarks,
          'Evaluate',
          { studentSubmission: form.content }
        );
        model = {
          model_answer: mf?.model_answer,
          model_points: mf?.marking_points,
          model_summary: mf?.summary
        };
      }

      const mergedFeedback = { ...fb, ...model };

      // update row
      const upd = await supabase.from('essays')
        .update({
          feedback: mergedFeedback,
          status: 'completed',
          score: (raw?.overall_score ?? null)
        })
        .eq('id', row.id);
      if (upd.error) throw upd.error;

      // XP logic
      const s = raw?.overall_score || 0;
      let xp = 25;
      if (s >= 18) { xp += 25; setXpAnim({ show: true, id: row.id }); setTimeout(() => setXpAnim({ show: false, id: null }), 3000); }
      else if (s >= 16) xp += 15;
      else if (s >= 14) xp += 10;
      await awardXP('essay', xp, `Essay: ${form.title || 'Untitled'}`);

      toast.success('Marked successfully');
      setShowForm(false);
      setForm({ title: '', type: 'English', subject: '', paper_type: '', content: '', wantModelAnswer: true, modelMarks: 10 });
      setMarkingAnimation({ show: false, stage: 0 });
      await loadEssays();
      await hydrateFreeInfo();
    } catch (err: any) {
      console.error(err);
      setMarkingAnimation({ show: false, stage: 0 });
      toast.error(err.message || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  };

  const exportFeedback = (it: EssayRow) => {
    if (!it.feedback) return;
    const f = it.feedback;
    const isEEorIA = it.type === 'EE' || it.type === 'IA';

    const content = `
IB ESSAY REPORT
================
Title: ${it.title}
Type: ${it.type}${it.subject ? `\nSubject: ${it.subject}` : ''}${it.paper_type ? `\nPaper: ${it.paper_type}` : ''}
Date: ${new Date(it.created_at).toLocaleDateString()}

OVERALL
-------
Score: ${f.overall_score ?? '-'} / 20
Grade: ${f.overall_score != null ? letter(f.overall_score).l : '-'}

${isEEorIA ? '' : `RUBRIC
------
${Object.entries(f.rubric_scores || {}).map(([k, v]: any) => `${k}: ${v}/5`).join('\n')}

STRENGTHS
---------
${f.strengths?.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n') || '-'}

IMPROVEMENTS
------------
${f.improvements?.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n') || '-'}

SUMMARY
-------
${f.summary || '-'}
`}
MODEL ANSWER (if available)
---------------------------
${f.model_answer || '—'}

POINTS
------
${f.model_points?.map((m: string, i: number) => `${i + 1}. ${m}`).join('\n') || '—'}

MODEL SUMMARY
-------------
${f.model_summary || '—'}
`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${it.title.replace(/\s+/g, '_')}_IB_Report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    if (!window.confirm('Delete this entry?')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('essays').delete().eq('id', id);
      if (error) throw error;
      toast.success('Deleted');
      if (selected?.id === id) setSelected(null);
      await loadEssays();
    } catch {
      toast.error('Failed to delete');
    } finally {
      setLoading(false);
    }
  };

  // ===== UI =====
  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* HERO — centered vertically, pure black accents */}
        <div className="min-h-[70vh] md:min-h-[75vh] grid place-items-center text-center">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-neutral-200 bg-white shadow-sm">
              <Sparkles className="w-4 h-4 text-neutral-700" />
              <span className="text-xs font-semibold text-neutral-700 tracking-wide">
                Monochrome • Clean • Examiner-grade
              </span>
            </div>
            <h1 className="mt-5 font-black tracking-tight text-[#000] text-[clamp(2.25rem,6vw,4rem)]">
              IB Essay Examiner
            </h1>
            <p className="mt-3 text-base sm:text-lg text-neutral-600 max-w-2xl mx-auto">
              Rubric-based marking with examiner clarity — and for <span className="font-semibold">Pro</span>/<span className="font-semibold">Elite</span>,
              an exemplar <em>Model Answer</em> (text-based only, 4/10/15).
            </p>

            <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
              <button
                aria-label="Submit new essay"
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl font-semibold text-white bg-[#000] hover:bg-[#111] shadow"
              >
                <Plus className="w-5 h-5" /> Submit New Essay
              </button>
              <div className="inline-flex items-center gap-2 text-xs text-neutral-600">
                <Crown className="w-4 h-4" />
                <span>Your tier: <strong className="capitalize">{profileTier}</strong></span>
                {!isProOrElite && (
                  <span className="pl-2 text-neutral-500">
                    • {freeInfo.first ? 'First run free' : `${freeInfo.left} left today`}{freeInfo.reset ? ` • resets ${freeInfo.reset.toLocaleTimeString()}` : ''}
                  </span>
                )}
              </div>
            </div>

            {/* Feature hints */}
            <div className="mt-6 max-w-3xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2 font-semibold text-[#000] mb-1"><BarChart3 className="w-4 h-4" /> IB-Aligned Marking</div>
                <p className="text-sm text-neutral-600">Clear overall score with criterion mapping. Transparent, examiner-style reasoning.</p>
              </div>
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2 font-semibold text-[#000] mb-1"><Crown className="w-4 h-4" /> Model Answers (Pro/Elite)</div>
                <p className="text-sm text-neutral-600">Text subjects only. Choose 4/10/15 marks. No maths/equation responses.</p>
              </div>
              <div className="rounded-xl border bg-white p-4">
                <div className="flex items-center gap-2 font-semibold text-[#000] mb-1"><FileText className="w-4 h-4" /> Save & Export</div>
                <p className="text-sm text-neutral-600">Autosave drafts, save to library, and export full reports anytime.</p>
              </div>
            </div>
          </motion.div>
        </div>

        {/* GRID */}
        <div className="pb-14 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {essays.map((e) => {
            const high = e.feedback?.overall_score != null && e.feedback.overall_score >= 17;
            return (
              <motion.div
                key={e.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -6, scale: 1.01 }}
                className={`relative rounded-3xl border border-[#eaeaea] p-7 cursor-pointer transition-all bg-white shadow-sm hover:shadow-xl`}
                onClick={() => setSelected(e)}
              >
                {/* XP burst */}
                <AnimatePresence>
                  {xpAnim.show && xpAnim.id === e.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.9, y: 18 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: -10 }}
                      className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-white rounded-3xl"
                    >
                      <Trophy className="w-14 h-14 text-[#000] mb-2" />
                      <div className="px-4 py-1.5 rounded-xl border bg-white text-[#000] font-bold shadow-sm">Bonus XP!</div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Top row */}
                <div className="flex items-center justify-between mb-5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-neutral-100 text-neutral-800 border">
                      {e.type}
                    </span>
                    {e.subject && <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white text-neutral-700 border">{e.subject}</span>}
                    {e.status === 'draft' && <span className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-white text-neutral-700 border">Draft</span>}
                  </div>
                  <div className={`flex items-center px-3 py-1 rounded-full text-[11px] font-bold bg-neutral-100 ${e.status === 'completed' ? 'text-neutral-800' : 'text-neutral-600'}`}>
                    {e.status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                    {e.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                    {e.status.toUpperCase()}
                  </div>
                </div>

                <h3 className="text-lg font-bold text-[#000] mb-1 line-clamp-2">{e.title}</h3>
                <div className="text-xs text-neutral-600 mb-4">
                  {e.paper_type && <div>Paper: {e.paper_type}</div>}
                  <div>Submitted: {new Date(e.created_at).toLocaleDateString()}</div>
                </div>

                {e.feedback && e.status === 'completed' && (
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <div className="text-center flex-1">
                        <div className={`text-3xl font-black ${letter(e.feedback.overall_score ?? 0).c}`}>
                          {letter(e.feedback.overall_score ?? 0).l}
                        </div>
                        <div className="text-lg font-bold text-neutral-700">
                          {e.feedback.overall_score ?? 0}/20
                        </div>
                      </div>
                      {high && <Star className="w-5 h-5 text-[#000]" />}
                    </div>

                    {/* show first 3 rubric rows only if not EE/IA */}
                    {!(e.type === 'EE' || e.type === 'IA') && (
                      <div className="mt-3 space-y-2">
                        {Object.entries(e.feedback.rubric_scores || {}).slice(0, 3).map(([criterion, score]: any) => (
                          <div key={criterion} className="flex items-center justify-between text-xs">
                            <span className="text-neutral-600 truncate mr-2">{String(criterion).replace(/^[A-Z]\.\s*/, '')}</span>
                            <div className={`px-2 py-1 rounded-full font-bold border ${getScoreColor(score as number)}`}>
                              {score}/5
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-neutral-200">
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                                 onClick={(ev)=>{ev.stopPropagation(); setSelected(e);}}
                                 className="flex items-center gap-2 text-[#000] font-semibold">
                    <Eye className="w-4 h-4" /> Open
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                                 onClick={(ev)=>{ev.stopPropagation(); handleDelete(e.id);}}
                                 className="flex items-center text-neutral-700">
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* FORM MODAL */}
      <AnimatePresence>
        {showForm && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 16 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl p-8 border border-neutral-200 max-h-[90vh] overflow-y-auto"
            >
              <button aria-label="Close form" onClick={() => setShowForm(false)} className="absolute top-6 right-6 text-neutral-400 hover:text-[#000]">
                <X className="w-8 h-8" />
              </button>

              <div className="text-center mb-8">
                <h2 className="text-3xl font-black text-[#000] mb-1">Submit Essay</h2>
                <p className="text-neutral-600">Marking is IB-aligned. EE/IA receive a score only. Model Answers are Pro/Elite and text-subject only.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-[#000] mb-2">Title *</label>
                    <input
                      value={form.title}
                      onChange={(e)=>setForm(p=>({...p, title: e.target.value}))}
                      className="w-full border-2 border-neutral-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#000] focus:border-transparent"
                      placeholder="e.g., Paper 1 Commentary on…"
                      required
                    />
                    <div className="mt-1 text-xs text-neutral-500 flex items-center gap-1">
                      <Info className="w-3 h-3" /> Add a clear title so you can find it later in your library.
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-[#000] mb-2">Type *</label>
                    <select
                      value={form.type}
                      onChange={(e)=>setForm(p=>({...p, type: e.target.value }))}
                      className="w-full border-2 border-neutral-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#000]"
                    >
                      <option value="English">English Lang & Lit</option>
                      <option value="TOK">Theory of Knowledge</option>
                      <option value="EE">Extended Essay</option>
                      <option value="IA">Internal Assessment</option>
                    </select>
                    <div className="mt-1 text-xs text-neutral-500 flex items-center gap-1">
                      <Info className="w-3 h-3" /> EE/IA: score only (no criterion feedback).
                    </div>
                  </div>
                </div>

                {form.type === 'English' && (
                  <div>
                    <label className="block text-sm font-bold text-[#000] mb-2">Paper *</label>
                    <select
                      value={form.paper_type}
                      onChange={(e)=>setForm(p=>({...p, paper_type: e.target.value}))}
                      className="w-full border-2 border-neutral-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#000]"
                    >
                      <option value="">Select paper type</option>
                      {englishPaperTypes.map(pt=><option key={pt.value} value={pt.value}>{pt.label}</option>)}
                    </select>
                    <div className="mt-1 text-xs text-neutral-500">Choose the correct paper for accurate rubric mapping.</div>
                  </div>
                )}

                {form.type === 'IA' && (
                  <div>
                    <label className="block text-sm font-bold text-[#000] mb-2">Subject *</label>
                    <select
                      value={form.subject}
                      onChange={(e)=>setForm(p=>({...p, subject: e.target.value}))}
                      className="w-full border-2 border-neutral-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-[#000]"
                    >
                      <option value="">Select subject</option>
                      {iaSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-bold text-[#000] mb-2">
                    Essay Content * <span className="text-xs font-normal text-neutral-500 ml-2">({MIN_WORDS}-{MAX_WORDS} words)</span>
                  </label>

                  <div
                    {...getRootProps()}
                    className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                      isDragActive ? 'border-[#000] bg-neutral-50 scale-[1.01]' : 'border-neutral-300 hover:border-[#000]'
                    }`}
                  >
                    <input {...getInputProps()} />
                    <Upload className="w-10 h-10 text-neutral-700 mx-auto mb-2" />
                    <p className="text-[#000] font-semibold">
                      {isDragActive ? 'Drop your file here' : 'Upload .txt or .pdf'}
                    </p>
                    <p className="text-xs text-neutral-500 mt-1">Tip: paste plain text for the cleanest results.</p>
                  </div>

                  <textarea
                    value={form.content}
                    onChange={(e)=>setForm(p=>({...p, content: e.target.value}))}
                    rows={10}
                    className="w-full mt-4 border-2 border-neutral-200 rounded-xl px-4 py-4 focus:ring-2 focus:ring-[#000] focus:border-transparent"
                    placeholder="Or paste your essay here…"
                  />
                  <div className="flex justify-between items-center mt-2">
                    <div className={`text-sm font-semibold ${words(form.content) < MIN_WORDS || words(form.content) > MAX_WORDS ? 'text-neutral-700' : 'text-[#000]'}`}>
                      📝 {words(form.content)} words
                    </div>
                    <div className="text-xs text-neutral-500">{MIN_WORDS}-{MAX_WORDS} required</div>
                  </div>
                </div>

                {/* Model Answer (GATED: Pro/Elite + text subjects; blocked for EE/IA and mathy content) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between rounded-xl border-2 border-neutral-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center">
                        <Crown className="w-4 h-4 text-[#000]" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#000]">Generate Model Answer</div>
                        <div className="text-xs text-neutral-600">
                          Pro/Elite & text subjects only (English, Econ, BM, History, Geo, Psych, Languages).
                          Choose 4 / 10 / 15 marks. Maths/equation-style questions are excluded.
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!isProOrElite) { toast('Upgrade to enable Model Answer'); return; }
                        if (!isTextEligible) { toast('Model Answer available only for text subjects'); return; }
                        if (isNoFeedbackType) { toast('Not available for EE/IA'); return; }
                        if (looksMathy(form.content)) { toast('Detected math/equations — Model Answer is text-only'); return; }
                        setForm(p => ({ ...p, wantModelAnswer: !p.wantModelAnswer }));
                      }}
                      className={`relative inline-flex h-8 w-14 items-center rounded-full transition ${
                        form.wantModelAnswer && isProOrElite && isTextEligible && !isNoFeedbackType && !looksMathy(form.content) ? 'bg-[#000]' : 'bg-neutral-300'
                      } ${(!isProOrElite || !isTextEligible || isNoFeedbackType) ? 'opacity-60 cursor-not-allowed' : ''}`}
                      title={!isProOrElite ? 'Upgrade to Pro/Elite' : (!isTextEligible ? 'Text subjects only' : (isNoFeedbackType ? 'Not for EE/IA' : 'Toggle'))}
                    >
                      <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition ${form.wantModelAnswer && isProOrElite && isTextEligible && !isNoFeedbackType && !looksMathy(form.content) ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {form.wantModelAnswer && isProOrElite && isTextEligible && !isNoFeedbackType && !looksMathy(form.content) && (
                    <div className="flex items-center justify-between rounded-xl border bg-white p-3">
                      <div className="text-sm font-semibold text-neutral-800">Marks</div>
                      <select
                        value={form.modelMarks}
                        onChange={(e)=>setForm(p=>({...p, modelMarks: Number(e.target.value) as 4|10|15 }))}
                        className="border-2 border-neutral-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-[#000]"
                      >
                        {MODEL_MARKS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                  )}

                  {!isProOrElite && (
                    <div className="flex items-center justify-between rounded-xl bg-white border border-neutral-200 p-3">
                      <div className="text-xs text-neutral-600 flex items-center gap-2">
                        <Lock className="w-4 h-4" /> Model Answer is a Pro/Elite feature.
                      </div>
                      <a href="/pricing" className="text-xs font-semibold text-[#000] underline">Upgrade</a>
                    </div>
                  )}
                </div>

                {/* Actions: Save Draft + Submit */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="w-full text-[#000] py-4 rounded-xl font-bold border-2 border-neutral-200 hover:border-[#000] flex items-center justify-center gap-2"
                  >
                    <SaveIcon /> Save Draft
                  </button>
                  <motion.button
                    whileHover={{ scale: 1.01, y: -1 }}
                    whileTap={{ scale: 0.99 }}
                    type="submit"
                    disabled={loading || words(form.content) < MIN_WORDS}
                    className="w-full text-white py-4 rounded-xl font-bold shadow-lg bg-[#000] hover:bg-[#111] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {loading ? (<><RefreshCw className="w-6 h-6 animate-spin" /> Processing…</>) : (<><Zap className="w-6 h-6" /> Submit for Review <Sparkles className="w-5 h-5" /></>)}
                  </motion.button>
                </div>
                <p className="text-xs text-neutral-500 text-center">
                  Submitting will consume your daily quota if you’re on Free. Drafts don’t count toward the limit.
                </p>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PROGRESS */}
      <AnimatePresence>
        {markingAnimation.show && (
          <motion.div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              className="bg-white rounded-3xl p-10 shadow-2xl border border-neutral-200 max-w-md w-full mx-4"
            >
              <div className="text-center">
                <div className="w-20 h-20 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}>
                    {[
                      <FileText className="w-10 h-10 text-[#000]" />,
                      <Brain className="w-10 h-10 text-[#000]" />,
                      <BarChart3 className="w-10 h-10 text-[#000]" />,
                      <PenTool className="w-10 h-10 text-[#000]" />,
                      <Lightbulb className="w-10 h-10 text-[#000]" />
                    ][markingAnimation.stage]}
                  </motion.div>
                </div>
                <h3 className="text-2xl font-bold text-[#000] mb-2">Examiner at work</h3>
                <p className="text-neutral-600 mb-5">
                  {[
                    'Analyzing structure…',
                    'Evaluating argument…',
                    'Mapping to rubric…',
                    'Composing feedback…',
                    'Finalizing…'
                  ][markingAnimation.stage]}
                </p>
                <div className="w-full bg-neutral-200 rounded-full h-2">
                  <motion.div
                    className="bg-[#000] h-2 rounded-full"
                    initial={{ width: '0%' }}
                    animate={{ width: `${((markingAnimation.stage + 1) / 5) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DETAIL MODAL */}
      <AnimatePresence>
        {selected && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div
              initial={{ scale: 0.96, opacity: 0, y: 24 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.96, opacity: 0, y: 16 }}
              className="relative bg-white rounded-3xl shadow-2xl w-full max-w-6xl p-8 border border-neutral-200 overflow-y-auto max-h-[95vh]"
            >
              <button aria-label="Close details" onClick={() => setSelected(null)} className="absolute top-6 right-6 text-neutral-400 hover:text-[#000]">
                <X className="w-8 h-8" />
              </button>

              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-3xl font-black text-[#000] mb-1">{selected.title}</h2>
                  <div className="flex items-center gap-3 text-neutral-600 text-sm">
                    <span className="px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-800 border">{selected.type}</span>
                    {selected.subject && <span>• {selected.subject}</span>}
                    {selected.paper_type && <span>• {selected.paper_type}</span>}
                  </div>
                </div>
                {selected.feedback && selected.status === 'completed' && (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-neutral-800">
                      {selected.feedback.overall_score ?? 0}/20
                    </div>
                    <div className="text-sm text-neutral-500 mt-1">Overall</div>
                  </div>
                )}
              </div>

              {selected.feedback ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    {/* Rubric only if not EE/IA */}
                    {!(selected.type === 'EE' || selected.type === 'IA') && (
                      <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200">
                        <h3 className="text-xl font-bold text-[#000] mb-4 flex items-center gap-2">
                          <BarChart3 className="w-6 h-6" /> Rubric Assessment
                        </h3>
                        <div className="space-y-4">
                          {Object.entries(selected.feedback.rubric_scores || {}).map(([crit, score]: any) => (
                            <div key={crit} className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-neutral-800">{crit}</span>
                                <div className={`px-3 py-1 rounded-full font-bold text-sm border ${getScoreColor(score as number)}`}>
                                  {score}/5
                                </div>
                              </div>
                              {selected.feedback.justifications?.[crit] && (
                                <p className="text-sm text-neutral-700 bg-white p-3 rounded-lg border">{selected.feedback.justifications[crit]}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Strengths & Improvements (hide for EE/IA) */}
                    {!(selected.type === 'EE' || selected.type === 'IA') && selected.feedback.strengths?.length ? (
                      <div className="bg-white rounded-2xl p-6 border border-neutral-200">
                        <h3 className="text-xl font-bold text-[#000] mb-4 flex items-center gap-2">
                          <Trophy className="w-6 h-6" /> Strengths
                        </h3>
                        <ul className="list-disc ml-6 text-neutral-800">
                          {selected.feedback.strengths.map((s: string, i: number) => <li key={i} className="mb-1">{s}</li>)}
                        </ul>
                      </div>
                    ) : null}

                    {!(selected.type === 'EE' || selected.type === 'IA') && selected.feedback.improvements?.length ? (
                      <div className="bg-white rounded-2xl p-6 border border-neutral-200">
                        <h3 className="text-xl font-bold text-[#000] mb-4 flex items-center gap-2">
                          <Target className="w-6 h-6" /> Areas to Improve
                        </h3>
                        <ul className="list-disc ml-6 text-neutral-800">
                          {selected.feedback.improvements.map((m: string, i: number) => <li key={i} className="mb-1">{m}</li>)}
                        </ul>
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-6">
                    {!(selected.type === 'EE' || selected.type === 'IA') && selected.feedback.summary && (
                      <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200">
                        <h3 className="text-xl font-bold text-[#000] mb-3">Examiner Summary</h3>
                        <p className="text-neutral-800 leading-relaxed">{selected.feedback.summary}</p>
                      </div>
                    )}

                    {/* Model answer (if present). Never for EE/IA because we don't generate it there */}
                    {selected.feedback.model_answer && (
                      <div className="bg-white rounded-2xl p-6 border border-neutral-200">
                        <h3 className="text-xl font-bold text-[#000] mb-3 flex items-center gap-2">
                          <Crown className="w-5 h-5" /> Model Answer
                        </h3>
                        <div className="prose prose-sm max-w-none text-neutral-900">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {selected.feedback.model_answer}
                          </ReactMarkdown>
                        </div>
                        {selected.feedback.model_points?.length ? (
                          <div className="mt-4">
                            <div className="text-sm font-semibold text-neutral-800 mb-1">Marking points</div>
                            <ul className="list-decimal ml-5 text-neutral-800">
                              {selected.feedback.model_points.map((p: string, i: number) => <li key={i} className="mb-1">{p}</li>)}
                            </ul>
                          </div>
                        ) : null}
                        {selected.feedback.model_summary && (
                          <p className="mt-3 text-sm text-neutral-700">{selected.feedback.model_summary}</p>
                        )}
                      </div>
                    )}

                    <div className="bg-neutral-50 rounded-2xl p-6 border border-neutral-200">
                      <h3 className="text-xl font-bold text-[#000] mb-3"><FileText className="inline w-6 h-6 mr-2" /> Essay Content</h3>
                      <div className="max-h-96 overflow-y-auto">
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {selected.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Clock className="w-16 h-16 text-neutral-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-[#000] mb-2">Processing</h3>
                  <p className="text-neutral-600">Your essay is being analyzed.</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-4 mt-8 pt-6 border-t border-neutral-200">
                {selected?.feedback && (
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => exportFeedback(selected)}
                    className="px-6 py-3 rounded-xl font-bold border bg-white hover:bg-neutral-50 text-[#000] inline-flex items-center gap-2"
                  >
                    <Download className="w-5 h-5" /> Export Report
                  </motion.button>
                )}
                <div className="flex items-center gap-3">
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleDelete(selected!.id)}
                    className="px-4 py-3 rounded-xl font-semibold border-2 border-neutral-200 hover:border-[#000] text-neutral-800 inline-flex items-center gap-2"
                  >
                    <Trash2 className="w-5 h-5" /> Delete
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => { setSelected(null); setShowForm(true); }}
                    className="px-6 py-3 rounded-xl font-bold text-white bg-[#000] hover:bg-[#111] inline-flex items-center gap-2"
                  >
                    <Plus className="w-5 h-5" /> Submit Another
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

function SaveIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="inline-block">
      <path d="M5 3h10l4 4v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 3v6h8V3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 13h10v8H7z" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default EssayMarking;
