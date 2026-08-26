from django.db import migrations

DEFAULT_PROJECT_NAME = "General"


def backfill_default_project(apps, schema_editor):
    """Assign every pre-existing, project-less task to a "General" project.

    Safe to run multiple times and safe on an empty table — get_or_create
    only inserts the default project if nothing already has that name, and
    the update is a no-op once no NULL project_id rows remain.
    """
    Project = apps.get_model("kanban", "Project")
    KanbanTask = apps.get_model("kanban", "KanbanTask")

    orphaned = KanbanTask.objects.filter(project__isnull=True)
    if not orphaned.exists():
        return

    default_project, _ = Project.objects.get_or_create(
        name=DEFAULT_PROJECT_NAME,
        defaults={"description": "Tasks that existed before projects were introduced."},
    )
    orphaned.update(project=default_project)


def noop_reverse(apps, schema_editor):
    """Deliberately irreversible: we can't tell which tasks were originally
    project-less, so reversing would mean guessing. Leaving tasks assigned
    to "General" on a rollback is the safer failure mode — it never deletes
    data.
    """


class Migration(migrations.Migration):

    dependencies = [
        ("kanban", "0002_project_kanbantask_project"),
    ]

    operations = [
        migrations.RunPython(backfill_default_project, noop_reverse),
    ]
