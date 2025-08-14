// src/pages/Socials/Socials.tsx  (Profile page – light theme revamp + contact section)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import { getXPProgress } from '../../lib/utils';
import {
  Camera, Pencil, Loader2, Trophy, Flame, Zap, Check, X, Plus, Search,
  MessageCircle, Mail
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
  username_changed_at: string | null; // for 30d lock
};

type Post = {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
};

type FriendRequest = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  requester?: Pick<ProfileRow, 'username' | 'profile_picture'>;
  addressee?: Pick<ProfileRow, 'username' | 'profile_picture'>;
};

/* =========================
   Component
========================= */

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [booting, setBooting] = useState(true);

  const [me, setMe] = useState<ProfileRow | null>(null);
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const xp = useMemo(
    () => (me ? getXPProgress(me.xp || 0) : { level: 0, progress: 0 }),
    [me]
  );

  const [myPosts, setMyPosts] = useState<Post[]>([]);
  const [activeTab, setActiveTab] = useState<'posts'>('posts');

  const [friendRequestsIncoming, setFriendRequestsIncoming] = useState<FriendRequest[]>([]);
  const [friendRequestsOutgoing, setFriendRequestsOutgoing] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<ProfileRow[]>([]);
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<ProfileRow[]>([]);
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        setBooting(true);
        await Promise.all([
          fetchMe(),
          fetchMyPosts(),
          fetchFriendRequests(),
          fetchFriends(),
        ]);
      } catch (e) {
        console.error(e);
      } finally {
        setBooting(false);
      }
    })();
  }, [user?.id]);

  async function fetchMe() {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, bio, xp, streak, tier, profile_picture, username_changed_at')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      console.error(error);
      return;
    }
    if (data) {
      setMe(data as ProfileRow);
      setUsername(data.username || '');
      setBio(data.bio || '');
    }
  }

  async function fetchMyPosts() {
    if (!user) return;
    const { data, error } = await supabase
      .from('social_posts')
      .select('id, user_id, content, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error) setMyPosts(data || []);
  }

  async function fetchFriendRequests() {
    if (!user) return;
  
    // only pending for the UI lists
    const { data: inc } = await supabase
      .from('social_friend_requests')
      .select('id, requester_id, addressee_id, status, created_at')
      .eq('addressee_id', user.id)
      .eq('status', 'pending')                 // 👈 new
      .order('created_at', { ascending: false });
  
    const { data: out } = await supabase
      .from('social_friend_requests')
      .select('id, requester_id, addressee_id, status, created_at')
      .eq('requester_id', user.id)
      .eq('status', 'pending')                 // 👈 new
      .order('created_at', { ascending: false });
  
    const ids = Array.from(
      new Set([
        ...(inc || []).map(r => r.requester_id),
        ...(out || []).map(r => r.addressee_id),
      ])
    );
  
    let profiles: any[] = [];
    if (ids.length) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, username, profile_picture')
        .in('id', ids);
      profiles = profs || [];
    }
    const pMap = new Map(profiles.map(p => [p.id, p]));
    setFriendRequestsIncoming(
      (inc || []).map(r => ({ ...r, requester: pMap.get(r.requester_id), addressee: pMap.get(r.addressee_id) }))
    );
    setFriendRequestsOutgoing(
      (out || []).map(r => ({ ...r, requester: pMap.get(r.requester_id), addressee: pMap.get(r.addressee_id) }))
    );
  }

  async function fetchFriends() {
    if (!user) return;
    const { data, error } = await supabase
      .from('social_friend_requests')
      .select('requester_id, addressee_id, status')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`);
    if (error) {
      setFriends([]);
      return;
    }
    const ids = Array.from(new Set((data || []).map(r => (r.requester_id === user.id ? r.addressee_id : r.requester_id))));
    if (!ids.length) { setFriends([]); return; }
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, username, profile_picture, xp, streak, tier')
      .in('id', ids);
    setFriends((profs || []) as any);
  }
  

  function daysUntilNextUsernameChange(): number {
    if (!me?.username_changed_at) return 0;
    const last = new Date(me.username_changed_at).getTime();
    const THIRTY_D = 30 * 24 * 60 * 60 * 1000;
    const next = last + THIRTY_D;
    const diff = next - Date.now();
    if (diff <= 0) return 0;
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
  }

  async function saveProfile() {
    if (!user || !me) return;
    const wantUsername = username.trim();
    const usernameChanged = wantUsername !== me.username;
    const daysLeft = daysUntilNextUsernameChange();
    if (usernameChanged && daysLeft > 0) {
      return toast.error(`You can change your username again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`);
    }
    if (!wantUsername) return toast.error('Username is required.');

    setSaving(true);
    try {
      const payload: Partial<ProfileRow> & { updated_at?: string } = {
        username: wantUsername,
        bio: bio.trim() || null,
        ...(usernameChanged ? { username_changed_at: new Date().toISOString() } : {}),
      };

      const { error } = await supabase
        .from('profiles')
        .update(payload)
        .eq('id', user.id);
      if (error) throw error;

      toast.success('Profile updated');
      setMe({ ...me, ...payload } as ProfileRow);
    } catch (e: any) {
      const msg = e?.message || 'Could not save profile';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }

  async function uploadAvatar(file: File) {
    if (!user) return;
    setAvatarUploading(true);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true });
      if (upErr) throw upErr;

      const pub = supabase.storage.from('avatars').getPublicUrl(path);
      const url = pub.data.publicUrl;

      const { error: updErr } = await supabase
        .from('profiles')
        .update({ profile_picture: url })
        .eq('id', user.id);
      if (updErr) throw updErr;

      setMe(m => (m ? { ...m, profile_picture: url } : m));
      toast.success('Avatar updated');
    } catch (e: any) {
      toast.error(e.message || 'Avatar upload failed');
    } finally {
      setAvatarUploading(false);
    }
  }

  async function sendFriendRequest(targetId: string) {
    if (!user || targetId === user.id) return;
    const { error } = await supabase
      .from('social_friend_requests')
      .insert({ requester_id: user.id, addressee_id: targetId, status: 'pending' });
    if (error) return toast.error('Could not send request');
    toast.success('Friend request sent');
    await fetchFriendRequests();
  }

  // Attempt to notify another user (best-effort; table may vary). Silent on failure.
  async function notifyUser(recipientId: string, type: string, content: string) {
    if (!user) return;
    const { error } = await supabase
      .from('social_notifications')
      .insert({
        user_id: recipientId,
        type,
        content,
        created_by: user.id
      });
    if (error) {
      // keep it quiet in prod; helpful when developing
      console.warn('notifyUser skipped:', error.message);
    }
  }
  
  

  // replace acceptFriendRequest with this
async function acceptFriendRequest(reqId: string) {
  if (!user) return;
  const { error } = await supabase
    .from('social_friend_requests')
    .update({ status: 'accepted' })
    .eq('id', reqId)
    .eq('addressee_id', user.id); // safeguard: only the addressee can accept

  if (error) {
    console.warn('[acceptFriendRequest]', error);
    return toast.error('Could not accept');
  }

  toast.success('Friend request accepted');
  // optional: optimistic remove so UI updates instantly
  setFriendRequestsIncoming(prev => prev.filter(r => r.id !== reqId));

  // best-effort notify (no-op if you disabled it)
  try {
    const req = friendRequestsIncoming.find(r => r.id === reqId);
    if (req?.requester_id) {
      await notifyUser(req.requester_id, 'friend_request.accepted', `${me?.username || 'Someone'} accepted your friend request`);
    }
  } catch {}
  
  await fetchFriendRequests();
}

// replace declineFriendRequest with this
async function declineFriendRequest(reqId: string) {
  if (!user) return;
  const { error } = await supabase
    .from('social_friend_requests')
    .update({ status: 'declined' })
    .eq('id', reqId)
    .eq('addressee_id', user.id);

  if (error) {
    console.warn('[declineFriendRequest]', error);
    return toast.error('Could not decline');
  }

  toast.success('Declined');
  setFriendRequestsIncoming(prev => prev.filter(r => r.id !== reqId));
  await fetchFriendRequests();
}


  // Bulk actions
  async function acceptAllFriendRequests() {
    if (!user) return;
    const { data, error } = await supabase
      .from('social_friend_requests')
      .update({ status: 'accepted' })
      .eq('addressee_id', user.id)
      .eq('status', 'pending')
      .select('requester_id');
    if (error) return toast.error('Could not accept all');
    toast.success('Accepted all pending');
    if (Array.isArray(data)) {
      for (const r of data) await notifyUser(r.requester_id, 'friend_request.accepted', `${me?.username || 'Someone'} accepted your friend request`);
    }
    await fetchFriendRequests();
  }

  async function declineAllFriendRequests() {
    if (!user) return;
    const { data, error } = await supabase
      .from('social_friend_requests')
      .update({ status: 'declined' })
      .eq('addressee_id', user.id)
      .eq('status', 'pending')
      .select('requester_id');
    if (error) return toast.error('Could not decline all');
    toast.success('Declined all pending');
    if (Array.isArray(data)) {
      for (const r of data) await notifyUser(r.requester_id, 'friend_request.declined', `${me?.username || 'Someone'} declined your friend request`);
    }
    await fetchFriendRequests();
  }

  useEffect(() => {
    if (!searchQ.trim()) {
      setSearchResults([]);
      return;
    }
    if (searchDebounce.current) clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, profile_picture, xp, streak, tier, bio')
        .ilike('username', `%${searchQ.trim()}%`)
        .limit(20);
      if (!error) setSearchResults((data || []).filter((p) => p.id !== user?.id) as any);
    }, 250);
    return () => {
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
    };
  }, [searchQ, user?.id]);

  if (!user || booting || !me) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-gray-700" />
      </div>
    );
  }

  const daysLeft = daysUntilNextUsernameChange();

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
              <Zap className="w-5 h-5 text-gray-700" />
            </div>
            <h1 className="text-lg font-bold">Your Profile</h1>
          </div>
          <div className="hidden md:flex items-center gap-3 text-sm">
            <Badge icon={<Trophy className="w-4 h-4" />} text={`Level ${xp.level}`} />
            <Badge icon={<Flame className="w-4 h-4" />} text={`${me.streak}d streak`} />
            <Badge icon={<Zap className="w-4 h-4" />} text={`${me.xp} XP`} />
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left */}
        <section className="lg:col-span-8 space-y-6">
          {/* Profile editor */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <div className="flex items-start gap-6">
              <AvatarEditable
                url={me.profile_picture}
                uploading={avatarUploading}
                onPick={(f) => uploadAvatar(f)}
              />
              <div className="flex-1 grid sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                  <div className="flex items-center">
                    <span className="px-3 py-2 rounded-l-lg border border-r-0 border-neutral-200 bg-gray-100 text-gray-500">@</span>
                    <input
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      className="w-full px-3 py-2 rounded-r-lg border border-neutral-200 bg-white focus:ring-2 focus:ring-gray-400 outline-none"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {daysLeft > 0
                      ? `You can change your username again in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.`
                      : 'You can change your username now.'}
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell people a bit about you…"
                    className="w-full min-h-[100px] px-3 py-2 rounded-lg border border-neutral-200 bg-white focus:ring-2 focus:ring-gray-400 outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">Your avatar and bio are public.</p>
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                onClick={saveProfile}
                disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white bg-gray-800 hover:bg-gray-700 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>

          {/* Posts */}
          <div className="bg-white rounded-2xl border border-neutral-200">
            <div className="px-6 pt-6">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveTab('posts')}
                  className={`px-3 py-1.5 rounded-lg text-sm ${activeTab === 'posts' ? 'bg-gray-800 text-white' : 'text-gray-700 hover:bg-gray-100'}`}
                >
                  Posts
                </button>
              </div>
            </div>

            <div className="p-6 pt-4">
              {activeTab === 'posts' && (
                <div className="space-y-4">
                  {myPosts.length === 0 ? (
                    <EmptyState icon={<MessageCircle className="w-6 h-6" />} title="No posts yet" subtitle="When you post, they’ll show up here." />
                  ) : (
                    myPosts.map(p => (
                      <div key={p.id} className="p-4 border border-neutral-200 rounded-xl">
                        <div className="text-sm text-gray-500">{new Date(p.created_at).toLocaleString()}</div>
                        <p className="mt-1 text-gray-900 whitespace-pre-wrap">{p.content}</p>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right */}
        <aside className="lg:col-span-4 space-y-6">
          {/* Friends */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <h3 className="font-bold text-gray-900 mb-3">Friends ({friends.length})</h3>
            {friends.length === 0 ? (
              <div className="text-sm text-gray-500">No friends yet</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {friends.map((f) => (
                  <div key={f.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <AvatarPlain url={f.profile_picture} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">@{f.username}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Friend Requests */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-gray-900">Friend Requests</h3>
              <div className="flex gap-2">
                <button onClick={acceptAllFriendRequests} className="px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-white hover:bg-gray-700">Accept all</button>
                <button onClick={declineAllFriendRequests} className="px-3 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-800 hover:bg-gray-200">Decline all</button>
              </div>
            </div>
            <RequestSection
              incoming={friendRequestsIncoming}
              outgoing={friendRequestsOutgoing}
              onAccept={(id) => acceptFriendRequest(id)}
              onDecline={(id) => declineFriendRequest(id)}
            />
          </div>

          {/* Search */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <h3 className="font-bold text-gray-900 mb-4">Find people</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search username…"
                className="w-full pl-10 pr-3 py-2.5 rounded-lg border border-neutral-200 bg-white focus:ring-2 focus:ring-gray-400 outline-none"
              />
            </div>
            <div className="mt-4 space-y-3 max-h-72 overflow-y-auto">
              {searchResults.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-6">No results</div>
              ) : (
                searchResults.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <AvatarPlain url={p.profile_picture} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">@{p.username}</div>
                      <div className="text-xs text-gray-500 truncate">{p.bio || 'Learner'}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => sendFriendRequest(p.id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs bg-gray-800 text-white hover:bg-gray-700"
                        title="Add friend"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Contact Us */}
          <div className="bg-white rounded-2xl border border-neutral-200 p-6">
            <h3 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
              <Mail className="w-5 h-5 text-gray-600" />
              Contact Us
            </h3>
            <p className="text-sm text-gray-600">
              Need help or have feedback? Email us at{' '}
              <a
                href="mailto:project.ib45@gmail.com"
                className="text-gray-900 underline underline-offset-2 hover:text-gray-700"
              >
                project.ib45@gmail.com
              </a>.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* =========================
   Bits & Pieces (light theme)
========================= */

function Badge({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border border-neutral-200 bg-white text-gray-700">
      {icon}
      {text}
    </div>
  );
}

function AvatarEditable({
  url,
  uploading,
  onPick,
}: {
  url: string | null;
  uploading: boolean;
  onPick: (f: File) => void;
}) {
  const ref = React.useRef<HTMLInputElement | null>(null);
  return (
    <div className="relative w-24 h-24 rounded-full overflow-hidden ring-2 ring-neutral-200 shadow-sm bg-gray-100">
      {url ? (
        <img src={url} alt="Avatar" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-2xl text-gray-400">👤</div>
      )}
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
          if (ref.current) ref.current.value = '';
        }}
      />
      <button
        onClick={() => ref.current?.click()}
        className="absolute bottom-1 right-1 p-1.5 rounded-full bg-gray-800 text-white hover:bg-gray-700 disabled:opacity-60"
        title="Change avatar"
        disabled={uploading}
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
      </button>
    </div>
  );
}

function AvatarPlain({ url }: { url: string | null }) {
  return (
    <div className="w-9 h-9 rounded-full overflow-hidden bg-gray-100 ring-1 ring-neutral-200">
      {url ? (
        <img src={url} alt="Avatar" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">👤</div>
      )}
    </div>
  );
}

function EmptyState({ icon, title, subtitle }: { icon: React.ReactNode; title: string; subtitle: string }) {
  return (
    <div className="text-center py-12">
      <div className="w-12 h-12 rounded-full bg-gray-100 mx-auto mb-3 flex items-center justify-center text-gray-600">
        {icon}
      </div>
      <div className="font-semibold text-gray-900">{title}</div>
      <div className="text-sm text-gray-500">{subtitle}</div>
    </div>
  );
}

function RequestSection({
  incoming,
  outgoing,
  onAccept,
  onDecline,
}: {
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs font-semibold text-gray-500 mb-2">Incoming</div>
        {incoming.length === 0 ? (
          <div className="text-sm text-gray-500">No incoming friend requests</div>
        ) : (
          <div className="space-y-2">
            {incoming.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-2 border border-neutral-200 rounded-lg">
                <AvatarPlain url={r.requester?.profile_picture || null} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">@{r.requester?.username || 'user'}</div>
                  <div className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onAccept(r.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-gray-800 text-white hover:bg-gray-700"
                    title="Accept"
                  >
                    <Check className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onDecline(r.id)}
                    className="px-2.5 py-1.5 rounded-lg text-xs bg-gray-100 text-gray-800 hover:bg-gray-200"
                    title="Decline"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-500 mb-2">Outgoing</div>
        {outgoing.length === 0 ? (
          <div className="text-sm text-gray-500">No outgoing friend requests</div>
        ) : (
          <div className="space-y-2">
            {outgoing.map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-2 border border-neutral-200 rounded-lg">
                <AvatarPlain url={r.addressee?.profile_picture || null} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-gray-900 truncate">@{r.addressee?.username || 'user'}</div>
                  <div className="text-xs text-gray-500">{new Date(r.created_at).toLocaleString()}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-700 capitalize">{r.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
