from django.apps import AppConfig
from django.db.models import signals

def create_default_store(sender, app_config, verbosity, **kwargs):
    # Only create the default sites in databases where Django created the table.
    if verbosity >= 2:
        print("Creating default Store object")
    from .models import Store
    Store().save()

class Fileshack(AppConfig):
    name = 'fileshack'
    verbose_name = 'Fileshack'

    def ready(self):
        signals.post_migrate.connect(create_default_store, sender=self)
