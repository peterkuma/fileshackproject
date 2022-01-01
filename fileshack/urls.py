from django.conf.urls import include
from django.urls import re_path
from fileshack.views import *

app_name = 'fileshack'

urlpatterns = [
    re_path(r'^cron/$', cron, name='cron'),
    re_path(r'^unsubscribe/$', unsubscribe, name='unsubscribe'),
    re_path(r'^(?P<store_path>.*)logout/$', logout),
    re_path(r'^(?P<store_path>.*)iframe/$', iframe),
    re_path(r'^(?P<store_path>.*)upload/$', simple_upload),
    re_path(r'^(?P<store_path>.*)upload/(?P<id>[^/]+)/$', upload),
    re_path(r'^(?P<store_path>.*)delete/(?P<item_id>[0-9]+)/$', delete),
    re_path(r'^(?P<store_path>.*)download/(?P<item_id>[0-9]+)/$', download, name='download'),
    re_path(r'^(?P<store_path>.*)update/$', update),
    re_path(r'^(?P<store_path>.*)update/(?P<since>[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}:[0-9]{2}:[0-9]{2})/$', update),
    re_path(r'^(?P<store_path>.*)unwatch/$', unwatch),
    re_path(r'^(?P<store_path>.*)watch/$', watch),
    re_path(r'^(?P<store_path>.*)/$', index, name='index'),
    re_path(r'^(?P<store_path>)$', index),
]
