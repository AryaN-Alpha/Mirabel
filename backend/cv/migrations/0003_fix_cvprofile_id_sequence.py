from django.db import migrations


def fix_sequence(apps, schema_editor):
    """The old CVProfile.current() (removed in 0002) used
    get_or_create(pk=1, ...) — inserting with an explicit id rather than
    letting Postgres's own id sequence generate it. Postgres never advances
    a serial/identity sequence for an explicitly-provided id, so on any
    existing install that already has that pk=1 row, the sequence is still
    at its initial value. The very first CVProfile.objects.create() (no
    explicit pk) then asks the sequence for the next id, gets 1 again, and
    collides with the existing row (IntegrityError: duplicate key value
    violates unique constraint "cv_cvprofile_pkey"). Reset the sequence to
    match the actual max id present so new rows get real, unused ids.
    Safe/idempotent to rerun, and a no-op on a fresh install with no rows."""
    schema_editor.execute(
        "SELECT setval(pg_get_serial_sequence('cv_cvprofile', 'id'), "
        "COALESCE((SELECT MAX(id) FROM cv_cvprofile), 1), "
        "(SELECT MAX(id) IS NOT NULL FROM cv_cvprofile))"
    )


class Migration(migrations.Migration):

    dependencies = [
        ("cv", "0002_cvprofile_name_created_at"),
    ]

    operations = [
        migrations.RunPython(fix_sequence, migrations.RunPython.noop),
    ]
