import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Upload, FileText, Download, CheckCircle, Clock, X, Trophy, Star, 
  Highlighter, Trash2, Plus, AlertTriangle, BookOpen, Target,
  TrendingUp, Award, Sparkles, Zap, ArrowUp, ArrowDown, Eye,
  BarChart3, PenTool, Brain, Lightbulb, ChevronRight, RefreshCw
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuthStore } from '../../store/authStore';
import { aiService, EssayFeedback } from '../services/aiService';
import { supabase } from '../../lib/supabase';
import toast from 'react-hot-toast';

interface Essay {
  id: string;
  title: string;
  type: string;
  subject?: string;
  paper_type?: string;
  content: string;
  feedback?: EssayFeedback;
  status: string;
  created_at: string;
}

const essayTypes = [
  { value: 'English', label: 'English Lang & Lit', icon: '📚' },
  { value: 'TOK', label: 'Theory of Knowledge', icon: '🤔' },
  { value: 'EE', label: 'Extended Essay', icon: '📖' },
  { value: 'IA', label: 'Internal Assessment', icon: '🔬' },
];

const englishPaperTypes = [
  { value: 'Paper 1 SL', label: 'Paper 1 SL - Literary Analysis' },
  { value: 'Paper 1 HL', label: 'Paper 1 HL - Literary Analysis' },
  { value: 'Paper 2 SL', label: 'Paper 2 SL - Comparative Essay' },
  { value: 'Paper 2 HL', label: 'Paper 2 HL - Comparative Essay' },
];

const iaSubjects = [
  'Math AA', 'Math AI', 'Chemistry', 'Physics', 'Biology',
  'Economics', 'Business Management', 'Spanish', 'French'
];

const MIN_WORDS = 150;
const MAX_WORDS = 2000;

const EssayMarking: React.FC = () => {
  const { user } = useAuthStore();
  const [essays, setEssays] = useState<Essay[]>([]);
  const [loading, setLoading] = useState(false);
  const [submissionForm, setSubmissionForm] = useState({
    title: '',
    type: 'English',
    subject: '',
    paper_type: '',
    content: '',
  });
  const [showForm, setShowForm] = useState(false);
  const [xpAnim, setXpAnim] = useState<{ show: boolean, essayId: string | null }>({ show: false, essayId: null });
  const [selectedEssay, setSelectedEssay] = useState<Essay | null>(null);
  const [markingAnimation, setMarkingAnimation] = useState<{ show: boolean, stage: number }>({ show: false, stage: 0 });

  useEffect(() => {
    if (user) {
      loadEssays();
    }
  }, [user]);

  const loadEssays = async () => {
    if (!user) return;
    try {
      const { data, error } = await supabase
        .from('essays')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setEssays(data || []);
    } catch (error) {
      console.error('Error loading essays:', error);
      toast.error('Failed to load essays');
    }
  };

  const onDrop = (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        setSubmissionForm(prev => ({
          ...prev,
          content: text,
          title: file.name.replace(/\.[^/.]+$/, '')
        }));
      };
      reader.readAsText(file);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/plain': ['.txt'],
      'application/pdf': ['.pdf'],
    },
    maxFiles: 1,
  });

  const getWordCount = (text: string) => {
    return text.trim().split(/\s+/).filter(Boolean).length;
  };

  const getScoreColor = (score: number, max: number = 5) => {
    const percentage = (score / max) * 100;
    if (percentage >= 80) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (percentage >= 65) return 'text-blue-600 bg-blue-50 border-blue-200';
    if (percentage >= 50) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getGradeLetter = (score: number) => {
    if (score >= 18) return { letter: 'A', color: 'text-emerald-600' };
    if (score >= 16) return { letter: 'B', color: 'text-blue-600' };
    if (score >= 14) return { letter: 'C', color: 'text-indigo-600' };
    if (score >= 12) return { letter: 'D', color: 'text-amber-600' };
    if (score >= 10) return { letter: 'E', color: 'text-orange-600' };
    return { letter: 'F', color: 'text-red-600' };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const wordCount = getWordCount(submissionForm.content);

    if (!submissionForm.content.trim()) {
      toast.error('Please provide essay content');
      return;
    }
    if (wordCount < MIN_WORDS) {
      toast.error(`Essay must be at least ${MIN_WORDS} words`);
      return;
    }
    if (wordCount > MAX_WORDS) {
      toast.error(`Essay cannot exceed ${MAX_WORDS} words`);
      return;
    }

    setLoading(true);
    setMarkingAnimation({ show: true, stage: 0 });

    try {
      // Animate marking process
      const stages = [
        { text: 'Analyzing essay structure...', icon: <BookOpen className="w-6 h-6" /> },
        { text: 'Evaluating arguments...', icon: <Brain className="w-6 h-6" /> },
        { text: 'Checking language quality...', icon: <PenTool className="w-6 h-6" /> },
        { text: 'Applying IB rubric...', icon: <BarChart3 className="w-6 h-6" /> },
        { text: 'Generating feedback...', icon: <Lightbulb className="w-6 h-6" /> }
      ];

      for (let i = 0; i < stages.length; i++) {
        setMarkingAnimation({ show: true, stage: i });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Save essay to database
      const { data: essay, error } = await supabase
        .from('essays')
        .insert({
          user_id: user!.id,
          title: submissionForm.title,
          type: submissionForm.type,
          subject: submissionForm.subject || null,
          paper_type: submissionForm.paper_type || null,
          content: submissionForm.content,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      // Get AI feedback
      const feedback = await aiService.markEssay(
        submissionForm.content,
        submissionForm.type,
        submissionForm.subject,
        submissionForm.paper_type
      );

      // Update essay with feedback
      const { error: updateError } = await supabase
        .from('essays')
        .update({
          feedback,
          status: 'completed',
         score: feedback.overall_score    // ← write the numeric total!
        })
        .eq('id', essay.id);

      if (updateError) throw updateError;

      // Award XP based on performance
      let xpAmount = 25; // Base XP
      const score = feedback?.overall_score || 0;
      
      if (score >= 18) {
        xpAmount += 25; // Excellence bonus
        setXpAnim({ show: true, essayId: essay.id });
        setTimeout(() => setXpAnim({ show: false, essayId: null }), 4000);
      } else if (score >= 16) {
        xpAmount += 15; // Good performance bonus
      } else if (score >= 14) {
        xpAmount += 10; // Solid effort bonus
      }
      
      await awardXP('essay', xpAmount, `Essay submission: ${submissionForm.title}`);

      setMarkingAnimation({ show: false, stage: 0 });
      toast.success('🎉 Essay marked successfully!', { duration: 4000 });
      setShowForm(false);
      setSubmissionForm({
        title: '',
        type: 'English',
        subject: '',
        paper_type: '',
        content: '',
      });
      loadEssays();
    } catch (error: any) {
      console.error('Error submitting essay:', error);
      setMarkingAnimation({ show: false, stage: 0 });
      toast.error(error.message || 'Failed to submit essay');
    } finally {
      setLoading(false);
    }
  };

  const awardXP = async (source: string, amount: number, description: string) => {
    if (!user) return;
    try {
      await supabase.from('xp_events').insert({
        user_id: user.id,
        source,
        amount,
        description
      });
    } catch (error) {
      console.error('Error awarding XP:', error);
    }
  };

  const exportFeedback = (essay: Essay) => {
    if (!essay.feedback) return;
    const content = `
🎓 IB ESSAY FEEDBACK REPORT
=============================
Essay: ${essay.title}
Type: ${essay.type}
${essay.subject ? `Subject: ${essay.subject}` : ''}
${essay.paper_type ? `Paper Type: ${essay.paper_type}` : ''}
Date: ${new Date(essay.created_at).toLocaleDateString()}

📊 OVERALL PERFORMANCE
======================
Overall Score: ${essay.feedback.overall_score}/20
Grade: ${getGradeLetter(essay.feedback.overall_score || 0).letter}

📋 RUBRIC BREAKDOWN
===================
${Object.entries(essay.feedback.rubric_scores || {})
      .map(([criterion, score]) => `${criterion}: ${score}/5`)
      .join('\n')}

✅ STRENGTHS
============
${essay.feedback.strengths?.map((str, i) => `${i + 1}. ${str}`).join('\n') || 'None identified'}

🎯 AREAS FOR IMPROVEMENT
========================
${essay.feedback.improvements?.map((imp, i) => `${i + 1}. ${imp}`).join('\n') || 'None identified'}

📝 DETAILED SUMMARY
===================
${essay.feedback.summary || 'No summary available'}

🔍 CRITERION JUSTIFICATIONS
============================
${Object.entries(essay.feedback.justifications || {})
      .map(([criterion, justification]) => `${criterion}:\n${justification}\n`)
      .join('\n')}
`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${essay.title}_IB_Feedback_Report.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDeleteEssay = async (essayId: string) => {
    if (!user) return;
    if (!window.confirm('⚠️ Are you sure you want to delete this essay? This action cannot be undone.')) return;

    try {
      setLoading(true);
      const { error } = await supabase.from('essays').delete().eq('id', essayId);
      if (error) throw error;
      toast.success('Essay deleted successfully');
      if (selectedEssay?.id === essayId) setSelectedEssay(null);
      loadEssays();
    } catch (error) {
      toast.error('Failed to delete essay');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Header Section */}
        <div className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <h1 className="text-5xl font-black bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 bg-clip-text text-transparent mb-4">
              IB Essay Examiner
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto leading-relaxed">
              Get <span className="font-bold text-indigo-600">official IB rubric-based feedback</span> with detailed analysis, 
              actionable improvement strategies, and professional examiner insights
            </p>
          </motion.div>
          
          {essays.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.05, y: -2 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowForm(true)}
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-2xl font-bold shadow-lg hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center mx-auto gap-3"
            >
              <Plus className="w-6 h-6" />
              Submit New Essay
              <Sparkles className="w-5 h-5" />
            </motion.button>
          )}
        </div>

        {/* Empty State */}
        {essays.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <div className="bg-transparent rounded-3xl p-12 shadow-xl border border-indigo-100 max-w-2xl">
              <div className="text-center">
                <div className="w-24 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <FileText className="w-12 h-12 text-indigo-600" />
                </div>
                <h3 className="text-3xl font-bold text-gray-900 mb-4">Ready to Excel?</h3>
                <p className="text-gray-600 mb-8 text-lg">
                  Submit your first essay and get detailed feedback using official IB assessment rubrics. 
                  Our AI examiner provides the same quality feedback as experienced IB markers.
                </p>
                <motion.button
                  whileHover={{ scale: 1.05, y: -2 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowForm(true)}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-10 py-4 rounded-2xl font-bold shadow-lg hover:from-indigo-700 hover:to-purple-700 transition-all flex items-center mx-auto gap-3"
                >
                  <Upload className="w-6 h-6" />
                  Submit Your First Essay
                  <ChevronRight className="w-5 h-5" />
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}

        {/* Essays Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-8">
          {essays.map((essay) => {
            const isHighMark = essay.feedback && essay.feedback.overall_score >= 17;
            const grade = getGradeLetter(essay.feedback?.overall_score || 0);
            const essayType = essayTypes.find(t => t.value === essay.type);
            
            return (
              <motion.div
                key={essay.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className={`relative bg-transparent-3xl shadow-xl border-2 p-8 cursor-pointer transition-all duration-300 ${
                  isHighMark 
                    ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-blue-50' 
                    : 'border-indigo-100 hover:border-indigo-200 hover:shadow-2xl'
                }`}
                onClick={() => setSelectedEssay(essay)}
              >
                {/* XP Animation */}
                <AnimatePresence>
                  {xpAnim.show && xpAnim.essayId === essay.id && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.8, y: -20 }}
                      className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-white/95 backdrop-blur rounded-3xl"
                    >
                      <Trophy className="w-20 h-20 text-yellow-500 mb-4 animate-bounce" />
                      <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-6 py-3 rounded-2xl shadow-lg">
                        <div className="text-center">
                          <div className="text-2xl font-black">🌟 EXCELLENT! 🌟</div>
                          <div className="text-lg font-bold">+50 Bonus XP Earned!</div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Essay Type Badge */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{essayType?.icon}</span>
                    <span className="text-sm font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                      {essay.type}
                    </span>
                  </div>
                  <div className={`flex items-center px-3 py-1 rounded-full text-xs font-bold ${
                    essay.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : essay.status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                  }`}>
                    {essay.status === 'completed' && <CheckCircle className="w-3 h-3 mr-1" />}
                    {essay.status === 'pending' && <Clock className="w-3 h-3 mr-1" />}
                    {essay.status.toUpperCase()}
                  </div>
                </div>

                {/* Essay Title */}
                <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-2">
                  {essay.title}
                </h3>
                
                {/* Essay Details */}
                <div className="text-sm text-gray-600 mb-6">
                  {essay.subject && <div>Subject: {essay.subject}</div>}
                  {essay.paper_type && <div>Paper: {essay.paper_type}</div>}
                  <div>Submitted: {new Date(essay.created_at).toLocaleDateString()}</div>
                </div>

                {/* Score Display */}
                {essay.feedback && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="text-center flex-1">
                        <div className={`text-4xl font-black ${grade.color} mb-1`}>
                          {grade.letter}
                        </div>
                        <div className="text-2xl font-bold text-gray-700">
                          {essay.feedback.overall_score}/20
                        </div>
                      </div>
                      {isHighMark && (
                        <div className="flex items-center gap-1">
                          <Star className="w-6 h-6 text-yellow-400 animate-pulse" />
                          <Trophy className="w-5 h-5 text-yellow-500" />
                        </div>
                      )}
                    </div>
                    
                    {/* Rubric Scores */}
                    <div className="space-y-2">
                      {Object.entries(essay.feedback.rubric_scores || {}).slice(0, 3).map(([criterion, score]) => (
                        <div key={criterion} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600 truncate flex-1 mr-2">
                            {criterion.replace(/^[A-Z]\.\s*/, '')}
                          </span>
                          <div className={`px-2 py-1 rounded-full font-bold ${getScoreColor(score)}`}>
                            {score}/5
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedEssay(essay);
                    }}
                    className="flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-semibold"
                  >
                    <Eye className="w-4 h-4" />
                    View Details
                  </motion.button>
                  
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="flex items-center text-red-500 hover:text-red-700"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteEssay(essay.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Submission Form Modal */}
        <AnimatePresence>
          {showForm && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative bg-transparent-3xl shadow-2xl w-full max-w-3xl p-8 border border-indigo-200 max-h-[90vh] overflow-y-auto"
              >
                <button
                  onClick={() => setShowForm(false)}
                  className="absolute top-6 right-6 text-gray-400 hover:text-indigo-600 transition-colors"
                >
                  <X className="w-8 h-8" />
                </button>
                
                <div className="text-center mb-8">
                  <h2 className="text-3xl font-black text-indigo-700 mb-2">Submit Essay for Professional Review</h2>
                  <p className="text-gray-600">Get detailed feedback using official IB assessment rubrics</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-3">
                        Essay Title *
                      </label>
                      <input
                        type="text"
                        value={submissionForm.title}
                        onChange={(e) => setSubmissionForm(prev => ({ ...prev, title: e.target.value }))}
                        className="w-full border-2 border-indigo-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-400 focus:border-transparent shadow-sm font-medium"
                        placeholder="Enter essay title"
                        required
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-3">
                        Essay Type *
                      </label>
                      <select
                        value={submissionForm.type}
                        onChange={(e) => setSubmissionForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full border-2 border-indigo-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-400 focus:border-transparent font-medium"
                      >
                        {essayTypes.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.icon} {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {submissionForm.type === 'English' && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-3">
                        Paper Type *
                      </label>
                      <select
                        value={submissionForm.paper_type}
                        onChange={(e) => setSubmissionForm(prev => ({ ...prev, paper_type: e.target.value }))}
                        className="w-full border-2 border-indigo-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-400 focus:border-transparent font-medium"
                      >
                        <option value="">Select paper type</option>
                        {englishPaperTypes.map(type => (
                          <option key={type.value} value={type.value}>
                            {type.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {submissionForm.type === 'IA' && (
                    <div>
                      <label className="block text-sm font-bold text-gray-700 mb-3">
                        Subject *
                      </label>
                      <select
                        value={submissionForm.subject}
                        onChange={(e) => setSubmissionForm(prev => ({ ...prev, subject: e.target.value }))}
                        className="w-full border-2 border-indigo-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-400 focus:border-transparent font-medium"
                      >
                        <option value="">Select subject</option>
                        {iaSubjects.map(subject => (
                          <option key={subject} value={subject}>
                            {subject}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-3">
                      Essay Content * 
                      <span className="text-xs font-normal text-gray-500 ml-2">
                        ({MIN_WORDS}-{MAX_WORDS} words)
                      </span>
                    </label>
                    
                    <div
                      {...getRootProps()}
                      className={`border-3 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                        isDragActive
                          ? 'border-indigo-400 bg-indigo-50 scale-105'
                          : 'border-indigo-300 hover:border-indigo-400 hover:bg-indigo-25'
                      }`}
                    >
                      <input {...getInputProps()} />
                      <Upload className="w-12 h-12 text-indigo-400 mx-auto mb-4" />
                      <p className="text-gray-700 font-semibold text-lg mb-2">
                        {isDragActive
                          ? '📄 Drop your essay file here!'
                          : '📁 Upload Essay File'}
                      </p>
                      <p className="text-sm text-gray-500">
                        Drag & drop or click to select • Supports .txt and .pdf files
                      </p>
                    </div>
                    
                    <textarea
                      value={submissionForm.content}
                      onChange={(e) => setSubmissionForm(prev => ({ ...prev, content: e.target.value }))}
                      className="w-full mt-4 border-2 border-indigo-200 rounded-xl px-4 py-4 focus:ring-2 focus:ring-indigo-400 focus:border-transparent font-medium resize-none"
                      rows={10}
                      placeholder="Or paste your essay content here..."
                    />
                    <div className="flex justify-between items-center mt-2">
                      <div className={`text-sm font-semibold ${
                        getWordCount(submissionForm.content) < MIN_WORDS 
                          ? 'text-red-500' 
                          : getWordCount(submissionForm.content) > MAX_WORDS 
                            ? 'text-red-500' 
                            : 'text-emerald-600'
                      }`}>
                        📝 {getWordCount(submissionForm.content)} words
                      </div>
                      <div className="text-xs text-gray-500">
                        {MIN_WORDS}-{MAX_WORDS} words required
                      </div>
                    </div>
                  </div>

                  <motion.button
                    whileHover={{ scale: 1.02, y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    type="submit"
                    disabled={loading || getWordCount(submissionForm.content) < MIN_WORDS}
                    className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 rounded-xl font-bold shadow-lg hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 text-lg"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-6 h-6 animate-spin" />
                        Processing Essay...
                      </>
                    ) : (
                      <>
                        <Zap className="w-6 h-6" />
                        Submit for Professional Review
                        <Sparkles className="w-5 h-5" />
                      </>
                    )}
                  </motion.button>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Marking Animation Overlay */}
        <AnimatePresence>
          {markingAnimation.show && (
            <motion.div
              className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 backdrop-blur"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-white rounded-3xl p-12 shadow-2xl border border-indigo-200 max-w-md w-full mx-4"
              >
                <div className="text-center">
                  <div className="w-20 h-20 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    >
                      {[
                        <BookOpen className="w-10 h-10 text-indigo-600" />,
                        <Brain className="w-10 h-10 text-purple-600" />,
                        <PenTool className="w-10 h-10 text-blue-600" />,
                        <BarChart3 className="w-10 h-10 text-indigo-600" />,
                        <Lightbulb className="w-10 h-10 text-yellow-600" />
                      ][markingAnimation.stage]}
                    </motion.div>
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-3">IB Examiner at Work</h3>
                  <p className="text-lg text-gray-600 mb-6">
                    {[
                      'Analyzing essay structure...',
                      'Evaluating arguments & evidence...',
                      'Assessing language quality...',
                      'Applying IB rubric criteria...',
                      'Generating detailed feedback...'
                    ][markingAnimation.stage]}
                  </p>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <motion.div
                      className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full"
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

        {/* Detailed Feedback Modal */}
        <AnimatePresence>
          {selectedEssay && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 30 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                className="relative bg-white rounded-3xl shadow-2xl w-full max-w-6xl p-8 border border-indigo-200 overflow-y-auto max-h-[95vh]"
              >
                <button
                  onClick={() => setSelectedEssay(null)}
                  className="absolute top-6 right-6 text-gray-400 hover:text-indigo-600 transition-colors z-10"
                >
                  <X className="w-8 h-8" />
                </button>

                {/* Header Section */}
                <div className="mb-8">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h2 className="text-3xl font-black text-indigo-700 mb-2">{selectedEssay.title}</h2>
                      <div className="flex items-center gap-4 text-gray-600">
                        <span className="flex items-center gap-2">
                          <span className="text-xl">{essayTypes.find(t => t.value === selectedEssay.type)?.icon}</span>
                          {selectedEssay.type}
                        </span>
                        {selectedEssay.subject && <span>• {selectedEssay.subject}</span>}
                        {selectedEssay.paper_type && <span>• {selectedEssay.paper_type}</span>}
                      </div>
                    </div>
                    
                    {selectedEssay.feedback && (
                      <div className="text-center">
                        <div className={`text-6xl font-black ${getGradeLetter(selectedEssay.feedback.overall_score).color} mb-2`}>
                          {getGradeLetter(selectedEssay.feedback.overall_score).letter}
                        </div>
                        <div className="text-2xl font-bold text-gray-700">
                          {selectedEssay.feedback.overall_score}/20
                        </div>
                        <div className="text-sm text-gray-500 mt-1">Overall Score</div>
                      </div>
                    )}
                  </div>
                </div>

                {selectedEssay.feedback ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Left Column - Scores & Analysis */}
                    <div className="space-y-6">
                      {/* Rubric Breakdown */}
                      <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-100">
                        <h3 className="text-xl font-bold text-indigo-700 mb-4 flex items-center gap-2">
                          <BarChart3 className="w-6 h-6" />
                          Rubric Assessment
                        </h3>
                        <div className="space-y-4">
                          {Object.entries(selectedEssay.feedback.rubric_scores || {}).map(([criterion, score]) => (
                            <div key={criterion} className="space-y-2">
                              <div className="flex justify-between items-center">
                                <span className="font-semibold text-gray-700">{criterion}</span>
                                <div className={`px-3 py-1 rounded-full font-bold text-sm border ${getScoreColor(score)}`}>
                                  {score}/5
                                </div>
                              </div>
                              {selectedEssay.feedback.justifications?.[criterion] && (
                                <p className="text-sm text-gray-600 bg-white p-3 rounded-lg border">
                                  {selectedEssay.feedback.justifications[criterion]}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Strengths */}
                      {selectedEssay.feedback.strengths && selectedEssay.feedback.strengths.length > 0 && (
                        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl p-6 border border-emerald-100">
                          <h3 className="text-xl font-bold text-emerald-700 mb-4 flex items-center gap-2">
                            <Trophy className="w-6 h-6" />
                            What You Did Well
                          </h3>
                          <div className="space-y-3">
                            {selectedEssay.feedback.strengths.map((strength, i) => (
                              <div key={i} className="flex items-start gap-3">
                                <div className="w-6 h-6 bg-emerald-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-emerald-700 font-bold text-sm">{i + 1}</span>
                                </div>
                                <p className="text-emerald-800 font-medium">{strength}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Areas for Improvement */}
                      {selectedEssay.feedback.improvements && selectedEssay.feedback.improvements.length > 0 && (
                        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 border border-amber-100">
                          <h3 className="text-xl font-bold text-amber-700 mb-4 flex items-center gap-2">
                            <Target className="w-6 h-6" />
                            Essential Improvements
                          </h3>
                          <div className="space-y-4">
                            {selectedEssay.feedback.improvements.map((improvement, i) => (
                              <div key={i} className="flex items-start gap-3">
                                <div className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-amber-700 font-bold text-sm">{i + 1}</span>
                                </div>
                                <p className="text-amber-800 font-medium">{improvement}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right Column - Summary & Content */}
                    <div className="space-y-6">
                      {/* Professional Summary */}
                      {selectedEssay.feedback.summary && (
                        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                          <h3 className="text-xl font-bold text-blue-700 mb-4 flex items-center gap-2">
                            <Eye className="w-6 h-6" />
                            Examiner Summary
                          </h3>
                          <p className="text-blue-800 leading-relaxed font-medium">
                            {selectedEssay.feedback.summary}
                          </p>
                        </div>
                      )}

                      {/* Essay Content Preview */}
                      <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                        <h3 className="text-xl font-bold text-gray-700 mb-4 flex items-center gap-2">
                          <FileText className="w-6 h-6" />
                          Essay Content
                        </h3>
                        <div className="max-h-96 overflow-y-auto">
                          <div className="prose prose-sm max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {selectedEssay.content}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Clock className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                    <h3 className="text-2xl font-bold text-gray-700 mb-2">Essay Being Processed</h3>
                    <p className="text-gray-600">Your essay is currently being analyzed. Please check back soon.</p>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center justify-between gap-4 mt-8 pt-6 border-t border-gray-200">
                  {selectedEssay.feedback && (
                    <motion.button
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => exportFeedback(selectedEssay)}
                      className="bg-gradient-to-r from-indigo-100 to-purple-100 text-indigo-700 px-6 py-3 rounded-xl hover:from-indigo-200 hover:to-purple-200 transition-all flex items-center gap-3 font-bold shadow-sm"
                    >
                      <Download className="w-5 h-5" />
                      Export Full Report
                    </motion.button>
                  )}
                  
                  <div className="flex items-center gap-3">
                    <motion.button
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleDeleteEssay(selectedEssay.id)}
                      className="flex items-center text-red-500 hover:text-red-700 px-4 py-3 rounded-xl font-semibold border-2 border-red-100 hover:border-red-200 transition-all gap-2"
                    >
                      <Trash2 className="w-5 h-5" />
                      Delete Essay
                    </motion.button>
                    
                    <motion.button
                      whileHover={{ scale: 1.05, y: -1 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setSelectedEssay(null);
                        setShowForm(true);
                      }}
                      className="flex items-center bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:from-indigo-700 hover:to-purple-700 transition-all gap-3"
                    >
                      <Plus className="w-5 h-5" />
                      Submit Another Essay
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default EssayMarking;