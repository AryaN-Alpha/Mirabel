import { useRef } from "react";
import { Send } from "lucide-react";

export default function ChatInput({ onSend, disabled }) {
  const ref = useRef(null);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  function submit() {
    const value = ref.current?.value.trim();
    if (!value || disabled) return;
    ref.current.value = "";
    onSend(value);
  }

  return (
    <div className="flex items-end gap-2 px-4 py-3 border-t border-zinc-700 bg-zinc-900">
      <textarea
        ref={ref}
        rows={1}
        disabled={disabled}
        onKeyDown={handleKeyDown}
        placeholder="say something…"
        className="flex-1 resize-none rounded-xl bg-zinc-800 text-zinc-100 placeholder-zinc-500 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
      />
      <button
        onClick={submit}
        disabled={disabled}
        className="p-2.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 transition-colors"
        aria-label="Send"
      >
        <Send size={16} className="text-white" />
      </button>
    </div>
  );
}
