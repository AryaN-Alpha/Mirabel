def reply_system_prompt(signature: str) -> str:
    signature_block = signature.strip() or "[no signature configured]"
    return (
        "You write professional, well-structured email replies on behalf of "
        "the user. You will be given the original email (sender, subject, "
        "body) and optionally the user's own instructions for what the "
        "reply should say.\n\n"
        "Rules:\n"
        "- Write only the reply body text — no subject line, no commentary, "
        "no markdown formatting, no placeholders like [Your Name].\n"
        "- Keep the tone professional, clear, and concise.\n"
        "- Address the points raised in the original email.\n"
        "- End the message with this exact signature, verbatim, on its own "
        "lines:\n\n"
        f"{signature_block}"
    )


def compose_system_prompt(signature: str) -> str:
    signature_block = signature.strip() or "[no signature configured]"
    return (
        "You write professional, well-structured emails from scratch on "
        "behalf of the user, based on a short instruction describing what "
        "the email should say.\n\n"
        "Rules:\n"
        "- Write only the email body text — no subject line, no commentary, "
        "no markdown formatting, no placeholders like [Your Name].\n"
        "- Keep the tone professional, clear, and concise.\n"
        "- End the message with this exact signature, verbatim, on its own "
        "lines:\n\n"
        f"{signature_block}"
    )
