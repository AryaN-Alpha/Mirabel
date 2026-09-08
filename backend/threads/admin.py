from django.contrib import admin
from threads.models import (
    ThreadsAutomation,
    ThreadsAutomationRun,
    ThreadsCredential,
    ThreadsDraft,
    ThreadsProfileChange,
    ThreadsProfileSnapshot,
    ThreadsRateLimitSnapshot,
)

admin.site.register(ThreadsCredential)
admin.site.register(ThreadsRateLimitSnapshot)
admin.site.register(ThreadsDraft)
admin.site.register(ThreadsProfileSnapshot)
admin.site.register(ThreadsProfileChange)
admin.site.register(ThreadsAutomation)
admin.site.register(ThreadsAutomationRun)
