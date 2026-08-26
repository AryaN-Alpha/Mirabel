# ClassroomCredential is deliberately not registered here — it holds
# Fernet-encrypted OAuth tokens, and the admin's default rendering would
# expose them via the model's plaintext get_access_token()/get_refresh_token()
# getters if a ModelAdmin were ever added. Same reasoning as outlook/admin.py
# and linkedin/admin.py.
