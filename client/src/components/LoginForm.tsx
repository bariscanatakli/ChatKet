import React, { useState } from 'react';
import { authApi } from '../services/api';

interface LoginFormProps {
  onLogin: (token: string, user: { id: string; username: string }) => void;
}

export function LoginForm({ onLogin }: LoginFormProps) {
  const [step, setStep] = useState<'username' | 'code'>('username');
  const [username, setUsername] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await authApi.requestCode(username);
      if (response.code) {
        setDevCode(response.code);
      }
      setStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request code');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await authApi.verifyCode(username, code);
      onLogin(response.accessToken, response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    setStep('username');
    setCode('');
    setDevCode(null);
    setError(null);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/4 -right-1/4 w-1/2 h-1/2 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-1/4 -left-1/4 w-1/2 h-1/2 bg-indigo-500/20 rounded-full blur-3xl" />
      </div>

      <div className="relative bg-white/10 backdrop-blur-xl p-8 rounded-3xl shadow-2xl w-full max-w-md border border-white/20">
        {/* Logo/Brand */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">
            ChatKet
          </h1>
          <p className="text-blue-200/70 text-sm">Real-time chat, reimagined</p>
        </div>

        {step === 'username' ? (
          <form onSubmit={handleRequestCode}>
            <div className="mb-6">
              <label htmlFor="username" className="block text-sm font-medium text-blue-100 mb-2">
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/20 text-white placeholder-blue-200/50 transition-all"
                placeholder="Enter your username"
                pattern="^[A-Za-z0-9_]{3,20}$"
                title="3-20 characters, letters, numbers, and underscores only"
                required
                disabled={loading}
              />
              <p className="text-xs text-blue-200/50 mt-2">
                3-20 characters, letters, numbers, and underscores only
              </p>
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl text-sm flex items-center space-x-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !username}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 px-4 rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:from-slate-500 disabled:to-slate-600 disabled:cursor-not-allowed transition-all font-medium shadow-lg shadow-blue-500/25 disabled:shadow-none flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Requesting...</span>
                </>
              ) : (
                <>
                  <span>Get Login Code</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode}>
            <div className="mb-6">
              <button
                type="button"
                onClick={handleBack}
                className="text-blue-300 hover:text-blue-100 text-sm mb-4 flex items-center space-x-1 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span>Back</span>
              </button>

              <p className="text-blue-100 mb-4">
                Enter the 6-digit code for <strong className="text-white">{username}</strong>
              </p>

              {devCode && (
                <div className="mb-4 p-4 bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 rounded-xl">
                  <div className="text-xs uppercase tracking-wide mb-1 text-emerald-300/70">Development Code</div>
                  <code className="font-mono text-2xl font-bold tracking-widest">{devCode}</code>
                </div>
              )}

              <label htmlFor="code" className="block text-sm font-medium text-blue-100 mb-2">
                Login Code
              </label>
              <input
                type="text"
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                className="w-full px-4 py-4 bg-white/10 border border-white/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/20 text-white text-center text-3xl tracking-[0.5em] font-mono placeholder-blue-200/30 transition-all"
                placeholder="••••••"
                maxLength={6}
                required
                disabled={loading}
                autoFocus
              />
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 text-red-200 rounded-xl text-sm flex items-center space-x-2">
                <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className="w-full bg-gradient-to-r from-blue-500 to-indigo-600 text-white py-3 px-4 rounded-xl hover:from-blue-600 hover:to-indigo-700 disabled:from-slate-500 disabled:to-slate-600 disabled:cursor-not-allowed transition-all font-medium shadow-lg shadow-blue-500/25 disabled:shadow-none flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <span>Login</span>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
