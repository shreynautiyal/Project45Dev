// src/pages/Flashcards/Flashcards.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  FolderPlus,
  Brain,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Play,
  Eye,
  EyeOff,
  Trash2,
  Clock,
  Pause,
  Square,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../components/ui/dialog';
import toast from 'react-hot-toast';
import { aiService } from '../services/aiService';

interface Folder {
  id: string;
  user_id: string;
  name: string;
  subject: string;
  description: string;
  color: string;
  created_at: string;
}

interface Flashcard {
  id: string;
  folder_id: string;
  question: string;
  answer: string;
  difficulty: number;
  review_count: number;
  correct_count: number;
  last_reviewed: string | null;
  next_review: string;
}

interface AIFlashcard {
  question: string;
  answer: string;
}

export const Flashcards: React.FC = () => {
  const { user } = useAuthStore();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<Folder | null>(null);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showAnswer, setShowAnswer] = useState(false);
  const [studyMode, setStudyMode] = useState(false);
  const [loading, setLoading] = useState(true);

  // Study mode state
  const [studyTimer, setStudyTimer] = useState(30); // seconds per card
  const [currentTime, setCurrentTime] = useState(30);
  const [timerActive, setTimerActive] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, incorrect: 0, total: 0 });
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const [showCreateFolder, setShowCreateFolder] = useState(false);
  const [showCreateCard, setShowCreateCard] = useState(false);

  const [newFolder, setNewFolder] = useState({
    name: '',
    subject: '',
    description: '',
    color: 'from-blue-500 to-purple-600',
  });
  const [newCard, setNewCard] = useState({ question: '', answer: '' });

  // AI notes & progress
  const [notes, setNotes] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [currentlyGenerating, setCurrentlyGenerating] = useState(0);
  const [totalToGenerate, setTotalToGenerate] = useState(0);

  const subjects = [
    'Math AA',
    'Math AI',
    'English Lang & Lit',
    'Economics',
    'Business Management',
    'Chemistry',
    'Physics',
    'Biology',
    'Spanish Ab Initio',
    'French Ab Initio',
  ];
  const colors = [
    'from-blue-500 to-purple-600',
    'from-green-500 to-teal-600',
    'from-purple-500 to-pink-600',
    'from-orange-500 to-red-600',
    'from-yellow-500 to-orange-600',
    'from-indigo-500 to-blue-600',
    'from-red-500 to-pink-600',
    'from-cyan-500 to-blue-600',
  ];

  // Audio alerts
  useEffect(() => {
    audioRef.current = new Audio();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);
    if (!user) return;
  const playAlert = (type: 'warning' | 'timeout' | 'correct' | 'incorrect') => {
    if (!audioRef.current) return;
    
    // Generate different frequency tones for different alerts
    const context = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(context.destination);
    
    let frequency = 440;
    let duration = 0.2;
    
    switch (type) {
      case 'warning':
        frequency = 800;
        duration = 0.3;
        break;
      case 'timeout':
        frequency = 300;
        duration = 0.8;
        break;
      case 'correct':
        frequency = 600;
        duration = 0.2;
        break;
      case 'incorrect':
        frequency = 200;
        duration = 0.4;
        break;
    }
    
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
    oscillator.type = 'sine';
    gainNode.gain.setValueAtTime(0.3, context.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, context.currentTime + duration);
    
    oscillator.start(context.currentTime);
    oscillator.stop(context.currentTime + duration);
  };

  // Timer management
  useEffect(() => {
    if (timerActive && !timerPaused && currentTime > 0) {
      timerRef.current = setTimeout(() => {
        setCurrentTime(prev => {
          const newTime = prev - 1;
          
          // Warning at 10 seconds
          if (newTime === 10) {
            playAlert('warning');
            toast('⏰ 10 seconds remaining!', {
              icon: '⚠️',
              style: { background: '#FEF3C7', color: '#92400E' }
            });
          }
          
          // Timeout at 0
          if (newTime === 0) {
            playAlert('timeout');
            toast.error('⏰ Time\'s up! Moving to next card');
            handleTimeout();
          }
          
          return newTime;
        });
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timerActive, timerPaused, currentTime]);

  const handleTimeout = () => {
    setSessionStats(prev => ({ ...prev, incorrect: prev.incorrect + 1, total: prev.total + 1 }));
    markCardCorrect(false);
  };

  const startTimer = () => {
    setTimerActive(true);
    setTimerPaused(false);
    setCurrentTime(studyTimer);
  };

  const pauseTimer = () => {
    setTimerPaused(true);
  };

  const resumeTimer = () => {
    setTimerPaused(false);
  };

  const stopTimer = () => {
    setTimerActive(false);
    setTimerPaused(false);
    setCurrentTime(studyTimer);
  };

  // Enhanced text cleaning and parsing
  const cleanText = (str: string) => {
    if (!str) return '';
    
    return str
      .replace(/```(?:json)?/g, '')
      .replace(/^[\{\[\"\']|[\}\]\"\']$/g, '')
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/^(question|answer)[":\s]+/gi, '') // Remove prefixes like "question:" or "answer:"
      .replace(/^\d+[\.\)]\s*/, '') // Remove numbering like "1." or "1)"
      .trim();
  };

  // Parse AI response to extract proper question/answer pairs
  const parseAIFlashcards = (aiCards: AIFlashcard[]): AIFlashcard[] => {
    return aiCards.map(card => {
      let question = cleanText(card.question);
      let answer = cleanText(card.answer);
      
      // Handle cases where the entire response is in one field
      if (!question && answer.includes('?')) {
        const parts = answer.split(/\n\s*(?:answer|a)[:.\s]+/i);
        if (parts.length >= 2) {
          question = cleanText(parts[0]);
          answer = cleanText(parts[1]);
        }
      }
      
      // Handle cases where question/answer labels are mixed in
      if (question.toLowerCase().includes('answer:')) {
        const parts = question.split(/answer\s*[:.\s]+/i);
        question = cleanText(parts[0]);
        if (parts[1] && !answer) answer = cleanText(parts[1]);
      }
      
      if (answer.toLowerCase().includes('question:')) {
        const parts = answer.split(/question\s*[:.\s]+/i);
        answer = cleanText(parts[0]);
        if (parts[1] && !question) question = cleanText(parts[1]);
      }
      
      return {
        question: question || 'Question not properly formatted',
        answer: answer || 'Answer not properly formatted'
      };
    });
  };

  // ─── Load folders ───────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('flashcard_folders')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setFolders(data || []);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load folders');
      } finally {
        setLoading(false);
      }
    })();
  }, [user]);

  // ─── Load flashcards when folder changes ───────────────────
  useEffect(() => {
    if (!selectedFolder) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from('flashcards')
          .select('*')
          .eq('folder_id', selectedFolder.id)
          .order('created_at', { ascending: false });
        if (error) throw error;
        setFlashcards(data || []);
        setCurrentCardIndex(0);
        setShowAnswer(false);
        stopTimer();
      } catch (e) {
        console.error(e);
        toast.error('Failed to load flashcards');
      }
    })();
  }, [selectedFolder]);

  // ─── Folder CRUD ────────────────────────────────────────────
  const createFolder = async () => {
    if (!user || !newFolder.name.trim()) return;
    try {
      const { data, error } = await supabase
        .from('flashcard_folders')
        .insert({ ...newFolder, user_id: user.id })
        .select()
        .single();
      if (error) throw error;
      setFolders(prev => [data, ...prev]);
      setNewFolder({ name: '', subject: '', description: '', color: 'from-blue-500 to-purple-600' });
      setShowCreateFolder(false);
      toast.success('Folder created');
    } catch (e) {
      console.error(e);
      toast.error('Could not create folder');
    }
  };

  // ─── Manual flashcard CRUD ──────────────────────────────────
  const createFlashcard = async () => {
    if (!user || !selectedFolder) return;
    if (!newCard.question.trim() || !newCard.answer.trim()) return;
    try {
      const { data, error } = await supabase
        .from('flashcards')
        .insert({
          question: cleanText(newCard.question),
          answer: cleanText(newCard.answer),
          user_id: user.id,
          folder_id: selectedFolder.id,
          subject: selectedFolder.subject,
          difficulty: 1,
          review_count: 0,
          correct_count: 0,
          next_review: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      setFlashcards(prev => [data, ...prev]);
      setNewCard({ question: '', answer: '' });
      setShowCreateCard(false);
      toast.success('Card created');
      const { error: xpError } = await supabase.from('xp_events').insert([{
  user_id: user.id,
  source: 'flashcard',
  amount: 5,
  description: 'Created flashcard',
}]);

if (xpError) {
  console.error('XP insert failed:', xpError);
  toast.error('Could not record XP event');
}
    } catch (e) {
      console.error(e);
      toast.error('Could not create card');
    }
  };

  const deleteFlashcard = async (id: string) => {
    try {
      const { error } = await supabase.from('flashcards').delete().eq('id', id);
      if (error) throw error;
      setFlashcards(prev => prev.filter(c => c.id !== id));
      toast.success('Card deleted');
    } catch (e) {
      console.error(e);
      toast.error('Could not delete card');
    }
  };

  // ─── Review logic ───────────────────────────────────────────
  const markCardCorrect = async (correct: boolean) => {
    const card = flashcards[currentCardIndex];
    if (!card) return;

    // Play sound and show toast
    if (correct) {
      playAlert('correct');
      toast.success('✅ Correct!');
    } else {
      playAlert('incorrect');
      toast.error('❌ Incorrect');
    }

    // Update session stats
    setSessionStats(prev => ({
      correct: correct ? prev.correct + 1 : prev.correct,
      incorrect: correct ? prev.incorrect : prev.incorrect + 1,
      total: prev.total + 1
    }));

    try {
      const newReview = card.review_count + 1;
      const newCorrect = correct ? card.correct_count + 1 : card.correct_count;
      const newDiff = correct
        ? Math.max(1, card.difficulty - 0.1)
        : Math.min(5, card.difficulty + 0.2);
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + Math.floor(newDiff));

      const { error } = await supabase
        .from('flashcards')
        .update({
          review_count: newReview,
          correct_count: newCorrect,
          difficulty: newDiff,
          last_reviewed: new Date().toISOString(),
          next_review: nextDate.toISOString(),
        })
        .eq('id', card.id);
      if (error) throw error;

      setFlashcards(prev =>
        prev.map(c =>
          c.id === card.id
            ? { ...c, review_count: newReview, correct_count: newCorrect, difficulty: newDiff }
            : c
        )
      );
      console.log("XP insert payload", {
  user_id: user!.id,
  source: 'flashcard',
  amount: 5,
  description: 'Created flashcard',
});

   const { error: xpError } = await supabase
  .from('xp_events')
  .insert([{
    user_id: user!.id,
    source: 'flashcard_test',       // ← must match CHECK constraint
    amount: correct ? 3 : 1,
    description: correct
      ? 'Reviewed flashcard correctly'
      : 'Reviewed flashcard incorrectly',
  }]);

if (xpError) {
  console.error('XP insert failed:', xpError);
}

      
      // Auto advance after short delay
      setTimeout(() => {
        nextCard();
      }, 1000);
    } catch (e) {
      console.error(e);
      toast.error('Could not update card');
    }
  };

  // ─── Navigation ────────────────────────────────────────────
  const nextCard = () => {
    if (currentCardIndex < flashcards.length - 1) {
      setCurrentCardIndex(i => i + 1);
      setShowAnswer(false);
      if (studyMode) {
        setCurrentTime(studyTimer);
      }
    } else {
      // End of session
      if (studyMode) {
        setStudyMode(false);
        setTimerActive(false);
        toast.success(`Session complete! Score: ${sessionStats.correct}/${sessionStats.total}`);
      }
    }
  };

  const prevCard = () => {
    if (currentCardIndex > 0) {
      setCurrentCardIndex(i => i - 1);
      setShowAnswer(false);
      if (studyMode) {
        setCurrentTime(studyTimer);
      }
    }
  };

  const resetStudySession = () => {
    setCurrentCardIndex(0);
    setShowAnswer(false);
    setSessionStats({ correct: 0, incorrect: 0, total: 0 });
    if (studyMode) {
      setCurrentTime(studyTimer);
    }
  };

  // ─── AI flashcards from notes ──────────────────────────────
  const generateFromNotes = async () => {
    if (!selectedFolder || !notes.trim()) return;
    setGenerating(true);
    setGenerateProgress(0);
    setCurrentlyGenerating(0);
    setTotalToGenerate(10); // Default number of cards to generate

    try {
      // 1) Ask AI for flashcards and parse them properly
      const rawAiCards: AIFlashcard[] = await aiService.generateFlashcards(
        notes,
        selectedFolder.subject,
        10
      );
      
      const aiCards = parseAIFlashcards(rawAiCards);

      setTotalToGenerate(aiCards.length);

      // 2) Insert one-by-one & update progress
      const inserted: Flashcard[] = [];
      for (let i = 0; i < aiCards.length; i++) {
        setCurrentlyGenerating(i + 1);
        const progress = Math.round(((i + 1) / aiCards.length) * 100);
        setGenerateProgress(progress);

        const { question, answer } = aiCards[i];
        const cleanQ = cleanText(question);
        const cleanA = cleanText(answer);

        const { data, error } = await supabase
          .from('flashcards')
          .insert([
            {
              user_id: user!.id,
              folder_id: selectedFolder.id,
              subject: selectedFolder.subject,
              question: cleanQ,
              answer: cleanA,
              difficulty: 1,
              review_count: 0,
              correct_count: 0,
              next_review: new Date().toISOString(),
            },
          ])
          .select()
          .single();

        if (error) throw error;
        inserted.push(data);
        
        // Small delay to show progress
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 3) Prepend and reset
      setFlashcards(prev => [...inserted, ...prev]);
      setNotes('');
      toast.success(`Generated ${inserted.length} flashcards from your notes!`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to generate from notes');
    } finally {
      setGenerating(false);
      setGenerateProgress(0);
      setCurrentlyGenerating(0);
      setTotalToGenerate(0);
    }
  };

  // ─── Loading spinner ───────────────────────────────────────
  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600" />
      </div>
    );
  }

  // ─── STUDY MODE ────────────────────────────────────────────
  if (studyMode && selectedFolder && flashcards.length > 0) {
    const card = flashcards[currentCardIndex];
    const progress = ((currentCardIndex + 1) / flashcards.length) * 100;
    const timePercentage = (currentTime / studyTimer) * 100;
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Enhanced Header */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center space-x-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStudyMode(false);
                    stopTimer();
                  }}
                  className="hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4 mr-2" />
                  Exit Study
                </Button>
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">{selectedFolder.name}</h1>
                  <p className="text-gray-500">{selectedFolder.subject}</p>
                </div>
              </div>
              
              {/* Session Stats */}
              <div className="flex items-center space-x-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{sessionStats.correct}</div>
                  <div className="text-xs text-gray-500">Correct</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-red-500">{sessionStats.incorrect}</div>
                  <div className="text-xs text-gray-500">Incorrect</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{sessionStats.total}</div>
                  <div className="text-xs text-gray-500">Total</div>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Progress</span>
                <span>{currentCardIndex + 1} of {flashcards.length}</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-gradient-to-r from-purple-500 to-blue-500 h-3 rounded-full transition-all duration-300 relative overflow-hidden"
                  style={{ width: `${progress}%` }}
                >
                  <div className="absolute inset-0 bg-white bg-opacity-20 animate-pulse" />
                </div>
              </div>
            </div>
          </div>

          {/* Timer Section */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className={`relative w-20 h-20 rounded-full flex items-center justify-center ${
                  currentTime <= 10 ? 'bg-red-100 text-red-700 animate-pulse' : 
                  currentTime <= 20 ? 'bg-yellow-100 text-yellow-700' : 
                  'bg-green-100 text-green-700'
                }`}>
                  {/* Circular progress */}
                  <svg className="absolute inset-0 w-20 h-20 transform -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-gray-200"
                      stroke="currentColor"
                      strokeWidth="3"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={currentTime <= 10 ? 'text-red-500' : currentTime <= 20 ? 'text-yellow-500' : 'text-green-500'}
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray={`${timePercentage}, 100`}
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="text-center">
                    <div className="text-lg font-bold">
                      {Math.floor(currentTime / 60)}:{(currentTime % 60).toString().padStart(2, '0')}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-semibold text-gray-800">Study Timer</h3>
                  <p className="text-sm text-gray-500">
                    {timerActive ? (timerPaused ? 'Paused' : 'Running') : 'Stopped'}
                  </p>
                </div>
              </div>
              
              {/* Timer Controls */}
              <div className="flex items-center space-x-3">
                <select
                  value={studyTimer}
                  onChange={(e) => {
                    const newTimer = parseInt(e.target.value);
                    setStudyTimer(newTimer);
                    if (!timerActive) setCurrentTime(newTimer);
                  }}
                  className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500"
                >
                  <option value={15}>15s</option>
                  <option value={30}>30s</option>
                  <option value={45}>45s</option>
                  <option value={60}>1m</option>
                  <option value={90}>1.5m</option>
                  <option value={120}>2m</option>
                </select>
                
                {!timerActive ? (
                  <Button onClick={startTimer} className="bg-green-500 hover:bg-green-600">
                    <Play className="w-4 h-4 mr-2" />
                    Start
                  </Button>
                ) : timerPaused ? (
                  <Button onClick={resumeTimer} className="bg-blue-500 hover:bg-blue-600">
                    <Play className="w-4 h-4 mr-2" />
                    Resume
                  </Button>
                ) : (
                  <Button onClick={pauseTimer} variant="outline">
                    <Pause className="w-4 h-4 mr-2" />
                    Pause
                  </Button>
                )}
                
                <Button onClick={stopTimer} variant="outline">
                  <Square className="w-4 h-4 mr-2" />
                  Stop
                </Button>
              </div>
            </div>
          </div>

          {/* Enhanced Flashcard */}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentCardIndex}
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -300 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="relative"
            >
              <div 
                className={`bg-white rounded-3xl shadow-xl p-8 min-h-[400px] cursor-pointer transition-all duration-300 border-2 ${
                  currentTime <= 10 ? 'border-red-300 shadow-red-100' : 
                  'border-gray-100 hover:border-purple-200'
                } ${showAnswer ? 'bg-gradient-to-br from-blue-50 to-indigo-50' : 'bg-gradient-to-br from-purple-50 to-pink-50'}`}
                onClick={() => setShowAnswer(!showAnswer)}
              >
                {/* Card Header */}
                <div className="text-center mb-8">
                  <div className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${
                    showAnswer ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                  }`}>
                    {showAnswer ? (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Answer
                      </>
                    ) : (
                      <>
                        <Brain className="w-4 h-4 mr-2" />
                        Question
                      </>
                    )}
                  </div>
                </div>

                {/* Card Content */}
                <div className="text-center space-y-6">
                  {showAnswer ? (
                    <div className="space-y-8">
                      <div className="text-xl leading-relaxed text-gray-800 font-medium">
                        {cleanText(card.answer)}
                      </div>
                      
                      {/* Enhanced Action Buttons */}
                      <div className="flex justify-center space-x-4">
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            markCardCorrect(false);
                          }}
                          className="bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white px-8 py-4 text-lg font-semibold rounded-2xl shadow-lg transform transition-all hover:scale-105"
                        >
                          <XCircle className="w-5 h-5 mr-3" />
                          Incorrect
                        </Button>
                        <Button
                          onClick={(e) => {
                            e.stopPropagation();
                            markCardCorrect(true);
                          }}
                          className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white px-8 py-4 text-lg font-semibold rounded-2xl shadow-lg transform transition-all hover:scale-105"
                        >
                          <CheckCircle className="w-5 h-5 mr-3" />
                          Correct
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="text-xl leading-relaxed text-gray-800 font-medium min-h-[120px] flex items-center justify-center">
                        {cleanText(card.question)}
                      </div>
                      
                      <div className="flex items-center justify-center text-gray-500 bg-white bg-opacity-50 rounded-full px-6 py-3">
                        <Eye className="w-5 h-5 mr-2" />
                        <span className="text-lg">Click to reveal answer</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Enhanced Navigation */}
          <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={prevCard}
                disabled={currentCardIndex === 0}
                className="px-6 py-3 rounded-xl"
              >
                <ChevronLeft className="w-5 h-5 mr-2" />
                Previous
              </Button>

              <div className="flex items-center space-x-4">
                <Button 
                  variant="outline" 
                  onClick={resetStudySession}
                  className="px-6 py-3 rounded-xl"
                >
                  <RotateCcw className="w-5 h-5 mr-2" />
                  Reset Session
                </Button>
                
                {currentCardIndex === flashcards.length - 1 ? (
                  <Button
                    onClick={() => {
                      setStudyMode(false);
                      setTimerActive(false);
                      toast.success(`🎉 Session Complete! Final Score: ${sessionStats.correct}/${sessionStats.total}`);
                    }}
                    className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-6 py-3 rounded-xl"
                  >
                    Finish Session
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={nextCard}
                    className="px-6 py-3 rounded-xl"
                  >
                    Next
                    <ChevronRight className="w-5 h-5 ml-2" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── FOLDER VIEW ───────────────────────────────────────────
  if (selectedFolder) {
    return (
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button
              variant="outline"
              onClick={() => setSelectedFolder(null)}
            >
              <ChevronLeft className="w-4 h-4 mr-2" />
              Back to Folders
            </Button>
            <div>
              <h1 className="text-2xl font-bold">{selectedFolder.name}</h1>
              <p className="text-gray-600">{selectedFolder.subject}</p>
            </div>
          </div>
          
          {flashcards.length > 0 && (
            <Button
              onClick={() => {
                setStudyMode(true);
                setSessionStats({ correct: 0, incorrect: 0, total: 0 });
                setCurrentTime(studyTimer);
              }}
              className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
            >
              <Play className="w-4 h-4 mr-2" />
              Start Study Session
            </Button>
          )}
        </div>

        {/* Notes & AI Generation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Brain className="w-5 h-5 mr-2" />
              AI Flashcard Generator
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Paste or write your study notes here, and AI will generate flashcards for you..."
              className="w-full border rounded-lg p-3 h-32 resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={generating}
            />
            
            {generating && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Generating flashcards...</span>
                  <span>{currentlyGenerating}/{totalToGenerate}</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${generateProgress}%` }}
                  />
                </div>
                <p className="text-xs text-gray-500">
                  Creating card {currentlyGenerating} of {totalToGenerate} ({generateProgress}%)
                </p>
              </div>
            )}
            
            <Button
              onClick={generateFromNotes}
              disabled={!notes.trim() || generating}
              className="w-full"
            >
              {generating ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                  Generating Cards... ({generateProgress}%)
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Generate Flashcards with AI
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Manual card creation */}
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold">
            Flashcards ({flashcards.length})
          </h2>
          <Dialog open={showCreateCard} onOpenChange={setShowCreateCard}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Card
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Flashcard</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Question</label>
                  <textarea
                    value={newCard.question}
                    onChange={e => setNewCard({ ...newCard, question: e.target.value })}
                    className="w-full border rounded p-2 mt-1"
                    rows={3}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Answer</label>
                  <textarea
                    value={newCard.answer}
                    onChange={e => setNewCard({ ...newCard, answer: e.target.value })}
                    className="w-full border rounded p-2 mt-1"
                    rows={3}
                  />
                </div>
                <Button onClick={createFlashcard} className="w-full">
                  Create Card
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Flashcards grid */}
        {flashcards.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <Brain className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-medium text-gray-600 mb-2">
                No flashcards yet
              </h3>
              <p className="text-gray-500 mb-4">
                Create your first flashcard or generate them from your notes using AI
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {flashcards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className="h-full hover:shadow-lg transition-shadow">
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Question</p>
                        <p className="text-sm whitespace-pre-wrap line-clamp-3">
                          {cleanText(card.question)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Answer</p>
                        <p className="text-sm text-gray-500 whitespace-pre-wrap line-clamp-2">
                          {cleanText(card.answer)}
                        </p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t">
                        <div className="text-xs text-gray-400">
                          {card.review_count > 0 && (
                            <span>
                              {card.correct_count}/{card.review_count} correct
                            </span>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => deleteFlashcard(card.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ─── FOLDERS GRID ──────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Flashcards</h1>
          <p className="text-gray-600">Organize your study materials into folders</p>
        </div>
        <Dialog open={showCreateFolder} onOpenChange={setShowCreateFolder}>
          <DialogTrigger asChild>
            <Button>
              <FolderPlus className="w-4 h-4 mr-2" />
              New Folder
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Folder</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Folder Name</label>
                <input
                  type="text"
                  value={newFolder.name}
                  onChange={e => setNewFolder({ ...newFolder, name: e.target.value })}
                  className="w-full border rounded p-2 mt-1"
                  placeholder="e.g., Chapter 5: Calculus"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Subject</label>
                <select
                  value={newFolder.subject}
                  onChange={e => setNewFolder({ ...newFolder, subject: e.target.value })}
                  className="w-full border rounded p-2 mt-1"
                >
                  <option value="">Select a subject</option>
                  {subjects.map(subject => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">Description (Optional)</label>
                <textarea
                  value={newFolder.description}
                  onChange={e => setNewFolder({ ...newFolder, description: e.target.value })}
                  className="w-full border rounded p-2 mt-1"
                  rows={2}
                  placeholder="Brief description of what this folder contains..."
                />
              </div>
              <div>
                <label className="text-sm font-medium">Color Theme</label>
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {colors.map(color => (
                    <button
                      key={color}
                      onClick={() => setNewFolder({ ...newFolder, color })}
                      className={`h-10 rounded bg-gradient-to-r ${color} ${
                        newFolder.color === color ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                      }`}
                    />
                  ))}
                </div>
              </div>
              <Button onClick={createFolder} className="w-full">
                Create Folder
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Folders grid */}
      {folders.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <FolderPlus className="w-12 h-12 mx-auto text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">
              No folders yet
            </h3>
            <p className="text-gray-500 mb-4">
              Create your first folder to start organizing your flashcards
            </p>
            <Button onClick={() => setShowCreateFolder(true)}>
              <FolderPlus className="w-4 h-4 mr-2" />
              Create First Folder
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder, index) => (
            <motion.div
              key={folder.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card
                className="cursor-pointer hover:shadow-lg transition-all duration-300 overflow-hidden group"
                onClick={() => setSelectedFolder(folder)}
              >
                <div className={`h-24 bg-gradient-to-r ${folder.color} relative`}>
                  <div className="absolute inset-0 bg-black bg-opacity-20 group-hover:bg-opacity-10 transition-all" />
                  <div className="absolute bottom-3 left-4 text-white">
                    <h3 className="font-semibold text-lg">{folder.name}</h3>
                    <p className="text-sm opacity-90">{folder.subject}</p>
                  </div>
                </div>
                <CardContent className="p-4">
                  <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                    {folder.description || 'No description provided'}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>
                      Created {new Date(folder.created_at).toLocaleDateString()}
                    </span>
                    <div className="flex items-center">
                      <Brain className="w-3 h-3 mr-1" />
                      Study
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Flashcards;