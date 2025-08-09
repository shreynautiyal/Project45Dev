// src/lib/supabase.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// ✅ HMR-safe singleton client
const g = globalThis as any;
if (!g.__supabase_client) {
  g.__supabase_client = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      // unique key so multiple clients won’t collide
      storageKey: `sb-${new URL(supabaseUrl).host}-auth`,
    },
  });
}

export const supabase = g.__supabase_client as SupabaseClient;

// Debug once
if (!g.__supabase_env_logged) {
  g.__supabase_env_logged = true;
  console.log('ENV.VITE_SUPABASE_URL =', supabaseUrl);
  console.log('ENV.VITE_SUPABASE_ANON_KEY (first4) =', supabaseAnonKey.slice(0, 4));
}

/* ====== Shared interfaces (unchanged) ====== */
export interface Profile {
  id: string;
  username: string;
  bio: string;
  xp: number;
  streak_days: number;
  last_activity: string;
  tier: 'free' | 'pro' | 'elite';
  profile_picture: string;
  created_at: string;
  updated_at: string;
}
export interface FlashcardFolder { id: string; user_id: string; name: string; description: string; color: string; created_at: string; }
export interface Flashcard { id: string; user_id: string; folder_id: string; question: string; answer: string; difficulty: number; times_reviewed: number; times_correct: number; created_at: string; updated_at: string; }
export interface Essay { id: string; user_id: string; type: 'english_paper1'|'english_paper2'|'tok_essay'|'extended_essay'; title: string; content: string; feedback: string; score: number; ai_generated: boolean; created_at: string; }
export interface ChatMessage { id: string; user_id: string; subject: string; role: 'user'|'assistant'; content: string; created_at: string; }
export interface XPEvent {
  id: string;
  user_id: string;
  source: 'flashcard_create'|'flashcard_test'|'ai_chat'|'essay_submit'|'daily_goal'|'streak_bonus';
  amount: number;            // ← use `amount` (NOT `points`)
  description: string;
  created_at: string;
}
export interface TestResult { id: string; user_id: string; folder_id: string; score: number; total_questions: number; duration_seconds: number; accuracy_percentage: number; created_at: string; }
export interface Badge { id: string; name: string; description: string; icon: string; color: string; requirement_type: string; requirement_value: number; created_at: string; }
export interface UserBadge { id: string; user_id: string; badge_id: string; unlocked_at: string; badge: Badge; }
