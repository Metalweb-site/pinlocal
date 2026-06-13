'use client'

const EMOJIS = [
  '😀', '😂', '🤣', '😊', '😍', '🥰', '😎', '😭',
  '😡', '😮', '🙏', '👏', '👍', '👎', '🤝', '💪',
  '❤️', '🔥', '✨', '🎉', '✅', '🚨', '📢', '📍',
  '🏠', '⚽', '🍕', '🛒', '🐾', '📷', '🎥', '💬',
]

export default function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="grid w-[252px] grid-cols-8 gap-1 rounded-[12px] border border-[#D7DFF0] bg-white p-2 shadow-2xl">
      {EMOJIS.map(emoji => (
        <button
          key={emoji}
          type="button"
          onClick={() => onSelect(emoji)}
          className="grid h-8 w-8 place-items-center rounded-[8px] text-[18px] transition-colors hover:bg-[#F1F5FF]"
          aria-label={`Insert ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
