from django.db.models import *
from django.utils.translation import ugettext_lazy as _
from django.core.files.storage import default_storage
from django.conf import settings
from django.core.urlresolvers import reverse

import os
from random import choice
from datetime import datetime as dt
from datetime import timedelta

class Store(Model):
    path = CharField(_("path"), help_text=_("Path relative to the base URL under which the store is accessible. Leave empty if not sure."), unique=True, blank=True, max_length=200)
    media = CharField(_("media"), help_text=_("Directiory under MEDIA_PATH into which files will be uploaded. Leave empty if not sure."), blank=True, max_length=200)
    accesscode = CharField(_("access code"), help_text=_("Protect access to the store by an access code."), max_length=200)
    item_limit = IntegerField(_("item size limit"), help_text=_("Limit the size of a single file."), default=0)
    store_limit = IntegerField(_("store size limit"), help_text=_("Limit the size of the entire store."), default=0)
    protect_files = BooleanField(_("protect files"), help_text=_("Protect files by a random string, so that they cannot be downloaded by guessing their name."), default=True)
    
    def __unicode__(self):
        url = self.get_absolute_url()
        if url.startswith("/"):
            url = url[1:]
        return "default" if url == "" else url
        
    def get_absolute_url(self):
        url = reverse("fileshack:index", kwargs=dict(store_path=self.path))
        if url.endswith("//"): url = url[:-1] # Ugly hack.
        return url
        
    def total(self):
        total = 0
        for dirpath, dirnames, filenames in os.walk(os.path.join(settings.MEDIA_ROOT, "fileshack", self.media)):
            for f in filenames:
                fp = os.path.join(dirpath, f)
                total += os.path.getsize(fp)
        return total

def item_upload_to(instance, filename):
    key = ""
    if(instance.store.protect_files):
        chars = "abcdefghijklmnopqrstuvwxyz0123456789"
        key = "".join([choice(chars) for i in range(10)])
    return os.path.join(instance.store.media, key, filename)

class Item(Model):
    store = ForeignKey(Store, verbose_name=_("store"))
    fileobject = FileField(_("file"), upload_to=item_upload_to)
    created = DateTimeField(_("created"), auto_now_add=True)
    uploaded = DateTimeField(_("uploaded"), auto_now_add=True)
    modified = DateTimeField(_("modified"), auto_now=True)
    size_total = IntegerField(_("size total"), default=0)
    size = IntegerField(_("size"), default=0)
    
    def delete(self):
        dir = os.path.dirname(os.path.join(settings.MEDIA_ROOT, self.fileobject.name))
        try: self.fileobject.delete()
        except OSError: pass
        try: os.rmdir(dir)
        except OSError: pass
        return Model.delete(self)

    def status(self):   
        if self.size < self.size_total and dt.now(self.modified.tzinfo) - self.modified > timedelta(seconds=10):
            return 'STALE'
        elif self.size < self.size_total:
            return 'UPLOADING'
        else:
            return 'READY'

    def exists(self):
        return self.fileobject and default_storage.exists(self.fileobject.path)

    def get_absolute_url(self):
        if self.status() == "READY":
            return self.fileobject.url
        elif self.status() == "UPLOADING":
            return reverse("fileshack:download",  kwargs={
                "store_path": "" if self.store.path == "" else self.store.path+"/",
                "item_id": self.id,
            })
        else:
            return ""

    def name(self):
        try:
            return os.path.basename(self.fileobject.name)
        except (OSError,ValueError):
            return None
    
    def size_human(self):
        size = self.size()
        for u in ("B", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"):
            unit = u
            if size < 1024:
                break
            size = size/1024.0
        if unit == "B" or unit == "KB":
            return u"%.0f %s" % (size, unit)
        else:
            return u"%.1f %s" % (size, unit)
    
    def simple(self):
        return {
            "id": self.id,
            "status": self.status(),
            "name": self.name(),
            "url": self.get_absolute_url(),
            "size": self.size,
            "size_total": self.size_total,
            "modified": self.modified,
            "created": self.created,
            "uploaded": self.uploaded,
        }
    
    def __unicode__(self):
        return self.name()

    class Meta:
        ordering = ('created'),

