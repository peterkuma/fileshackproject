from urlparse import urljoin
from django import template
from django.conf import settings

register = template.Library()

@register.simple_tag
def static(path):
    return urljoin(settings.STATIC_URL, path)
