# -*- coding: utf-8 -*-

from django.db.models.signals import pre_save
from models import Item


def set_file_size(sender, instance, **kwargs):  # @UnusedVariable
    """
    Automatic set file sizes after uploading.
    """
    if instance.fileobject._file is None:
        # skip front-end uploads
        return
    # set sizes
    instance.size = instance.fileobject._file.size
    instance.size_total = instance.fileobject._file.size

pre_save.connect(set_file_size, Item)
