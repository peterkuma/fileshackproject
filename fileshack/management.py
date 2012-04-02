"""
Creates the default Site object.
"""

# Modelled after django.contrib.sites.management.

from django.db.models import signals
from django.db import router

import models as fileshack_app
from models import Store

def create_default_store(app, created_models, verbosity, db, **kwargs):
    # Only create the default sites in databases where Django created the table.
    if Store in created_models and router.allow_syncdb(db, Store) :
        if verbosity >= 2:
            print "Creating default Store object"
        Store().save(using=db)

signals.post_syncdb.connect(create_default_store, sender=fileshack_app)
