import { useEffect, useState } from 'react';
import type { DMNewEvent } from '../types';

interface DMNotification extends DMNewEvent {
  id: string;
}

interface DMNotificationToastProps {
  notifications: DMNotification[];
  onDismiss: (id: string) => void;
  onClick: (notification: DMNotification) => void;
}

export function DMNotificationToast({ notifications, onDismiss, onClick }: DMNotificationToastProps) {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm">
      {notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          notification={notification}
          onDismiss={() => onDismiss(notification.id)}
          onClick={() => onClick(notification)}
        />
      ))}
    </div>
  );
}

function NotificationItem({ 
  notification, 
  onDismiss, 
  onClick 
}: { 
  notification: DMNotification; 
  onDismiss: () => void; 
  onClick: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const showTimer = setTimeout(() => setIsVisible(true), 10);
    
    // Auto dismiss after 5 seconds
    const dismissTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 300); // Wait for animation
    }, 5000);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(dismissTimer);
    };
  }, [onDismiss]);

  const getInitials = (name: string) => name.slice(0, 2).toUpperCase();

  const getAvatarColor = (username: string) => {
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

  return (
    <div
      className={`transform transition-all duration-300 ${
        isVisible ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0'
      }`}
    >
      <div
        onClick={onClick}
        className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
      >
        <div className="flex items-start space-x-3">
          <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${getAvatarColor(notification.sender.username)} flex items-center justify-center flex-shrink-0`}>
            <span className="text-white font-medium text-sm">
              {getInitials(notification.sender.username)}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {notification.sender.username}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsVisible(false);
                  setTimeout(onDismiss, 300);
                }}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 -m-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 truncate mt-0.5">
              {notification.text}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              Direct message • Just now
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Hook for managing DM notifications
export function useDMNotifications() {
  const [notifications, setNotifications] = useState<DMNotification[]>([]);

  const addNotification = (dm: DMNewEvent) => {
    const notification: DMNotification = {
      ...dm,
      id: `${dm.id}-${Date.now()}`,
    };
    setNotifications((prev) => [...prev, notification]);
  };

  const dismissNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const clearAll = () => {
    setNotifications([]);
  };

  return {
    notifications,
    addNotification,
    dismissNotification,
    clearAll,
  };
}
