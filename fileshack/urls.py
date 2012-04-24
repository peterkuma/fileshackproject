from django.conf.urls.defaults import patterns, include, url

urlpatterns = patterns('fileshack.views',
    url(r'^cron/$', 'cron', name='cron'),
    url(r'^unsubscribe/$', 'unsubscribe', name='unsubscribe'),
    url(r'^(?P<store_path>.*)logout/$', 'logout'),
    url(r'^(?P<store_path>.*)iframe/$', 'iframe'),
    url(r'^(?P<store_path>.*)upload/$', 'simple_upload'),
    url(r'^(?P<store_path>.*)upload/(?P<id>[^/]+)/$', 'upload'),
    url(r'^(?P<store_path>.*)delete/(?P<item_id>[0-9]+)/$', 'delete'),
    url(r'^(?P<store_path>.*)download/(?P<item_id>[0-9]+)/$', 'download', name='download'),
    url(r'^(?P<store_path>.*)update/$', 'update'),
    url(r'^(?P<store_path>.*)update/(?P<since>[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{2}:[0-9]{2}:[0-9]{2})/$', 'update'),
    url(r'^(?P<store_path>.*)unwatch/$', 'unwatch'),
    url(r'^(?P<store_path>.*)watch/$', 'watch'),
    url(r'^(?P<store_path>.*)/$', 'index', name='index'),
    url(r'^(?P<store_path>)$', 'index'),
)
