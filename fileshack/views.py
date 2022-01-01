# Copyright (c) 2020 Peter Kuma
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

from django.template import Context, loader
from django.http import HttpResponse, HttpResponseNotFound, \
                        HttpResponseForbidden, HttpResponseRedirect, \
                        HttpResponseServerError, HttpResponseBadRequest, \
                        HttpResponseNotAllowed
from django.views.decorators.cache import never_cache
from django.views.decorators.csrf import csrf_exempt
from django.utils.translation import gettext, gettext_lazy as _
from django.utils.translation import ngettext_lazy as ngettext
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.shortcuts import render, get_object_or_404
from django.http import Http404
from django.conf import settings
from wsgiref.util import FileWrapper
from django import forms
from django.views.decorators.http import require_POST, require_GET
from django.core.mail import send_mail
from django.contrib.sites.shortcuts import get_current_site

try: from django.utils import timezone
except ImportError: from .compat import timezone

import datetime
import os
import json
import urllib.request, urllib.parse, urllib.error
import mimetypes
import time
import binascii
import smtplib
import socket

from .models import *

class JSONEncoder(json.JSONEncoder):
    def __init__(self, **kwargs):
        defaults = {
            "sort_keys": True,
            "indent": 4,
        }
        defaults.update(**kwargs)
        return json.JSONEncoder.__init__(self, **defaults)

    def default(self, obj):
        if isinstance(obj, datetime.datetime):
            return obj.isoformat()
        return json.JSONEncoder.default(self, obj)

def require_store(view):
    def store_wrapper(*args, **kwargs):
        if "store_path" not in kwargs:
            raise Http404()
        store_path = kwargs.pop("store_path")
        if  len(store_path) > 0 and store_path[-1] == "/":
            store_path = store_path[:-1]
        store = get_object_or_404(Store, path=store_path)
        return view(*args, store=store, **kwargs)

    return store_wrapper

def require_login(view):
    def login_wrapper(request, *args, **kwargs):
        store = kwargs.get("store")
        if not store: return Http404()

        if store.accesscode == "":
            return view(request, *args, **kwargs)

        if "fileshack_stores" in request.session and \
           store.id in request.session["fileshack_stores"]:
            return view(request, *args, **kwargs)

        return HttpResponseForbidden("Login required")

    return login_wrapper

@require_store
@require_POST
def logout(request, store):
    try:
        request.session["fileshack_stores"].remove(store.id)
        # FIX: we should call session.save() because django session system doesn't track
        # the changes made inside of the list
        request.session.save()
    except (KeyError, ValueError):
        pass
    request.session.save()
    return HttpResponseRedirect(store.get_absolute_url())

@require_store
def index(request, store):
    if ("fileshack_stores" not in request.session or \
        not store.id in request.session["fileshack_stores"]) \
        and store.accesscode != "":

        if request.method == "POST":
            accesscode = request.POST.get("accesscode")
            if accesscode != "" and store.accesscode == accesscode:
                if "fileshack_stores" not in request.session:
                    request.session["fileshack_stores"] = [store.id]
                else:
                    request.session["fileshack_stores"].append(store.id)
                    # FIX: we should call session.save() because django session system doesn't track
                    # the changes made inside of the list
                    request.session.save()
                return HttpResponseRedirect(store.get_absolute_url())
            else:
                t = loader.get_template("fileshack/accesscode.html")
                c = {
                    "accesscode": accesscode,
                    "error_label": _("Wrong access code"),
                    "error_message": _("Please try again"),
                }
                return HttpResponse(t.render(c, request))
        else:
            t = loader.get_template("fileshack/accesscode.html")
            c = {}
            return HttpResponse(t.render(c, request))

    items = Item.objects.filter(store=store)
    watchers = Watcher.objects.filter(store=store)
    t = loader.get_template("fileshack/index.html")
    c = {
        "store": store,
        "items": items,
        "item_size_limit": store.item_limit,
        "bootstrap": JSONEncoder().encode({
            "items": [i.simple() for i in items],
            "watchers": [w.simple() for w in watchers],
        }),
    }
    return HttpResponse(t.render(c, request))

@require_store
@require_login
def iframe(request, store):
    if request.method != "POST":
        t = loader.get_template("fileshack/iframe.html")
        c = {}
        return HttpResponse(t.render(c, request))

    if "file" not in request.FILES:
        return HttpResponseForbidden()
    f = request.FILES["file"]

    item = Item()
    item.fileobject.name = urllib.parse.unquote(f.name)
    item.store = store
    item.size = f.size
    item.size_total = f.size

    if store.item_limit and f.size > store.item_limit*1024*1024:
        return HttpResponse(JSONEncoder().encode({
            "status": "itemlimitreached",
            "error_label": "Upload failed",
            "error_message": "Item size is limited to %d MB" % store.item_limit,
            "item": item.simple(),
        }))

    if store.store_limit and store.total() + f.size > store.store_limit*1024*1024:
        return HttpResponse(JSONEncoder().encode({
            "status": "storelimitreached",
            "error_label": "Upload failed",
            "error_message": "The store size limit of %d MB has been reached" % store.store_limit,
            "item": item.simple(),
        }))

    item.fileobject.save(urllib.parse.unquote(f.name), f)
    item.save()

    return HttpResponse(JSONEncoder().encode({
        "status": "success",
        "item": Item.objects.get(pk=item.pk).simple()
    }))

@never_cache
@require_store
@require_login
def upload(request, store, id):
    if request.method != "POST" or "file" not in request.FILES:
        data = {
            "status": "failed",
            "error_label": "Upload failed",
            "error_message": "Invalid HTTP request",
        }
        return HttpResponseBadRequest(JSONEncoder().encode(data))

    if "file" in request.FILES:
        f = request.FILES["file"]
        name = urllib.parse.unquote(f.name)
        try: size_total = int(request.META["HTTP_X_FILE_SIZE"])
        except (ValueError, KeyError): size_total = f.size
    else:
        name = ''
        size_total = 0 # Unknown.

    try: name = urllib.parse.unquote(request.META["HTTP_X_FILE_NAME"])
    except KeyError: name = ''

    name = os.path.basename(name)

    try: offset = int(request.META["HTTP_X_FILE_OFFSET"])
    except (ValueError, KeyError): offset = 0

    if store.item_limit and size_total and size_total > store.item_limit*1024*1024:
        data = {
            "status": "itemlimitreached",
            "error_label": "Upload failed",
            "error_message": "Item size is limited to %d MB" % store.item_limit,
            "item": None,
        }
        return HttpResponseServerError(JSONEncoder().encode(data))

    if store.store_limit and size_total and store.total() + size_total - offset > store.store_limit*1024*1024:
        data = {
            "status": "storelimitreached",
            "error_label": "Upload failed",
            "error_message": "The store size limit of %d MB has been reached" % store.store_limit,
            "item": None,
        }
        return HttpResponseServerError(JSONEncoder().encode(data))

    # If the item exists, open the file for append.
    try:
        try: id = int(id)
        except ValueError: raise Item.DoesNotExist
        item = Item.objects.get(pk=id)
        if item.fileobject.size < offset:
            data = {
                "status": "outoforder",
                "error_label": "Chunk out of order",
                "error_message": "Application sent a chunk out of order",
                "item": item.simple(),
            }
            return HttpResponseServerError(JSONEncoder().encode(data))
        fp = default_storage.open(item.fileobject.path, "ab")
        fp.truncate(offset)

    # This is a new item.
    except Item.DoesNotExist:
        if offset != 0:
            data = {
                "status": "outoforder",
                "error_label": "Chunk out of order",
                "error_message": "Application sent a chunk of an item that does not exist",
                "item": None,
            }
            return HttpResponseServerError(JSONEncoder().encode(data))
        item = Item()
        item.store = store
        item.fileobject.save(name, ContentFile(""))
        item.fileobject.close()
        item.size_total = size_total
        item.save()
        fp = default_storage.open(item.fileobject.path, "wb")

    chunks = f.chunks().__iter__()
    while True:
        try: chunk = next(chunks)
        except StopIteration: break
        except IOError:
            fp.close()
            data = {
                "status": "failed",
                "error_label": "Upload failed",
                "error_message": "Server-side I/O error",
                "item": item.simple(),
            }
            return HttpResponseServerError(JSONEncoder().encode(data))
        else:
            try:
                if request.META.get("HTTP_X_FILE_ENCODING") == "base64":
                    fp.write(chunk.decode("base64"))
                else:
                    fp.write(chunk)
            except binascii.Error:
                fp.close()
                data = {
                    "status": "failed",
                    "error_label": "Upload failed",
                    "error_message": "The browser sent an invalid chunk",
                    "item": item.simple(),
                }
                return HttpResponseServerError(JSONEncoder().encode(data))

    item.size = fp.tell()
    fp.close()

    if item.size_total < item.size:
        item.size_total = item.size

    if item.size >= item.size_total:
        item.uploaded = timezone.now()

    item.save()
    data = {
        "status": "success",
        "item": Item.objects.get(pk=item.pk).simple()
    }
    return HttpResponse(JSONEncoder().encode(data))

@require_store
@require_login
def simple_upload(request, store):
    if request.method != "POST" or "file" not in request.FILES:
        return HttpResponseRedirect(store.get_absolute_url())

    #if store.item_limit and f.size > store.item_limit*1024*1024:
    #if store.store_limit and store.total() + f.size > store.store_limit*1024*1024:

    f = request.FILES["file"]
    item = Item()
    item.store = store
    item.fileobject.save(urllib.parse.unquote(f.name), f)
    item.size = f.size
    item.size_total = f.size
    item.save()
    return HttpResponseRedirect(store.get_absolute_url())

@require_store
@require_login
def delete(request, store, item_id):
    if request.method != "POST":
        return HttpResponseForbidden()

    item = get_object_or_404(Item, pk=item_id, store=store)
    item.delete()

    return HttpResponse("Item has been deleted")

@never_cache
@require_store
@require_login
def update(request, store, since=None):
    since_dt = None
    if since != None:
        try:
            since_dt = datetime.datetime.strptime(since, "%Y-%m-%d_%H:%M:%S")
        except ValueError:
            pass

    all_items = Item.objects.filter(store=store)
    item_ids = [item.id for item in all_items]

    if since_dt != None:
        items = Item.objects.filter(store=store, modified__gt=since_dt)
    else:
        items = all_items

    items_simple = []
    for item in items:
        items_simple.append(item.simple())

    dthandler = lambda obj: obj.isoformat() if isinstance(obj, datetime.datetime) else None
    data = JSONEncoder(sort_keys=True, indent=4).encode(dict(
            time=timezone.now().strftime("%Y-%m-%d_%H:%M:%S"),
            item_ids=item_ids, items=items_simple))
    return HttpResponse(data)

class ItemFileWrapper(FileWrapper):
    def __init__(self, item, *args, **kwargs):
        self._item = item
        self._counter = 0
        self._stale = 0
        self._throttle = kwargs.get("throttle", 100)
        self._stale_limit = kwargs.get("stale_limit", 10000)
        return FileWrapper.__init__(self, *args, **kwargs)
    def __next__(self):
        try:
            data = FileWrapper.next(self)
            self._counter += len(data)
            if len(data) > 0:
                self._stale = 0
            return data
        except StopIteration:
            if self._counter >= self._item.size_total:
                raise StopIteration
            if self._stale_limit and self._stale >= self._stale_limit:
                raise StopIteration
            start = time.time()
            time.sleep(self._throttle/1000)
            end = time.time()
            self._stale += (end - start)*1000
            return ""

@require_store
@require_login
def download(request, store, item_id):
    item = get_object_or_404(Item, pk=item_id)

    if item.status() == "READY":
        return HttpResponseRedirect(item.get_absolute_url())

    f = default_storage.open(item.fileobject.path, "rb")
    wrapper = ItemFileWrapper(item, f)
    response = HttpResponse(wrapper, content_type=mimetypes.guess_type(item.fileobject.name))
    response["Content-Length"] = "%d" % item.size_total
    response["Content-Disposition"] = 'attachment; name="file"; filename="%s"' % urllib.parse.quote(item.name())
    return response


@require_store
@require_login
@require_POST
def watch(request, store):
    if not store.allow_watch:
        return HttpResponseNotAllowed()

    class WatcherForm(forms.Form):
        email = forms.EmailField(max_length=254)

    f = WatcherForm(request.POST)
    if f.is_valid():
        try: u = User.objects.get(email__iexact=f.cleaned_data["email"])
        except User.DoesNotExist:
            u = User(email=f.cleaned_data["email"], last_notification=None)
            u.save()
        try: w = Watcher.objects.get(store=store, user=u)
        except Watcher.DoesNotExist: w = Watcher(store=store, user=u)
        w.save()

        watchers = Watcher.objects.filter(store=store)
        return HttpResponse(JSONEncoder().encode({
            "status": "success",
            "watcher": w.simple(),
            "watchers": [w.simple() for w in watchers],
        }))
    else:
        return HttpResponseBadRequest(JSONEncoder().encode({
            "status": "error",
            "message": f["email"].errors if f["email"].errors else "Validation Error",
        }))

    if request.method != "POST" or "email" not in request.POST:
        return HttpResponseBadRequest()


@require_store
@require_login
@require_POST
def unwatch(request, store):
    if not store.allow_watch:
        return HttpResponseNotAllowed()

    if "email" not in request.POST:
        return HttpResponseBadRequest()

    email = request.POST["email"]

    watchers = Watcher.objects.filter(store=store, user__email__iexact=email)
    for w in watchers:
        w.delete()

    # Delete user who are not watching any store.
    User.objects.annotate(n_watchers=Count("watchers")).filter(n_watchers=0).delete()

    watchers = Watcher.objects.filter(store=store)
    return HttpResponse(JSONEncoder().encode({
        "status": "success",
        "watchers": [w.simple() for w in watchers],
    }))


@csrf_exempt
def cron(request):
    ok = False

    # Shared secret authentication.
    secret = request.POST.get("secret")
    if settings.FILESHACK_CRON_SECRET and \
       settings.FILESHACK_CRON_SECRET == secret:
        ok = True

    # Host-based authentication.
    for host in settings.FILESHACK_CRON_HOSTS:
        try: sockinfos = socket.getaddrinfo(host, None)
        except socket.gaierror: sockinfos = []
        ips = [sockinfo[4][0] for sockinfo in sockinfos]
        if request.META["REMOTE_ADDR"] in ips:
            ok = True
            break

    if not ok: return HttpResponseForbidden(gettext("Permission denied\n"))

    output = gettext("Cron started at %s\n" % \
                      timezone.now().strftime("%H:%M %Z, %d %b %Y"))

    error = False

    # digest.
    response = digest(request)
    output += "digest: %s\n" % response.content.decode(response.charset)
    if response.status_code != 200: error = True

    return HttpResponseServerError(output) if error else HttpResponse(output)


def digest(request):
    url_prefix = ("https://" if request.is_secure else "http://") + \
        get_current_site(request).domain
    now = timezone.now()

    watchers = Watcher.objects.filter(user__last_notification=None)
    for store in Store.objects.filter(allow_watch=True):
        since = now - datetime.timedelta(minutes=store.watch_delay)
        watchers |= store.watchers.filter(user__last_notification__lt=since)

    messages = {}
    for w in watchers:
        user = w.user
        text = messages.get(user, "")
        since = user.last_notification or w.created
        nitems = Item.objects.filter(store=w.store, created__gt=since).count()
        if nitems == 0: continue
        text += ngettext(
            "A new item has been uploaded to %(store_url)s.\r\n\r\n",
            "%(count)d items have been uploaded to %(store_url)s.\r\n\r\n",
            nitems) %  {
                "count": nitems,
                "store_url": url_prefix + w.store.get_absolute_url()
            }
        messages[user] = text

    n = 0
    output = ""
    error = False
    for (user, text) in messages.items():
        text += gettext("Fileshack\r\n")
        if settings.SECRET_KEY:
            text += gettext("--\r\nTo UNSUBSCRIBE, go to %(url)s") % {
                "url": url_prefix + user.unsubscribe_url()
            }
        try:
            send_mail(gettext("Fileshack Update"), text,
                      settings.FILESHACK_EMAIL_FROM, [user.email])
            user.last_notification = now
            user.save()
            n = n + 1
        except (smtplib.SMTPException, socket.error) as e:
            output += "\nsend_mail: %s: %s" % (e.__class__.__name__, e)

            if isinstance(e, smtplib.SMTPRecipientsRefused):
                continue # Recipient refused, continue sending messages.
            else:
                error = True
                break # Serious error, does not make sense to continue.

    output = ngettext(
        "A digest has been sent to %(count)d person.",
        "A digest has been sent to %(count)d people.",
        n) % { "count": n } + output

    return HttpResponseServerError(output) if error else HttpResponse(output)


@require_GET
def unsubscribe(request):
    email = request.GET.get("u")
    hmac = request.GET.get("hmac").encode("utf-8")

    try: u = User.objects.get(email=email)
    except User.DoesNotExist:
        return render(request, "fileshack/unsubscribe.html",
                      dict(result="doesnotexist"),
                      status=404)

    if u.unsubscribe_hmac() != hmac:
        return render(request, "fileshack/unsubscribe.html",
                      dict(result="invalid"),
                      status=403) # Forbidden.
    u.delete()
    return render(request, "fileshack/unsubscribe.html", dict(result="success"))


def page_not_found(request, exception):
    stores = Store.objects.all()
    store = None
    for s in stores:
        if request.path.startswith(s.get_absolute_url()):
            store = s
    if not store:
        try: store = Store.objects.get(path="")
        except Store.DoesNotExist: pass

    t = loader.get_template("fileshack/404.html")
    return HttpResponseNotFound(t.render({
        "request_path": request.path,
        "store": store,
        "stores_number": len(stores),
        "admin_url": reverse("admin:index"),
    }, request))

def server_error(request):
    t = loader.get_template("fileshack/500.html")
    return HttpResponseServerError(t.render({ "request_path": request.path, }, request))
