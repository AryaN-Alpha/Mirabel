import { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check, Search, X } from "lucide-react";

/**
 * CustomSelect - A premium, highly visible, glassmorphic dropdown component.
 *
 * @param {Array} options - Array of strings or objects [{ value, label, badge, badgeColor, icon, subtitle }] or [{ id, label }]
 * @param {any} value - Currently selected value
 * @param {Function} onChange - (value) => void
 * @param {string} placeholder - Placeholder when no selection
 * @param {boolean} disabled - Whether the dropdown is disabled
 * @param {"pill" | "input" | "card"} variant - Visual style variant
 * @param {"sm" | "md" | "lg"} size - Size variant
 * @param {boolean} searchable - Whether to show search box inside popup (auto true if > 7 options)
 * @param {React.ReactNode} icon - Left icon in trigger button
 * @param {string} className - Additional trigger classes
 * @param {Object} style - Trigger style overrides
 * @param {string} menuClassName - Additional menu classes
 * @param {Object} menuStyle - Menu style overrides
 * @param {"left" | "right" | "full"} align - Menu horizontal alignment
 */
export default function CustomSelect({
  options = [],
  value,
  onChange,
  placeholder = "Select an option",
  disabled = false,
  variant = "pill",
  size = "md",
  searchable = undefined,
  icon: LeftIcon,
  className = "",
  style = {},
  menuClassName = "",
  menuStyle = {},
  align = "full",
  id,
  name,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);
  const listRef = useRef(null);

  // Normalize options to a standard shape: { value, label, badge, badgeColor, icon, subtitle, raw }
  const normalizedOptions = useMemo(() => {
    return options.map((opt) => {
      if (typeof opt === "string" || typeof opt === "number") {
        return {
          value: opt,
          label: String(opt),
          raw: opt,
        };
      }
      const val = opt.value !== undefined ? opt.value : opt.id !== undefined ? opt.id : opt.label;
      const lbl = opt.label !== undefined ? opt.label : String(opt.value || opt.id);
      return {
        value: val,
        label: lbl,
        badge: opt.badge,
        badgeColor: opt.badgeColor,
        icon: opt.icon,
        subtitle: opt.subtitle,
        raw: opt,
      };
    });
  }, [options]);

  const selectedOption = useMemo(() => {
    return normalizedOptions.find((opt) => opt.value === value);
  }, [normalizedOptions, value]);

  // Determine if search should be enabled
  const shouldSearch = searchable !== undefined ? searchable : normalizedOptions.length > 7;

  // Filter options based on search query
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return normalizedOptions;
    const q = searchQuery.toLowerCase().trim();
    return normalizedOptions.filter(
      (opt) =>
        opt.label.toLowerCase().includes(q) ||
        (opt.subtitle && opt.subtitle.toLowerCase().includes(q)) ||
        (opt.badge && opt.badge.toLowerCase().includes(q))
    );
  }, [normalizedOptions, searchQuery]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchQuery("");
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Auto-focus search input on open
  useEffect(() => {
    if (isOpen && shouldSearch && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
    if (isOpen) {
      const idx = filteredOptions.findIndex((opt) => opt.value === value);
      setHighlightedIndex(idx >= 0 ? idx : 0);
    }
  }, [isOpen, shouldSearch, value, filteredOptions]);

  // Handle keyboard navigation
  function handleKeyDown(e) {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "Escape":
        e.preventDefault();
        setIsOpen(false);
        setSearchQuery("");
        break;
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (filteredOptions[highlightedIndex]) {
          selectOption(filteredOptions[highlightedIndex]);
        }
        break;
      case "Tab":
        setIsOpen(false);
        setSearchQuery("");
        break;
      default:
        break;
    }
  }

  function selectOption(option) {
    if (!option) return;
    onChange?.(option.value, option.raw);
    setIsOpen(false);
    setSearchQuery("");
  }

  // Variant styles for trigger
  const variantClasses = {
    pill: "rounded-full px-3.5 py-2 text-[12.5px]",
    input: "rounded-xl px-3.5 py-2.5 text-[13px] w-full",
    card: "rounded-2xl px-4 py-3 text-[13.5px] w-full",
  }[variant] || "rounded-full px-3.5 py-2 text-[12.5px]";

  const sizeClasses = {
    sm: "text-[12px] py-1.5 px-3",
    md: "text-[13px] py-2 px-3.5",
    lg: "text-[14px] py-2.5 px-4",
  }[size] || "";

  return (
    <div
      ref={containerRef}
      className={`relative inline-block ${variant === "input" || variant === "card" ? "w-full" : ""}`}
      onKeyDown={handleKeyDown}
      id={id}
    >
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        name={name}
        className={`group relative flex items-center justify-between gap-2.5 transition-all duration-200 cursor-pointer select-none text-left outline-none ${variantClasses} ${sizeClasses} ${className}`}
        style={{
          background: isOpen
            ? "rgba(42, 28, 24, 0.95)"
            : "rgba(34, 23, 20, 0.72)",
          backdropFilter: "blur(12px)",
          border: isOpen
            ? "1px solid rgba(240, 168, 120, 0.55)"
            : "1px solid rgba(240, 168, 120, 0.22)",
          color: "#f7ece4",
          boxShadow: isOpen
            ? "0 0 16px rgba(240, 168, 120, 0.18), 0 4px 14px rgba(0, 0, 0, 0.3)"
            : "0 2px 8px rgba(0, 0, 0, 0.2)",
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
          ...style,
        }}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {LeftIcon && (
            <span className="shrink-0 text-[#f0a878]/75 group-hover:text-[#f0a878] transition-colors">
              {typeof LeftIcon === "function" ? <LeftIcon size={14} /> : LeftIcon}
            </span>
          )}

          {selectedOption ? (
            <div className="flex items-center gap-1.5 truncate">
              {selectedOption.icon && (
                <span className="shrink-0">{selectedOption.icon}</span>
              )}
              <span className="truncate font-medium text-[#f7ece4]">
                {selectedOption.label}
              </span>
              {selectedOption.badge && (
                <span
                  className="shrink-0 text-[10px] uppercase font-semibold tracking-[0.06em] px-1.5 py-[1px] rounded-full ml-1"
                  style={{
                    background: selectedOption.badgeColor?.bg || "rgba(240, 168, 120, 0.2)",
                    color: selectedOption.badgeColor?.fg || "#f0c9a2",
                  }}
                >
                  {selectedOption.badge}
                </span>
              )}
            </div>
          ) : (
            <span className="truncate" style={{ color: "rgba(243, 233, 226, 0.45)" }}>
              {placeholder}
            </span>
          )}
        </div>

        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="shrink-0 flex items-center justify-center text-[#f0a878]/70 group-hover:text-[#f0a878] transition-colors"
        >
          <ChevronDown size={14} strokeWidth={2.2} />
        </motion.div>
      </button>

      {/* Floating Menu Popover */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className={`absolute z-[999] mt-1.5 rounded-2xl overflow-hidden ${
              align === "right" ? "right-0" : "left-0"
            } ${
              align === "full" ? "w-full min-w-[200px]" : "min-w-[190px]"
            } ${menuClassName}`}
            style={{
              background: "linear-gradient(165deg, rgba(38, 25, 21, 0.98), rgba(24, 15, 13, 0.99))",
              backdropFilter: "blur(24px)",
              border: "1px solid rgba(240, 168, 120, 0.3)",
              boxShadow: "0 18px 45px -4px rgba(0, 0, 0, 0.85), 0 0 24px rgba(240, 168, 120, 0.12)",
              ...menuStyle,
            }}
          >
            {/* Optional Search Bar inside Menu */}
            {shouldSearch && (
              <div
                className="p-2 border-b"
                style={{ borderColor: "rgba(243, 233, 226, 0.08)" }}
              >
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl"
                  style={{
                    background: "rgba(243, 233, 226, 0.06)",
                    border: "1px solid rgba(240, 168, 120, 0.18)",
                  }}
                >
                  <Search size={13} className="shrink-0 text-[#f0a878]/70" />
                  <input
                    ref={searchInputRef}
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setHighlightedIndex(0);
                    }}
                    placeholder="Search options…"
                    className="w-full bg-transparent text-[12.5px] text-[#f7ece4] outline-none placeholder:text-[#f3e9e2]/35"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="p-0.5 border-none bg-transparent text-[#f3e9e2]/40 hover:text-[#f3e9e2] cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List */}
            <div
              ref={listRef}
              role="listbox"
              className="p-1.5 max-h-[260px] overflow-y-auto space-y-0.5"
            >
              {filteredOptions.length === 0 ? (
                <div
                  className="py-4 px-3 text-center text-[12.5px]"
                  style={{ color: "rgba(243, 233, 226, 0.45)" }}
                >
                  No matches found
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = opt.value === value;
                  const isHighlighted = highlightedIndex === idx;

                  return (
                    <div
                      key={`${opt.value}-${idx}`}
                      role="option"
                      aria-selected={isSelected}
                      onClick={() => selectOption(opt)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`group flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-[12.5px] cursor-pointer transition-all duration-150 select-none ${
                        isSelected
                          ? "font-medium"
                          : "font-normal"
                      }`}
                      style={{
                        background: isSelected
                          ? "rgba(240, 168, 120, 0.18)"
                          : isHighlighted
                          ? "rgba(243, 233, 226, 0.08)"
                          : "transparent",
                        color: isSelected
                          ? "#fdf6f0"
                          : isHighlighted
                          ? "#f7ece4"
                          : "rgba(243, 233, 226, 0.82)",
                        border: isSelected
                          ? "1px solid rgba(240, 168, 120, 0.35)"
                          : "1px solid transparent",
                      }}
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {opt.icon && <span className="shrink-0">{opt.icon}</span>}
                        <div className="flex flex-col min-w-0">
                          <span className="truncate">{opt.label}</span>
                          {opt.subtitle && (
                            <span
                              className="text-[11px] truncate"
                              style={{ color: "rgba(243, 233, 226, 0.45)" }}
                            >
                              {opt.subtitle}
                            </span>
                          )}
                        </div>
                        {opt.badge && (
                          <span
                            className="shrink-0 text-[9.5px] uppercase font-semibold tracking-[0.06em] px-1.5 py-[1px] rounded-full ml-auto mr-1"
                            style={{
                              background: opt.badgeColor?.bg || "rgba(240, 168, 120, 0.15)",
                              color: opt.badgeColor?.fg || "#f0c9a2",
                            }}
                          >
                            {opt.badge}
                          </span>
                        )}
                      </div>

                      {isSelected && (
                        <motion.span
                          initial={{ scale: 0.5, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className="shrink-0 text-[#f0a878]"
                        >
                          <Check size={14} strokeWidth={2.4} />
                        </motion.span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
