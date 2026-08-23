export function getErrorMessage(err, fallback = "Something went wrong.") {
  if (err?.response) return err.response.data?.error || fallback;
  if (err?.request) return "Can't reach the server. Check your connection and try again.";
  return err?.message || fallback;
}

export function chatDegradedMessage(reason) {
  if (reason === "provider") return "…the model's not cooperating right now. try again in a sec.";
  return "…something broke on my end. don't make it weird.";
}

export function micErrorMessage(err) {
  switch (err?.name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
      return "mic access denied — allow it in your browser settings if you want to talk.";
    case "NotFoundError":
      return "no microphone found.";
    case "NotReadableError":
      return "mic's being used by something else.";
    default:
      return "couldn't start the mic. try again?";
  }
}
