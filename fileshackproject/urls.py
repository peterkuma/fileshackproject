from django.conf.urls.defaults import patterns, include, url
from django.contrib import admin
from django.conf import settings

admin.autodiscover()

handler404 = 'fileshack.views.page_not_found'
handler500 = 'fileshack.views.server_error'

urlpatterns = patterns('')

urlpatterns += patterns('',
    url(r'^admin/doc/', include('django.contrib.admindocs.urls')),
    url(r'^admin/', include(admin.site.urls)),
    url(r'^', include('fileshack.urls', 'fileshack')),
)
