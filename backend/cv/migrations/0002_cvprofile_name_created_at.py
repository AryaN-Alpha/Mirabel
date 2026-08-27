import django.utils.timezone
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("cv", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="cvprofile",
            name="name",
            field=models.CharField(default="Main", max_length=200),
        ),
        migrations.AddField(
            model_name="cvprofile",
            name="created_at",
            field=models.DateTimeField(auto_now_add=True, default=django.utils.timezone.now),
            preserve_default=False,
        ),
        migrations.AlterModelOptions(
            name="cvprofile",
            options={"ordering": ["created_at"]},
        ),
    ]
