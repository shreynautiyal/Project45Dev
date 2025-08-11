// src/lib/utils.ts
import type { ClassValue } from "clsx";
import clsx from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * XP progression helpers
 * Curve: next level cost = 100 + level * 50 (Level 1 at 0 XP)
 */
export type XPProgress = {
  level: number;          // current level (1..99)
  progress: number;       // 0..1 within current level
  percent: number;        // 0..100
  currentInLevel: number; // XP accumulated within this level
  nextLevelCost: number;  // XP needed from this level to the next
  toNext: number;         // XP still required to reach next level
};

export function getXPProgress(totalXp: number): XPProgress {
  let level = 1;
  let remaining = Math.max(0, Math.floor(totalXp || 0));
  let cost = 100;

  while (remaining >= cost && level < 99) {
    remaining -= cost;
    level++;
    cost = 100 + level * 50;
  }

  const nextLevelCost = cost;
  const progress = nextLevelCost ? Math.min(1, Math.max(0, remaining / nextLevelCost)) : 0;

  return {
    level,
    progress,
    percent: Math.round(progress * 100),
    currentInLevel: remaining,
    nextLevelCost,
    toNext: Math.max(0, nextLevelCost - remaining),
  };
}
