import React, { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { Navigate, useNavigate } from 'react-router-dom';
import { AlertTriangle, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const IB_SUBJECTS = [
  'Mathematics AA','Mathematics AI','Physics','Chemistry','Biology',
  'Computer Science','English Lang & Lit','Economics','Business',
  'History','Geography','Psychology','Spanish','French','Environmental Systems'
];

const MIN = 3, MAX = 6;

export default function SubjectSetup() {
  const { user } = useAuthStore();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);

  // block if not signed in
  if (!user) return <Navigate to="/login" replace />;

  // load current subjects so user can edit
  useEffect(() => {
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const { data, error } = await supabase.rpc('get_my_subjects');
        if (error) throw error;
        setSelected((data || []).map((r: any) => r.name));
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to load your subjects.');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.id]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      if (prev.includes(name)) return prev.filter(x => x !== name);
      if (prev.length >= MAX) return prev;
      return [...prev, name];
    });

  const canSave = useMemo(
    () => selected.length >= MIN && selected.length <= MAX,
    [selected]
  );

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      // replace: delete old, then insert new via RPC
      await supabase.from('user_subjects').delete().eq('user_id', user!.id);
      const { error } = await supabase.rpc('set_initial_subjects', {
        p_subject_names: selected,
      });
      if (error) throw error;
      toast.success('Subjects saved!');
      nav('/ai'); // or wherever your LearnHub route is
    } catch (e: any) {
      toast.error(e?.message ?? 'Could not save subjects.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow p-6">
        <h1 className="text-2xl font-bold mb-1">Pick your IB subjects</h1>
        <p className="text-gray-600 mb-4">Choose {MIN}–{MAX}. You can change this later.</p>

        {loading ? (
          <div className="text-gray-500">Loading…</div>
        ) : (
          <>
            {err && (
              <p className="mb-3 text-sm text-red-600 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> {err}
              </p>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              {IB_SUBJECTS.map((s) => {
                const active = selected.includes(s);
                const disabled = selected.length >= MAX && !active;
                return (
                  <button
                    key={s}
                    onClick={() => toggle(s)}
                    disabled={disabled}
                    className={`px-3 py-2 text-sm rounded border transition ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : `bg-gray-50 border-gray-200 hover:bg-gray-100 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            <div className="text-sm text-gray-600 mb-4">
              <span className="font-medium">{selected.length}</span> selected (max {MAX})
              {selected.length < MIN && (
                <span className="ml-2 inline-flex items-center gap-1 text-red-600">
                  <AlertTriangle className="w-4 h-4" /> Pick at least {MIN}.
                </span>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => nav(-1)}
                className="flex-1 border rounded-lg py-2 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!canSave || saving}
                className="flex-1 rounded-lg py-2 text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving…' : (<span className="inline-flex items-center gap-2"><Check className="w-4 h-4" /> Save</span>)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
