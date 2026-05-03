import { motion, AnimatePresence } from "framer-motion";

export default function Sprite({ mood }) {
  return (
    <div className="flex items-center justify-center w-full h-full">
      <AnimatePresence mode="wait">
        <motion.img
          key={mood}
          src={`/sprites/${mood}.png`}
          alt={`Mirabel is feeling ${mood}`}
          className="max-h-full max-w-full object-contain drop-shadow-lg"
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.92 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        />
      </AnimatePresence>
    </div>
  );
}
