// src/store/authStore.ts
import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import toast from 'react-hot-toast';

interface Profile {
  id: string;                 // == auth.users.id
  username: string | null;
  bio: string;
  xp: number;
  streak: number;
  tier: 'free' | 'pro' | 'elite';
  profile_picture: string | null;
  last_activity?: string | null;
  streak_days: number;     // ✅ ensure this exists here
}

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  loading: boolean;           // for actions (sign in/out/up)
  bootstrapped: boolean;      // first session check has run
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, username: string) => Promise<void>;
  signOut: () => Promise<void>;
  initialize: () => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<void>;
}

let __initPromise: Promise<void> | null = null;

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: false,
  bootstrapped: false,

  // --- Sign in: resolve fast, do NOT block the UI ---
// src/store/authStore.ts
signIn: async (email, password) => {
  try {
    console.log('[signIn] start');
    useAuthStore.setState({ loading: true });

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    console.log('[signIn] success user:', data.user?.id);
    useAuthStore.setState({ user: data.user!, loading: false, bootstrapped: true });

    // expose for debugging right away
    (globalThis as any).__auth = useAuthStore.getState();
    console.log('[signIn] state now:', (globalThis as any).__auth);

    // Kick off non-blocking session/profile refresh
    void useAuthStore.getState().initialize();
  } catch (err: any) {
    console.error('[signIn] error:', err);
    useAuthStore.setState({ loading: false });
    throw err;
  }
},


  // --- Sign up ---
  signUp: async (email, password, username) => {
    try {
      set({ loading: true });
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });
      if (error) throw error;

      toast.success(
        data.session ? 'Account created!' : 'Account created! Check your email to verify.'
      );

      // Run a session/profile check but don't block the UI
      set({ loading: false });
      void get().initialize();
    } catch (err: any) {
      console.error('[signUp] error:', err);
      set({ loading: false });
      toast.error(err?.message ?? 'Sign-up failed');
      throw err;
    }
  },

  // --- Sign out ---
  signOut: async () => {
    try {
      await supabase.auth.signOut();
      set({ user: null, profile: null, loading: false, bootstrapped: true });
      toast.success('Signed out');
    } catch (err: any) {
      console.error('[signOut] error:', err);
      toast.error('Failed to sign out');
      throw err;
    }
  },

  // --- Initialize: instant bootstrap; profile fetched in background ---
initialize: async () => {
  if (__initPromise) return __initPromise;

  __initPromise = (async () => {
    console.log('[auth] initialize: start');
    // Let public routes render instantly; protected ones still gate on user
    useAuthStore.setState({ bootstrapped: true });

    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('[auth] getSession error:', error);
        useAuthStore.setState({ user: null, profile: null });
        return;
      }

      // No user session
      if (!session?.user) {
        console.log('[auth] initialize: no session');
        useAuthStore.setState({ user: null, profile: null });
        return;
      }

      const user = session.user;
      useAuthStore.setState({ user });

      // Fetch OR create profile (await inside try/catch to avoid PromiseLike .catch typing issues)
      try {
        let { data: profileRow, error: pErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        // If not found, create it from auth metadata
        if (!profileRow && (!pErr || (pErr as any).code === 'PGRST116')) {
          const username =
            user.user_metadata?.username ??
            `user_${user.id.slice(0, 8)}`;
          const subjects = user.user_metadata?.subjects ?? [];

          const { data: created, error: cErr } = await supabase
            .from('profiles')
            .insert({
              id: user.id,
              username,
              tier: 'free',
              xp: 0,
              streak: 0,
              bio: '',
              profile_picture: null,
              subjects,
              last_activity: new Date().toISOString(),
            })
            .select('*')
            .single();

          if (cErr) {
            console.warn('[auth] profile create error:', cErr);
          } else {
            profileRow = created as any;
          }
        } else if (pErr && (pErr as any).code !== 'PGRST116') {
          console.warn('[auth] profile fetch error:', pErr);
        }

        if (profileRow) {
          useAuthStore.setState({ profile: profileRow as any });
        }
      } catch (e) {
        console.warn('[auth] profile fetch/create failed:', e);
      }

      // Touch last_activity (non-blocking)
      void supabase
        .from('profiles')
        .update({ last_activity: new Date().toISOString() })
        .eq('id', user.id);

    } finally {
      __initPromise = null;
      // @ts-ignore – handy for debugging in devtools
      (globalThis as any).__auth = useAuthStore.getState();
      console.log('[auth] initialize: done', (globalThis as any).__auth);
    }
  })();

  return __initPromise;
},



  // --- Update profile ---
  updateProfile: async (updates) => {
    const { user } = get();
    if (!user) return;

    try {
      const { error } = await supabase.from('profiles').update(updates).eq('id', user.id);
      if (error) throw error;

      const { data, error: fetchError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!fetchError && data) set({ profile: data as Profile });
      toast.success('Profile updated');
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      toast.error(err?.message ?? 'Failed to update profile');
      throw err;
    }
  },
}));

// ✅ HMR-safe auth listener
const g = globalThis as any;
if (!g.__auth_subscribed) {
  g.__auth_subscribed = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      // Keep it non-blocking so UI never freezes
      void useAuthStore.getState().initialize();
    } else {
      useAuthStore.setState({ user: null, profile: null, loading: false, bootstrapped: true });
    }
  });
}
