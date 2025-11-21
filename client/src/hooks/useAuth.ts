import { Session } from '@supabase/supabase-js';
import { create } from 'zustand';
import { supabase } from '../lib/supabaseClient';

interface AuthState {
  session: Session | null;
  loading: boolean;
  error: string | null;
  magicLinkSent: boolean;
  signInWithEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => {
  supabase.auth.getSession().then(({ data }) => {
    set({ session: data.session, loading: false });
  });

  supabase.auth.onAuthStateChange((_event, session) => {
    set({ session, loading: false, magicLinkSent: false, error: null });
  });

  return {
    session: null,
    loading: true,
    error: null,
    magicLinkSent: false,
    signInWithEmail: async (email: string) => {
      set({ loading: true, error: null });
      const redirectTo = `${window.location.origin}/profiles`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        set({ error: error.message, loading: false });
        throw error;
      }
      set({ magicLinkSent: true, loading: false });
    },
    signOut: async () => {
      await supabase.auth.signOut();
      set({ session: null });
    },
  };
});
