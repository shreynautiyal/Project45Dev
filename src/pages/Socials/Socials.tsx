// src/pages/Socials/Socials.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { getXPProgress } from '../../lib/utils';
import {
  Search, UserPlus, UserMinus, Zap, Flame, Send, Heart, MessageCircle,
  Image as ImageIcon, PlusCircle, BellRing, Trophy, Users, Loader2, Sparkles, Crown
} from 'lucide-react';
import toast from 'react-hot-toast';

/* =========================
   Types
========================= */

type ProfileRow = {
  id: string;
  username: string;
  bio: string | null;
  xp: number;
  streak: number;
  tier: string;
  profile_picture: string | null;
};

type Story = {
  id: string;
  user_id: string;
  image_url: string;
  text: string | null;
  created_at: string;
  expires_at: string;
  user?: Pick<ProfileRow, 'username' | 'profile_picture' | 'xp' | 'streak'>;
};

type Post = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  likes_count?: number;
  comments_count?: number;
  user?: Pick<ProfileRow, 'username' | 'profile_picture' | 'xp' | 'streak'>;
  liked_by_me?: boolean;
};

/* =========================
   Component
========================= */

export default function Socials() {
  const { user, profile } = useAuthStore();
  const [booting, setBooting] = useState(true);

  // my XP bar calc
  const xp = useMemo(
    () => (profile ? getXPProgress(profile.xp) : { level: 0, progress: 0 }),
    [profile]
  );

  // follows
  const [following, setFollowing] = useState<string[]>([]);
  const [followers, setFollowers] = useState<string[]>([]);

  // search
  const [q, setQ] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileRow[]>([]);
  const searchDebounce = useRef<number | null>(null);

  // suggestions / leaderboard
  const [suggested, setSuggested] = useState<ProfileRow[]>([]);
  const [topXP, setTopXP] = useState<ProfileRow[]>([]);

  // stories
  const [stories, setStories] = useState<Story[]>([]);
  const [storyUploading, setStoryUploading] = useState(false);

  // feed
  const [feed, setFeed] = useState<Post[]>([]);
  const [posting, setPosting] = useState(false);
  const [postText, setPostText] = useState('');

  // initial load
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        setBooting(true);
        await Promise.all([
          refreshFollows(),
          fetchStories(),
          fetchFeed(),
          fetchSuggestions(),
          fetchTopXP(),
        ]);
      } catch (e) {
        console.error(e);
      } finally {
        setBooting(false);
      }
    })();
  }, [user?.id]);

  /* =========================
     Data Fetchers
  ========================= */

  async function refreshFollows() {
    if (!user) return;
    const { data: f1 } = await supabase
      .from('social_follows')
      .select('following_id')
      .eq('follower_id', user.id);
    setFollowing((f1 || []).map((r: any) => r.following_id));

    const { data: f2 } = await supabase
      .from('social_follows')
      .select('follower_id')
      .eq('following_id', user.id);
    setFollowers((f2 || []).map((r: any) => r.follower_id));
  }

  async function fetchSuggestions() {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, bio, profile_picture, xp, streak, tier')
      .neq('id', user.id)
      .order('xp', { ascending: false })
      .limit(24);
    if (error) return;
    const out = (data || []).filter((p) => !following.includes(p.id));
    setSuggested(out);
  }

async function fetchTopXP() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, profile_picture, xp, streak, tier, bio') // ✅ include bio
    .order('xp', { ascending: false })
    .limit(8);

  if (error) {
    console.error('Error fetching top XP profiles:', error);
    setTopXP([]);
    return;
  }

  setTopXP(
    (data ?? []).map((p) => ({
      id: p.id,
      username: p.username,
      profile_picture: p.profile_picture,
      xp: p.xp ?? 0,
      streak: p.streak ?? 0,
      tier: p.tier ?? 'free',
      bio: p.bio ?? '', // ✅ ensure bio always exists
    }))
  );
}


  async function fetchStories() {
    const { data, error } = await supabase
      .from('social_stories')
      .select('*')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) return;
    const userIds = Array.from(new Set((data || []).map((s: any) => s.user_id)));
    if (userIds.length === 0) return setStories([]);
    const { data: users } = await supabase
      .from('profiles')
      .select('id, username, profile_picture, xp, streak')
      .in('id', userIds);
    const map = new Map((users || []).map((u) => [u.id, u]));
    setStories((data || []).map((s: any) => ({ ...s, user: map.get(s.user_id) })));
  }

  async function fetchFeed() {
    if (!user) return;
    const authorIds = [user.id, ...following];
    if (authorIds.length === 0) return setFeed([]);

    const { data: posts } = await supabase
      .from('social_posts')
      .select('id, user_id, content, created_at')
      .in('user_id', authorIds)
      .order('created_at', { ascending: false })
      .limit(100);

    const ids = posts?.map((p) => p.user_id) || [];
    const { data: users } = await supabase
      .from('profiles')
      .select('id, username, profile_picture, xp, streak')
      .in('id', ids);

    const postIds = posts?.map((p) => p.id) || [];
    if (postIds.length === 0) return setFeed([]);

    const { data: likes } = await supabase
      .from('social_likes')
      .select('post_id, user_id')
      .in('post_id', postIds);

    const { data: comments } = await supabase
      .from('social_comments')
      .select('post_id')
      .in('post_id', postIds);

    const meLikes = new Set((likes || []).filter(l => l.user_id === user.id).map(l => l.post_id));
    const likeCounts = countBy(likes || [], 'post_id');
    const commentCounts = countBy(comments || [], 'post_id');
    const uMap = new Map((users || []).map((u) => [u.id, u]));

    setFeed(
      (posts || []).map((p) => ({
        ...p,
        user: uMap.get(p.user_id),
        likes_count: likeCounts.get(p.id) || 0,
        comments_count: commentCounts.get(p.id) || 0,
        liked_by_me: meLikes.has(p.id),
      }))
    );
  }

  function countBy<T extends Record<string, any>>(arr: T[], key: keyof T) {
    const m = new Map<string, number>();
    for (const r of arr) {
      const k = String(r[key]);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }

  /* =========================
     Actions
  ========================= */

  async function toggleFollow(targetId: string) {
    if (!user || targetId === user.id) return;
    try {
      if (following.includes(targetId)) {
        const { error } = await supabase
          .from('social_follows')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetId);
        if (error) throw error;
        setFollowing((f) => f.filter((id) => id !== targetId));
      } else {
        const { error } = await supabase
          .from('social_follows')
          .insert({ follower_id: user.id, following_id: targetId });
        if (error) throw error;
        setFollowing((f) => [...f, targetId]);
      }
    } catch (e: any) {
      toast.error(e.message || 'Follow failed');
    }
  }

  async function nudge(targetId: string) {
    if (!user || targetId === user.id) return;
    try {
      const { error } = await supabase
        .from('social_nudges')
        .insert({ to_user_id: targetId, from_user_id: user.id, message: 'Let’s study today! 💪' });
      if (error) throw error;
      toast.success('Nudge sent!');
    } catch (e: any) {
      toast.error(e.message || 'Could not nudge');
    }
  }

  async function likePost(postId: string, liked: boolean) {
    if (!user) return;
    try {
      if (liked) {
        const { error } = await supabase
          .from('social_likes')
          .delete()
          .eq('post_id', postId)
          .eq('user_id', user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('social_likes')
          .insert({ post_id: postId, user_id: user.id });
        if (error) throw error;
      }
      await fetchFeed();
    } catch {
      toast.error('Like failed');
    }
  }

  async function createPost() {
    if (!user || !postText.trim()) return;
    setPosting(true);
    try {
      const { error } = await supabase
        .from('social_posts')
        .insert({ user_id: user.id, content: postText.trim() });
      if (error) throw error;
      setPostText('');
      await fetchFeed();
    } catch {
      toast.error('Post failed');
    } finally {
      setPosting(false);
    }
  }

  async function uploadStory(file: File, text?: string) {
    if (!user) return;
    setStoryUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('stories').upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('stories').getPublicUrl(path);
      const image_url = pub.publicUrl;
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

      const { error: insErr } = await supabase
        .from('social_stories')
        .insert({ user_id: user.id, image_url, text: text || null, expires_at: expiresAt });
      if (insErr) throw insErr;

      toast.success('Story posted!');
      await fetchStories();
    } catch (e: any) {
      toast.error(e.message || 'Story upload failed');
    } finally {
      setStoryUploading(false);
    }
  }

  /* =========================
     Search (debounced)
  ========================= */

  useEffect(() => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchDebounce.current) window.clearTimeout(searchDebounce.current);
    searchDebounce.current = window.setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, bio, profile_picture, xp, streak, tier')
        .ilike('username', `%${q.trim()}%`)
        .limit(20);
      if (!error) setSearchResults((data || []).filter((p) => p.id !== user?.id));
    }, 250);
  }, [q, user?.id]);

  /* =========================
     UI Helpers
  ========================= */

  const FileInput = () => {
    const ref = useRef<HTMLInputElement | null>(null);
    return (
      <>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) uploadStory(f);
          }}
        />
        <button
          onClick={() => ref.current?.click()}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border hover:bg-gray-50 text-sm"
          disabled={storyUploading}
        >
          <ImageIcon className="w-4 h-4" />
          {storyUploading ? 'Posting…' : 'Add Story'}
        </button>
      </>
    );
  };

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  /* =========================
     Render
  ========================= */

  return (
    <div className="max-w-[1280px] mx-auto px-6 lg:px-8 py-8">
      {/* Header strip */}
      <div className="mb-8 rounded-2xl bg-gradient-to-r from-purple-50 to-blue-50 border border-purple-100 px-6 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <div className="font-semibold text-gray-800">Socials</div>
          <span className="text-sm text-gray-600">Connect, share, and keep each other accountable.</span>
        </div>
        <div className="hidden sm:flex items-center gap-3 text-sm">
          <span className="px-2.5 py-1 rounded-full bg-white border text-gray-700">Lvl {xp.level}</span>
          <span className="px-2.5 py-1 rounded-full bg-white border text-gray-700">
            <Flame className="inline w-3 h-3 -mt-0.5 text-red-600" /> {profile.streak}d
          </span>
          <span className="px-2.5 py-1 rounded-full bg-white border text-gray-700">
            <Zap className="inline w-3 h-3 -mt-0.5 text-orange-600" /> {profile.xp} XP
          </span>
        </div>
      </div>

      {/* Stories */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" /> Stories
          </h2>
          <FileInput />
        </div>
        <div className="flex gap-6 overflow-x-auto pb-3">
          <div className="flex-shrink-0 w-24">
            <button
              className="w-24 h-24 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 text-white flex items-center justify-center shadow-sm"
              title="Add Story"
              onClick={() => { /* opened via FileInput */ }}
            >
              <PlusCircle className="w-7 h-7" />
            </button>
            <div className="text-center text-xs mt-2 text-gray-600">You</div>
          </div>

          {stories.map((s) => (
            <div key={s.id} className="flex-shrink-0 w-24">
              <div className="w-24 h-24 rounded-full overflow-hidden ring-2 ring-purple-400 shadow-sm">
                <img src={s.image_url} className="w-full h-full object-cover" />
              </div>
              <div className="text-center text-xs mt-2 truncate text-gray-700">
                {s.user?.username || 'User'}
              </div>
            </div>
          ))}

          {booting && (
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </div>
          )}
        </div>
      </div>

      {/* Three columns */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr_340px] gap-8">
        {/* Left column: profile card */}
        <aside className="lg:sticky lg:top-20 self-start rounded-2xl border bg-white/90 backdrop-blur-sm shadow-sm p-6 space-y-5">
          <div className="flex items-center gap-4">
            <AvatarLarge url={profile.profile_picture} />
            <div>
              <div className="text-lg font-semibold">{profile.username}</div>
              <div className="text-xs text-gray-500">Tier: {profile.tier?.toUpperCase()}</div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm text-gray-600">
              <span>Level {xp.level}</span>
              <span>{Math.round(xp.progress * 100)}%</span>
            </div>
            <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-2.5 bg-gradient-to-r from-purple-600 to-blue-600"
                style={{ width: `${xp.progress * 100}%` }}
              />
            </div>
            <div className="text-xs text-gray-500">
              <Zap className="inline w-3 h-3 mr-1 text-orange-600" />
              {profile.xp} XP • <Flame className="inline w-3 h-3 mx-1 text-red-600" /> {profile.streak} day streak
            </div>
          </div>

          <div className="text-sm text-gray-700 leading-6">
            {profile.bio || <span className="text-gray-400">No bio yet.</span>}
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <StatCard label="Followers" value={followers.length} />
            <StatCard label="Following" value={following.length} />
            <StatCard label="Top XP" value={topXP[0]?.xp ?? profile.xp} />
          </div>
        </aside>

        {/* Center column: feed */}
        <main className="space-y-6">
          {/* Composer */}
          <div className="rounded-2xl border bg-white shadow-sm p-6">
            <div className="flex items-start gap-4">
              <Avatar url={profile.profile_picture} />
              <div className="flex-1">
                <textarea
                  value={postText}
                  onChange={(e) => setPostText(e.target.value)}
                  rows={4}
                  placeholder="Share a study update, tip, or goal…"
                  className="w-full border border-gray-300/80 rounded-xl px-4 py-3 focus:ring-2 focus:ring-purple-500 focus:border-transparent text-[15px]"
                />
                <div className="mt-3 flex items-center justify-between">
                  <div className="text-xs text-gray-500">Be kind. Motivate. No spoilers.</div>
                  <button
                    onClick={createPost}
                    disabled={posting || !postText.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-white bg-gradient-to-r from-purple-600 to-blue-600 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" /> {posting ? 'Posting…' : 'Post'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Feed posts */}
          {booting ? (
            <FeedSkeleton />
          ) : feed.length === 0 ? (
            <div className="rounded-2xl border bg-white p-12 text-center text-gray-500">
              Your feed is empty. Follow people to see their updates!
            </div>
          ) : (
            feed.map((p) => (
              <article key={p.id} className="rounded-2xl border bg-white shadow-sm p-6">
                <div className="flex items-center gap-4 mb-3">
                  <Avatar url={p.user?.profile_picture || null} />
                  <div>
                    <div className="font-medium">{p.user?.username || 'User'}</div>
                    <div className="text-xs text-gray-500">
                      <Zap className="inline w-3 h-3 mr-1 text-orange-600" />
                      {p.user?.xp ?? 0} XP • <Flame className="inline w-3 h-3 mr-1 text-red-600" /> {p.user?.streak ?? 0}d
                    </div>
                  </div>
                </div>

                <div className="whitespace-pre-wrap text-[15px] leading-7 text-gray-800">{p.content}</div>

                <div className="mt-4 flex items-center gap-5 text-sm text-gray-600">
                  <button
                    onClick={() => likePost(p.id, !!p.liked_by_me)}
                    className={`inline-flex items-center gap-1.5 hover:text-gray-900 ${p.liked_by_me ? 'text-pink-600' : ''}`}
                  >
                    <Heart className={`w-4 h-4 ${p.liked_by_me ? 'fill-pink-600' : ''}`} />
                    {p.likes_count || 0} Like
                  </button>
                  <button className="inline-flex items-center gap-1.5 hover:text-gray-900">
                    <MessageCircle className="w-4 h-4" />
                    {p.comments_count || 0} Comments
                  </button>
                </div>
              </article>
            ))
          )}
        </main>

        {/* Right column: search + suggestions + leaderboard */}
        <aside className="lg:sticky lg:top-20 self-start space-y-6">
          {/* Search */}
          <div className="rounded-2xl border bg-white shadow-sm p-6">
            <div className="flex items-center gap-2 rounded-xl border px-3 py-2">
              <Search className="w-4 h-4 text-gray-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search people…"
                className="flex-1 outline-none text-[15px]"
              />
            </div>

            {q && (
              <div className="mt-4 space-y-3 max-h-80 overflow-auto pr-1">
                {searchResults.length === 0 ? (
                  <div className="text-sm text-gray-500">No users found.</div>
                ) : (
                  searchResults.map((p) => (
                    <UserRow
                      key={p.id}
                      p={p}
                      isFollowing={following.includes(p.id)}
                      onFollow={() => toggleFollow(p.id)}
                      onNudge={() => nudge(p.id)}
                    />
                  ))
                )}
              </div>
            )}
          </div>

          {/* Suggestions grid (less cramped) */}
          <div className="rounded-2xl border bg-white shadow-sm p-6">
            <div className="font-semibold mb-3">Suggested</div>
            {suggested.length === 0 ? (
              <div className="text-sm text-gray-500">No suggestions right now.</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {suggested.slice(0, 8).map((p) => (
                  <UserCard
                    key={p.id}
                    p={p}
                    isFollowing={following.includes(p.id)}
                    onFollow={() => toggleFollow(p.id)}
                    onNudge={() => nudge(p.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div className="rounded-2xl border bg-white shadow-sm p-6">
            <div className="font-semibold flex items-center gap-2 mb-3">
              <Crown className="w-4 h-4 text-amber-500" /> Top XP
            </div>
            <div className="space-y-3">
              {topXP.map((u, i) => (
                <div key={u.id} className="flex items-center gap-3">
                  <div className="text-xs w-4 text-gray-500">{i + 1}.</div>
                  <Avatar url={u.profile_picture} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.username}</div>
                    <div className="text-xs text-gray-500 truncate">{u.xp} XP • 🔥 {u.streak}d</div>
                  </div>
                  <button
                    onClick={() => toggleFollow(u.id)}
                    className="text-xs px-2.5 py-1.5 rounded-lg border hover:bg-gray-50"
                  >
                    {following.includes(u.id) ? 'Unfollow' : 'Follow'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Nudges placeholder */}
          <div className="rounded-2xl border bg-white shadow-sm p-6">
            <div className="font-semibold flex items-center gap-2">
              <BellRing className="w-4 h-4 text-purple-600" /> Nudges & Mentions
            </div>
            <div className="text-xs text-gray-500 mt-2 leading-5">
              Show a list from <code>social_nudges</code> here (poll or subscription).
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* =========================
   Tiny components
========================= */

function Avatar({ url }: { url: string | null | undefined }) {
  return (
    <div className="w-11 h-11 rounded-full overflow-hidden bg-gray-100 shrink-0">
      {url ? (
        <img src={url} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">👤</div>
      )}
    </div>
  );
}

function AvatarLarge({ url }: { url: string | null | undefined }) {
  return (
    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-100 shrink-0">
      {url ? (
        <img src={url} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400 text-xl">👤</div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-50 rounded-xl py-3">
      <div className="font-semibold">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}

function UserRow({
  p,
  isFollowing,
  onFollow,
  onNudge,
}: {
  p: ProfileRow;
  isFollowing: boolean;
  onFollow: () => void;
  onNudge: () => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <Avatar url={p.profile_picture} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{p.username}</div>
        <div className="text-xs text-gray-500 truncate">{p.xp} XP • 🔥 {p.streak}d</div>
      </div>
      <button
        onClick={onNudge}
        className="text-xs px-2.5 py-1.5 rounded-lg border hover:bg-gray-50"
        title="Send friendly nudge"
      >
        Nudge
      </button>
      <button
        onClick={onFollow}
        className={`text-xs px-2.5 py-1.5 rounded-lg border hover:bg-gray-50 inline-flex items-center gap-1 ${isFollowing ? 'text-gray-700' : 'text-purple-700'}`}
      >
        {isFollowing ? <UserMinus className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
        {isFollowing ? 'Unfollow' : 'Follow'}
      </button>
    </div>
  );
}

function UserCard({
  p,
  isFollowing,
  onFollow,
  onNudge,
}: {
  p: ProfileRow;
  isFollowing: boolean;
  onFollow: () => void;
  onNudge: () => void;
}) {
  return (
    <div className="rounded-xl border p-3.5 hover:shadow-sm transition">
      <div className="flex items-center gap-3">
        <Avatar url={p.profile_picture} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{p.username}</div>
          <div className="text-xs text-gray-500 truncate">{p.xp} XP • 🔥 {p.streak}d</div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={onNudge}
          className="text-xs px-2.5 py-1.5 rounded-lg border hover:bg-gray-50 w-full"
          title="Send friendly nudge"
        >
          Nudge
        </button>
        <button
          onClick={onFollow}
          className={`text-xs px-2.5 py-1.5 rounded-lg border hover:bg-gray-50 w-full inline-flex items-center justify-center gap-1 ${isFollowing ? 'text-gray-700' : 'text-purple-700'}`}
        >
          {isFollowing ? <UserMinus className="w-3 h-3" /> : <UserPlus className="w-3 h-3" />}
          {isFollowing ? 'Unfollow' : 'Follow'}
        </button>
      </div>
    </div>
  );
}

function FeedSkeleton() {
  return (
    <div className="space-y-4">
      {[0,1,2].map(i => (
        <div key={i} className="rounded-2xl border bg-white p-6 animate-pulse">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-gray-200" />
            <div className="flex-1">
              <div className="h-3 w-40 bg-gray-200 rounded mb-2" />
              <div className="h-2.5 w-24 bg-gray-200 rounded" />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <div className="h-3.5 bg-gray-200 rounded w-full" />
            <div className="h-3.5 bg-gray-200 rounded w-5/6" />
            <div className="h-3.5 bg-gray-200 rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
