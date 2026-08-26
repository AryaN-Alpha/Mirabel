from django.contrib import admin

from outlook.models import ScheduledEmail

# OutlookCredential is deliberately not registered here — it holds encrypted
# OAuth tokens, and the admin UI would be an easy way to accidentally expose
# or copy them.


@admin.register(ScheduledEmail)
class ScheduledEmailAdmin(admin.ModelAdmin):
    list_display = ("subject", "to", "send_at", "status", "created_at")
    list_filter = ("status",)
    readonly_fields = ("created_at", "sent_at")
