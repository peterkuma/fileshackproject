from models import *
from django.contrib import admin

class StoreAdmin(admin.ModelAdmin):
    list_display = ("__unicode__",)

class ItemAdmin(admin.ModelAdmin):
    pass

admin.site.register(Store, StoreAdmin)
admin.site.register(Item, ItemAdmin)

