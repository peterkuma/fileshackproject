from django.urls import path
from django.conf.urls import include, url
from django.contrib import admin
from django.conf import settings
import django.views.static
import fileshack.urls

admin.autodiscover()

handler404 = 'fileshack.views.page_not_found'
handler500 = 'fileshack.views.server_error'

urlpatterns = []

if settings.DEBUG or settings.SERVE_STATIC:
    urlpatterns += [
	url(r'^static/(?P<path>.*)$', django.views.static.serve, {'document_root': settings.STATIC_ROOT}),
	url(r'^media/(?P<path>.*)$', django.views.static.serve, {'document_root': settings.MEDIA_ROOT}),
    ]

urlpatterns += [
    # Be sure to comment out the following line in a production environment!
    #url(r'^static/(?P<path>.*)$', 'django.views.static.serve', {'document_root': settings.STATIC_ROOT}),
    #url(r'^media/(?P<path>.*)$', 'django.views.static.serve', {'document_root': settings.MEDIA_ROOT}),
    path('admin/doc/', include('django.contrib.admindocs.urls')),
    path('admin/', admin.site.urls),
    url(r'^', include(fileshack.urls)),
]
