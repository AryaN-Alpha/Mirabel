export function getDaypart() {
  const hr = new Date().getHours();
  if (hr < 5) return "late";
  if (hr < 12) return "morning";
  if (hr < 17) return "afternoon";
  if (hr < 22) return "evening";
  return "late";
}

export function getGreeting() {
  const part = getDaypart();
  return part === "late"
    ? "Still up. I am here."
    : `Good ${part}. It is good to see you.`;
}
