import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(new Date(date));
}

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

export function calculateXPForLevel(level: number) {
  return level * 1000;
}

export function getLevelFromXP(xp: number) {
  return Math.floor(xp / 1000) + 1;
}

export function getXPProgress(xp: number) {
  const level = getLevelFromXP(xp);
  const currentLevelXP = (level - 1) * 1000;
  const nextLevelXP = level * 1000;
  const progress = xp - currentLevelXP;
  const total = nextLevelXP - currentLevelXP;
  
  return {
    level,
    progress,
    total,
    percentage: (progress / total) * 100
  };
}

export const IB_SUBJECTS = [
  'Mathematics AA',
  'Mathematics AI',
  'English A Literature',
  'English A Language & Literature',
  'Biology',
  'Chemistry',
  'Physics',
  'History',
  'Economics',
  'Business Management',
  'Psychology',
  'Geography',
  'Visual Arts',
  'Theory of Knowledge',
  'Extended Essay'
];

export const ESSAY_TYPES = {
  english_paper1: 'English A Paper 1',
  english_paper2: 'English A Paper 2',
  tok_essay: 'TOK Essay',
  extended_essay: 'Extended Essay'
};