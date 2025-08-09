/*
  # Initial Project 45 Database Schema

  1. New Tables
    - `profiles` - User profile data with XP, streaks, tiers
    - `flashcards` - User flashcards organized in folders
    - `flashcard_folders` - Folder organization for flashcards
    - `essays` - Submitted essays with AI feedback
    - `chat_messages` - AI chat history per user
    - `xp_events` - Track all XP earning events
    - `test_results` - Flashcard test performance data
    - `followers` - Friend/following system
    - `badges` - Achievement badges system
    - `user_badges` - User badge unlocks
    - `notes_uploads` - Smart notes uploads and processing
    - `daily_goals` - User daily goal tracking
    - `subscription_tiers` - Stripe subscription management

  2. Security
    - Enable RLS on all tables
    - Add policies for user data access
    - Ensure users can only access their own data
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  bio text DEFAULT '',
  xp integer DEFAULT 0,
  streak integer DEFAULT 0,
  last_activity date DEFAULT CURRENT_DATE,
  tier text DEFAULT 'free' CHECK (tier IN ('free', 'pro', 'elite')),
  profile_picture text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Flashcard folders
CREATE TABLE IF NOT EXISTS flashcard_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text DEFAULT '',
  color text DEFAULT '#3B82F6',
  created_at timestamptz DEFAULT now()
);

-- Flashcards table
CREATE TABLE IF NOT EXISTS flashcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES flashcard_folders(id) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  difficulty integer DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 5),
  times_reviewed integer DEFAULT 0,
  times_correct integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Essays table
CREATE TABLE IF NOT EXISTS essays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('english_paper1', 'english_paper2', 'tok_essay', 'extended_essay')),
  title text NOT NULL,
  content text NOT NULL,
  feedback text DEFAULT '',
  score integer DEFAULT 0,
  ai_generated boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- Chat messages table
CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- XP events table
CREATE TABLE IF NOT EXISTS xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('flashcard_create', 'flashcard_test', 'ai_chat', 'essay_submit', 'daily_goal', 'streak_bonus')),
  amount integer NOT NULL,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

-- Test results table
CREATE TABLE IF NOT EXISTS test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  folder_id uuid REFERENCES flashcard_folders(id) ON DELETE CASCADE,
  score integer NOT NULL,
  total_questions integer NOT NULL,
  duration_seconds integer NOT NULL,
  accuracy_percentage decimal(5,2) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Followers table
CREATE TABLE IF NOT EXISTS followers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(follower_id, following_id)
);

-- Badges table
CREATE TABLE IF NOT EXISTS badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  description text NOT NULL,
  icon text NOT NULL,
  color text DEFAULT '#3B82F6',
  requirement_type text NOT NULL,
  requirement_value integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- User badges table
CREATE TABLE IF NOT EXISTS user_badges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id uuid REFERENCES badges(id) ON DELETE CASCADE,
  unlocked_at timestamptz DEFAULT now(),
  UNIQUE(user_id, badge_id)
);

-- Notes uploads table
CREATE TABLE IF NOT EXISTS notes_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_path text NOT NULL,
  processed_text text DEFAULT '',
  topic_tags text[] DEFAULT '{}',
  status text DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  created_at timestamptz DEFAULT now()
);

-- Daily goals table
CREATE TABLE IF NOT EXISTS daily_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_type text NOT NULL CHECK (goal_type IN ('flashcards_reviewed', 'ai_messages_sent', 'essays_submitted', 'study_time_minutes')),
  target_value integer NOT NULL,
  current_value integer DEFAULT 0,
  date date DEFAULT CURRENT_DATE,
  completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, goal_type, date)
);

-- Subscription tiers table
CREATE TABLE IF NOT EXISTS subscription_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  tier text NOT NULL CHECK (tier IN ('free', 'pro', 'elite')),
  stripe_subscription_id text,
  stripe_customer_id text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcard_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards ENABLE ROW LEVEL SECURITY;
ALTER TABLE essays ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE followers ENABLE ROW LEVEL SECURITY;
ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_tiers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage own flashcard folders" ON flashcard_folders FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own flashcards" ON flashcards FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own essays" ON essays FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own chat messages" ON chat_messages FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own xp events" ON xp_events FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own test results" ON test_results FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own notes uploads" ON notes_uploads FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own daily goals" ON daily_goals FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own subscription" ON subscription_tiers FOR ALL TO authenticated USING (auth.uid() = user_id);

-- Follower policies
CREATE POLICY "Users can manage followers" ON followers FOR ALL TO authenticated USING (auth.uid() = follower_id OR auth.uid() = following_id);

-- Badge policies
CREATE POLICY "Anyone can read badges" ON badges FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can read own badges" ON user_badges FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own badges" ON user_badges FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Public profiles view for leaderboard
CREATE POLICY "Public profiles readable" ON profiles FOR SELECT TO authenticated USING (true);

-- Insert default badges
INSERT INTO badges (name, description, icon, color, requirement_type, requirement_value) VALUES
('Welcome Aboard', 'Created your first flashcard', '🎉', '#10B981', 'flashcards_created', 1),
('Flashcard Frenzy', 'Created 100 flashcards', '🔥', '#F59E0B', 'flashcards_created', 100),
('Test Master', 'Completed 50 tests with 90%+ accuracy', '🏆', '#3B82F6', 'test_accuracy', 50),
('Chat Champion', 'Sent 500 messages to AI', '💬', '#8B5CF6', 'ai_messages', 500),
('Essay Expert', 'Submitted 25 essays', '📝', '#EF4444', 'essays_submitted', 25),
('XP Warrior', 'Reached 10,000 XP', '⚔️', '#F97316', 'total_xp', 10000),
('Streak Saver', 'Maintained a 30-day streak', '🔥', '#DC2626', 'max_streak', 30);