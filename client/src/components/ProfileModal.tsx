import { useState, useEffect } from 'react';
import type { UserProfile } from '../types';
import { usersApi } from '../services/api';

interface ProfileModalProps {
  token: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdate?: (profile: UserProfile) => void;
}

const AVATAR_COLORS = [
  { name: 'Violet', value: 'from-violet-500 to-purple-600' },
  { name: 'Blue', value: 'from-blue-500 to-cyan-600' },
  { name: 'Emerald', value: 'from-emerald-500 to-teal-600' },
  { name: 'Orange', value: 'from-orange-500 to-amber-600' },
  { name: 'Pink', value: 'from-pink-500 to-rose-600' },
  { name: 'Indigo', value: 'from-indigo-500 to-blue-600' },
];

export function ProfileModal({ token, isOpen, onClose, onUpdate }: ProfileModalProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [status, setStatus] = useState('');
  const [avatarColor, setAvatarColor] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadProfile();
    }
  }, [isOpen]);

  const loadProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await usersApi.getMyProfile(token);
      setProfile(data);
      setDisplayName(data.displayName || '');
      setBio(data.bio || '');
      setStatus(data.status || '');
      setAvatarColor(data.avatarColor || AVATAR_COLORS[0].value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const updated = await usersApi.updateMyProfile(token, {
        displayName: displayName || undefined,
        bio: bio || undefined,
        status: status || undefined,
        avatarColor,
      });
      setProfile(updated);
      onUpdate?.(updated);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  return (
    <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">Edit Profile</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : profile ? (
          <div className="space-y-6">
            {/* Avatar Preview */}
            <div className="flex flex-col items-center">
              <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${avatarColor || AVATAR_COLORS[0].value} flex items-center justify-center shadow-lg mb-3`}>
                <span className="text-white font-bold text-2xl">
                  {getInitials(displayName || profile.username)}
                </span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400">@{profile.username}</p>
            </div>

            {/* Avatar Color Selection */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Avatar Color
              </label>
              <div className="flex flex-wrap gap-2">
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setAvatarColor(color.value)}
                    className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color.value} transition-all ${
                      avatarColor === color.value ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-slate-800' : ''
                    }`}
                    title={color.name}
                  />
                ))}
              </div>
            </div>

            {/* Display Name */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 50))}
                placeholder={profile.username}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-700 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-all"
              />
              <p className="text-xs text-slate-400 mt-1">{displayName.length}/50</p>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Status
              </label>
              <input
                type="text"
                value={status}
                onChange={(e) => setStatus(e.target.value.slice(0, 100))}
                placeholder="What's on your mind?"
                className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-700 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-all"
              />
              <p className="text-xs text-slate-400 mt-1">{status.length}/100</p>
            </div>

            {/* Bio */}
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 200))}
                placeholder="Tell us about yourself..."
                rows={3}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-700 border-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 text-slate-800 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 transition-all resize-none"
              />
              <p className="text-xs text-slate-400 mt-1">{bio.length}/200</p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm">
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex space-x-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 px-4 border border-slate-200 dark:border-slate-600 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl hover:from-blue-600 hover:to-blue-700 disabled:from-slate-300 disabled:to-slate-400 font-medium shadow-lg shadow-blue-500/25 disabled:shadow-none transition-all flex items-center justify-center"
              >
                {saving ? (
                  <>
                    <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Saving...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
