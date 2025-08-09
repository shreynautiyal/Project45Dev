import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../store/authStore';


export function useXP() {
  const { user, profile, updateProfile } = useAuthStore();
  const [loading, setLoading] = useState(false);

  const addXP = useCallback(async (
    amount: number,
    source: string,
    description: string = ''
  ) => {
    if (!user || !profile) return;

    setLoading(true);
    try {
      // Add XP event
      await supabase
        .from('xp_events')
        .insert([{
          user_id: user.id,
          source,
          amount,
          description
        }]);

      // Update profile XP
      const newXP = profile.xp + amount;
      await updateProfile({ xp: newXP });

      // Check for badge unlocks
      await checkBadgeUnlocks(newXP);

      return newXP;
    } catch (error) {
      console.error('Error adding XP:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  }, [user, profile, updateProfile]);

  const checkBadgeUnlocks = async (currentXP: number) => {
    if (!user) return;

    try {
      // Get all badges
      const { data: badges } = await supabase
        .from('badges')
        .select('*');

      if (!badges) return;

      // Get user's current badges
      const { data: userBadges } = await supabase
        .from('user_badges')
        .select('badge_id')
        .eq('user_id', user.id);

      const unlockedBadgeIds = userBadges?.map(ub => ub.badge_id) || [];

      // Check each badge requirement
      for (const badge of badges) {
        if (unlockedBadgeIds.includes(badge.id)) continue;

        let shouldUnlock = false;

        switch (badge.requirement_type) {
          case 'total_xp':
            shouldUnlock = currentXP >= badge.requirement_value;
            break;
          case 'flashcards_created':
            const { count: flashcardCount } = await supabase
              .from('flashcards')
              .select('*', { count: 'exact' })
              .eq('user_id', user.id);
            shouldUnlock = (flashcardCount || 0) >= badge.requirement_value;
            break;
          // Add more badge types as needed
        }

        if (shouldUnlock) {
          await supabase
            .from('user_badges')
            .insert([{
              user_id: user.id,
              badge_id: badge.id
            }]);
        }
      }
    } catch (error) {
      console.error('Error checking badge unlocks:', error);
    }
  };

  return {
    addXP,
    loading
  };
}