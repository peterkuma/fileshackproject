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

from django.template import Context, RequestContext, loader
from django.http import HttpResponse, HttpResponseNotFound, \
                        HttpResponseForbidden, HttpResponseRedirect, \
                        HttpResponseServerError, HttpResponseBadRequest
from django.shortcuts import render_to_response
from django.views.decorators.cache import never_cache
from django.utils.translation import ugettext_lazy as _
from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from django.shortcuts import render_to_response, get_object_or_404
from django.http import Http404
from django.conf import settings
from django.core.servers.basehttp import FileWrapper

from datetime import datetime as dt
import os
import json
import urllib
import mimetypes
import time
import binascii

from google.appengine.api import files
from google.appengine.ext import blobstore
from djangoappengine.storage import BlobstoreUploadedFile

from models import *

class JSONEncoder(json.JSONEncoder):
    def __init__(self, **kwargs):
        defaults = {
            "sort_keys": True,
            "indent": 4,
        }
        defaults.update(**kwargs)
        return json.JSONEncoder.__init__(self, **defaults)
    
    def default(self, obj):
        if isinstance(obj, dt):
            return obj.isoformat()
        return json.JSONEncoder.default(self, obj)

def require_store(view):
    def store_wrapper(*args, **kwargs):
        if not kwargs.has_key("store_path"):
            raise Http404()
        store_path = kwargs.pop("store_path")
        #if  store_path != "" and store_path[-1] != "/":
        #    raise Http404()
        store = None
        try: store = Store.objects.get(path=store_path)
        except Store.DoesNotExist: pass
        #try: store = Store.objects.get(path=store_path[:-1])
        #except Store.DoesNotExist: pass
        if store == None: raise Http404()
        return view(*args, store=store, **kwargs)
        
    return store_wrapper

def require_login(view):
    def login_wrapper(request, *args, **kwargs):
        store = kwargs.get("store")
        
        if store == None:
            return HttpResponseForbidden("No store defined")
        if not request.session.has_key("fileshack_stores") or \
           not store.id in request.session["fileshack_stores"]:
            return HttpResponseForbidden("Not logged in")
            
        return view(request, *args, **kwargs)
    return login_wrapper

@require_store
def logout(request, store):
    try:
        request.session["fileshack_stores"].remove(store.id)
    except (KeyError, ValueError):
        pass
    request.session.save()
    return HttpResponseRedirect(store.get_absolute_url())

@require_store
def index(request, store):
    if (not request.session.has_key("fileshack_stores") or \
        not store.id in request.session["fileshack_stores"]):
        
        if request.method == "POST":
            accesscode = request.POST.get("accesscode")
            if accesscode != "" and store.accesscode == accesscode:
                if not request.session.has_key("fileshack_stores"):
                    request.session["fileshack_stores"] = [store.id]
                else:
                   request.session["fileshack_stores"].append(store.id)
                request.session.set_expiry(3600)
                return HttpResponseRedirect(store.get_absolute_url())
            else:
                t = loader.get_template("fileshack/accesscode.html")
                c = RequestContext(request, {
                    "accesscode": accesscode,
                    "error_label": _("Wrong access code"),
                    "error_message": _("Please try again."),
                })
                return HttpResponse(t.render(c))
        else:
            t = loader.get_template("fileshack/accesscode.html")
            c = RequestContext(request, {
                "accesscode": store.accesscode, # Reveal accesscode.
            })
            return HttpResponse(t.render(c))
        
    items = Item.objects.filter(store=store)    
    t = loader.get_template("fileshack/index.html")
    c = RequestContext(request, {
        "items": items,
        "item_size_limit": store.item_limit,
        "items_json": JSONEncoder().encode([i.simple() for i in items])
    })
    return HttpResponse(t.render(c))

@require_store
@require_login
def iframe(request, store):
    if request.method == "POST" and request.FILES.has_key("file"):
        f = request.FILES["file"]
        item = Item()
        item.store = store
        item.fileobject = f.blobstore_info.key()
        item.size = f.blobstore_info.size
        item.size_total = f.blobstore_info.size
        item.save()
    
    t = loader.get_template("fileshack/iframe.html")
    c = RequestContext(request)
    return HttpResponse(t.render(c))

@require_store
@require_login
def iframe_create_upload_url(request, store):
    url = reverse('fileshack:iframe', kwargs=dict(store_path=store.path))
    return HttpResponse(blobstore.create_upload_url(url))

@never_cache
@require_store
@require_login
def upload(request, store, id):
    if request.method != "POST" or not request.FILES.has_key("file"):
        data = {
            "status": "failed",
            "error_label": "Upload failed",
            "error_message": "Invalid HTTP request",
        }
        return HttpResponseBadRequest(JSONEncoder().encode(data))
    
    if request.FILES.has_key("file"):
        f = request.FILES["file"]
        name = urllib.unquote(f.name)
        try: size_total = int(request.META["HTTP_X_FILE_SIZE"])
        except (ValueError, KeyError): size_total = f.size
    else:
        name = ''
        size_total = 0 # Unknown.

    try: name = request.META["HTTP_X_FILE_NAME"]
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
    
    if store.store_limit and size_total and store.total() + size_total > store.store_limit*1024*1024:
        data = {
            "status": "storelimitreached",
            "error_label": "Upload failed",
            "error_message": "The store size limit of %d MB has been reached" % store.store_limit,
            "item": None,
        }
        return HttpResponseServerError(JSONEncoder().encode(data))
    
    if request.FILES.has_key("file") and type(f) == BlobstoreUploadedFile:
        item = Item()
        item.store = store
        item.fileobject = f.blobstore_info.key()
        item.size = f.blobstore_info.size
        item.size_total = f.blobstore_info.size
        item.save()
        data = {
            "status": "success",
            "item": item.simple()
        }
        return HttpResponse(JSONEncoder().encode(data))
    
    # If the item exists, open the file for append.
    try:
        try: id = int(id)
        except ValueError: raise Item.DoesNotExist
        item = Item.objects.get(pk=id)
        size = blobstore.BlobInfo.get(item.fileobject).size
        if size < offset:
            data = {
                "status": "outoforder",
                "error_label": "Chunk out of order",
                "error_message": "Application sent a chunk out of order",
                "item": item.simple(),
            }
            return HttpResponseServerError(JSONEncoder().encode(data))
        fp = blobstore.BlobInfo.get(item.fileobject).open()
        data = fp.read()
        fp.close()
        blobstore.BlobInfo.get(item.fileobject).delete()
        file_name = files.blobstore.create('application/octet-stream', name)
        fp = files.open(file_name, "a")
        fp.write(data)
        del data
        
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
        file_name = files.blobstore.create('application/octet-stream', name)
        item.size_total = size_total
        item.save()
        fp = files.open(file_name, "a")
        
    
    chunks = f.chunks().__iter__()
    while True:
        try: chunk = chunks.next()
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
    
    fp.close()
    files.finalize(file_name)
    
    item.fileobject = files.blobstore.get_blob_key(file_name)
    item.size = blobstore.BlobInfo.get(item.fileobject).size
    
    if item.size_total < item.size:
        item.size_total = item.size
    
    if item.size >= item.size_total:
        item.uploaded = dt.now()
    
    item.save()
    data = {
        "status": "success",
        "item": Item.objects.get(pk=item.pk).simple()
    }
    return HttpResponse(JSONEncoder().encode(data))
    
    
@require_store
@require_login
def upload_create_upload_url(request, store, id):
    url = reverse('fileshack:upload', kwargs=dict(store_path=store.path, id=id))
    return HttpResponse(blobstore.create_upload_url(url))
    
@require_store
@require_login
def simple_upload(request, store, redirect=False):
    if request.method != "POST" or not request.FILES.has_key("file"):
        return HttpResponseRedirect(store.get_absolute_url())
    
    #if store.item_limit and f.size > store.item_limit*1024*1024:
    #if store.store_limit and store.total() + f.size > store.store_limit*1024*1024:
    
    f = request.FILES["file"]
    item = Item()
    item.store = store
    item.fileobject = f.blobstore_info.key()
    item.size = f.blobstore_info.size
    item.size_total = f.blobstore_info.size
    item.save()
    return HttpResponseRedirect(store.get_absolute_url())
    
@require_store
@require_login
def simple_upload_create_upload_url(request, store):
    url = reverse('fileshack:simple_upload', kwargs=dict(store_path=store.path))
    return HttpResponse(blobstore.create_upload_url(url))

@require_store
@require_login
def delete(request, store, item_id):
    if request.method != "POST":
        return HttpResponseForbidden()
        
    item = get_object_or_404(Item, pk=item_id, store=store)
    item.delete()
    
    return HttpResponse("Item has been deleted")

@require_store
@require_login
def update(request, store, since=None):
    since_dt = None
    if since != None:
        try:
            since_dt = dt.strptime(since, "%Y-%m-%d_%H:%M:%S")
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
            time=dt.now().strftime("%Y-%m-%d_%H:%M:%S"),
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
    def next(self):
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
    
    response = HttpResponse()
    response[blobstore.BLOB_KEY_HEADER] = blobstore.BlobInfo.get(item.fileobject).key()
    response["Content-Type"] = "application/octet-stream"
    response["Content-Disposition"] =  'form-data; name="file"; filename="%s"' % blobstore.BlobInfo.get(item.fileobject).filename
    return response


def page_not_found(request):
    stores = Store.objects.all()
    store = None
    for s in stores:
        if request.path.startswith(s.get_absolute_url()):
            store = s
    if not store:
        try: store = Store.objects.get(path="")
        except Store.DoesNotExist: pass
    
    t = loader.get_template("fileshack/404.html")
    return HttpResponseNotFound(t.render(RequestContext(request, {
        "request_path": request.path,
        "store": store,
        "stores_number": len(stores),
        "admin_url": reverse("admin:index"),
    })))

def server_error(request):
    t = loader.get_template("fileshack/500.html")
    return HttpResponseServerError(t.render(RequestContext(request, { "request_path": request.path, })))
