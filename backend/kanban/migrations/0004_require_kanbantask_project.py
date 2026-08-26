import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    """Makes KanbanTask.project required now that 0003 has backfilled every
    existing row onto a default project — safe because no NULL project_id
    rows can remain by the time this runs.
    """

    dependencies = [
        ("kanban", "0003_backfill_default_project"),
    ]

    operations = [
        migrations.AlterField(
            model_name="kanbantask",
            name="project",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE, related_name="tasks", to="kanban.project"
            ),
        ),
    ]
