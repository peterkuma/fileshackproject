# Copyright (c) 2012 Peter Kuma
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
# 
# The above copyright notice and this permission notice shall be included in
# all copies or substantial portions of the Software.
# 
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
# THE SOFTWARE.

from django.db.models import *
from django.utils.translation import ugettext_lazy as _
from django.core.files.storage import default_storage
from django.conf import settings
from django.core.urlresolvers import reverse

import os
from random import choice
from datetime import datetime as dt
from datetime import timedelta
import base64
import hashlib, hmac
import urllib

class Store(Model):
    path = CharField(_("path"), help_text=_("Path relative to the base URL under which the store is accessible. Leave empty if not sure."), unique=True, blank=True, max_length=200)
    media = CharField(_("media"), help_text=_("Directiory under MEDIA_PATH into which files will be uploaded. Leave empty if not sure."), blank=True, max_length=200)
    accesscode = CharField(_("access code"), help_text=_("Protect access to the store by an access code."), max_length=200, blank=True)
    item_limit = IntegerField(_("item size limit"), help_text=_("Limit the size of a single file (MB)."), default=0)
    store_limit = IntegerField(_("store size limit"), help_text=_("Limit the size of the entire store (MB)."), default=0)
    protect_files = BooleanField(_("protect files"), help_text=_("Protect files by a random string, so that they cannot be downloaded by guessing their name."), default=True)
    allow_watch = BooleanField(_("allow watch"), help_text=_('Allow users to subscribe to receive e-mail updates. Requires cron (see <a href="http://fileshack.sourceforge.net/doc/#store-watching">documentation</a>).'), default=False)
    watch_delay = PositiveIntegerField(_("watch delay"), help_text=_("Minimum delay between two notifications in minutes. Only applies when <strong>Allow watch</strong> is enabled."), default=360)
    
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
        if self.items.count() == 0: return 0
        return self.items.all().aggregate(Sum("size"))["size__sum"]

def item_upload_to(instance, filename):
    key = ""
    if(instance.store.protect_files):
        chars = "abcdefghijklmnopqrstuvwxyz0123456789"
        key = "".join([choice(chars) for i in range(10)])
    return os.path.join(instance.store.media, key, filename)

class Item(Model):
    store = ForeignKey(Store, verbose_name=_("store"), related_name="items")
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
        ordering = [('created')]

class User(Model):
    email = EmailField(_("e-mail"), max_length=254, unique=True)
    created = DateTimeField(_("created"), auto_now_add=True)
    modified = DateTimeField(_("modified"), auto_now=True)
    last_notification = DateTimeField(_("last notification"), null=True, blank=True)

    def unsubscribe_hmac(self):
        h = hmac.HMAC(settings.SECRET_KEY)
        h.update("unsubscribe:"+self.email)
        return base64.urlsafe_b64encode(h.digest())

    def unsubscribe_url(self):
        return reverse("fileshack:unsubscribe") + "?" + urllib.urlencode(
            {"u": self.email, "hmac": self.unsubscribe_hmac()}
        )

    class Meta:
        verbose_name = _("user")
        verbose_name_plural = ("users")
        ordering = [("created")]


class Watcher(Model):
    user = ForeignKey(User, verbose_name=_("user"), related_name="watchers")
    store = ForeignKey(Store, verbose_name=_("store"), related_name="watchers")
    created = DateTimeField(_("created"), auto_now_add=True)
    modified = DateTimeField(_("modified"), auto_now=True)
    
    def simple(self):
        return {
            "id": self.id,
            "email": self.user.email,
            "last_notification": self.user.last_notification,
            "created": self.created,
        }
    
    class Meta:
        verbose_name = _("watcher")
        verbose_name_plural = _("watchers")
        ordering = [("created")]
        unique_together = ("user", "store")
