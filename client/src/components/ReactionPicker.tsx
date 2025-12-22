interface ReactionPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🎉', '🔥', '👎'];

export function ReactionPicker({ onSelect, onClose }: ReactionPickerProps) {
  return (
    <div className="relative">
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />
      
      {/* Picker */}
      <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 bg-white dark:bg-slate-700 rounded-2xl shadow-xl shadow-slate-200/50 dark:shadow-slate-900/50 p-2 flex items-center space-x-1 animate-in fade-in slide-in-from-bottom-2 duration-200">
        {EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => {
              onSelect(emoji);
              onClose();
            }}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-600 rounded-xl transition-all hover:scale-125 text-xl"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}

interface ReactionsDisplayProps {
  reactions: Array<{
    emoji: string;
    count: number;
    users: string[];
    hasReacted?: boolean;
  }>;
  onToggleReaction: (emoji: string) => void;
  compact?: boolean;
}

export function ReactionsDisplay({ reactions, onToggleReaction, compact = false }: ReactionsDisplayProps) {
  if (reactions.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${compact ? 'mt-1' : 'mt-2'}`}>
      {reactions.map((reaction) => (
        <button
          key={reaction.emoji}
          onClick={() => onToggleReaction(reaction.emoji)}
          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-sm transition-all ${
            reaction.hasReacted
              ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
          }`}
          title={reaction.users.join(', ')}
        >
          <span>{reaction.emoji}</span>
          <span className="font-medium">{reaction.count}</span>
        </button>
      ))}
    </div>
  );
}
