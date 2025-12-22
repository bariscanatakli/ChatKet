import { useState, useEffect } from 'react';
import type { User, UserProfile } from '../types';
import { usersApi, dmApi } from '../services/api';

interface UserProfileViewProps {
  token: string;
  user: User;
  currentUserId: string;
  isOpen: boolean;
  onClose: () => void;
  onStartDM?: (conversationId: string, otherUser: UserProfile) => void;
}

export function UserProfileView({ token, user, currentUserId, isOpen, onClose, onStartDM }: UserProfileViewProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [startingDM, setStartingDM] = useState(false);

  useEffect(() => {
    if (isOpen && user.username) {
      loadProfile();
    }
  }, [isOpen, user.username]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const data = await usersApi.getProfile(token, user.username);
      setProfile(data);
    } catch (err) {
      console.error('Failed to load profile:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStartDM = async () => {
    if (!profile || profile.id === currentUserId) return;
    
    setStartingDM(true);
    try {
      const conversation = await dmApi.startConversation(token, profile.id);
      onStartDM?.(conversation.id, profile);
      onClose();
    } catch (err) {
      console.error('Failed to start DM:', err);
    } finally {
      setStartingDM(false);
    }
  };

  if (!isOpen) return null;

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const getDefaultAvatarColor = (username: string) => {
    const colors = [
      'from-violet-500 to-purple-600',
      'from-blue-500 to-cyan-600',
      'from-emerald-500 to-teal-600',
      'from-orange-500 to-amber-600',
      'from-pink-500 to-rose-600',
      'from-indigo-500 to-blue-600',
    ];
    const index = username.charCodeAt(0) % colors.length;
    return colors[index];
  };

  const avatarColor = profile?.avatarColor || getDefaultAvatarColor(user.username);

  return (
    <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">User Profile</h2>
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
            {/* Avatar */}
            <div className="flex flex-col items-center">
              <div className={`w-24 h-24 rounded-2xl bg-gradient-to-br ${avatarColor} flex items-center justify-center shadow-lg mb-3`}>
                <span className="text-white font-bold text-3xl">
                  {getInitials(profile.displayName || profile.username)}
                </span>
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                {profile.displayName || profile.username}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">@{profile.username}</p>
            </div>

            {/* Status */}
            {profile.status && (
              <div className="text-center">
                <span className="inline-flex items-center px-3 py-1.5 bg-slate-100 dark:bg-slate-700 rounded-full text-sm text-slate-600 dark:text-slate-300">
                  {profile.status}
                </span>
              </div>
            )}

            {/* Bio */}
            {profile.bio && (
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{profile.bio}</p>
              </div>
            )}

            {/* Member since */}
            <div className="text-center text-sm text-slate-500 dark:text-slate-400">
              Member since {new Date(profile.createdAt).toLocaleDateString()}
            </div>

            {/* Actions */}
            {profile.id !== currentUserId && (
              <button
                onClick={handleStartDM}
                disabled={startingDM}
                className="w-full flex items-center justify-center space-x-2 px-4 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-400 text-white rounded-xl font-medium transition-all"
              >
                {startingDM ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Starting...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span>Send Message</span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-slate-500 dark:text-slate-400">
            Failed to load profile
          </div>
        )}
      </div>
    </div>
  );
}
