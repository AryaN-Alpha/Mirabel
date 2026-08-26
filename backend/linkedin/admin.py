from django.contrib import admin

# LinkedInCredential is deliberately not registered here — it holds encrypted
# OAuth tokens, and the admin UI would be an easy way to accidentally expose
# or copy them.
