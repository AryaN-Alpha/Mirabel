import { useEffect, useRef } from "react";
import clsx from "clsx";

export default function MessageList({ messages }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
      {messages.map((msg) => (
        <div
          key={msg.id}
          className={clsx(
            "max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed",
            msg.role === "user"
              ? "self-end bg-indigo-500 text-white rounded-br-sm"
              : "self-start bg-zinc-800 text-zinc-100 rounded-bl-sm"
          )}
        >
          {msg.text}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
