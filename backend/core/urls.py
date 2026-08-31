from django.urls import path

from core import views, views_stats

urlpatterns = [
    path("chat/", views.chat, name="chat"),
    path("settings/model/", views.model_preference, name="model-preference"),
    path("settings/models/<str:provider>/", views.provider_models, name="provider-models"),
    path("settings/credentials/<str:provider>/", views.provider_credential, name="provider-credential"),
    path("health/", views.health, name="health"),
    path("stats/meta/", views_stats.meta, name="stats-meta"),
    path("stats/overview/", views_stats.overview, name="stats-overview"),
    path("stats/timeseries/", views_stats.timeseries, name="stats-timeseries"),
    path("stats/providers/", views_stats.providers, name="stats-providers"),
    path("stats/models/", views_stats.models, name="stats-models"),
    path("stats/call-sites/", views_stats.call_sites, name="stats-call-sites"),
    path("stats/cache/", views_stats.cache_analytics, name="stats-cache"),
    path("stats/performance/", views_stats.performance, name="stats-performance"),
    path("stats/optimization/", views_stats.optimization, name="stats-optimization"),
    path("stats/top-usage/", views_stats.top_usage, name="stats-top-usage"),
    path("stats/pricing/", views_stats.pricing, name="stats-pricing"),
    path("stats/budget/", views_stats.budget, name="stats-budget"),
    path("stats/export/", views_stats.export_csv, name="stats-export"),
]
