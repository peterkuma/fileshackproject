#DEBUG = False

#ADMINS = (
#    # ('Your Name', 'your_email@example.com'),
#)

#DATABASES = {
#    'default': {
#        'ENGINE': 'django.db.backends.sqlite3', # Add 'postgresql_psycopg2', 'mysql', 'sqlite3' or 'oracle'.
#        'NAME': '/var/www/fileshackproject/fileshack.sqlite', # Or path to database file if using sqlite3.
#        'USER': '',                      # Not used with sqlite3.
#        'PASSWORD': '',                  # Not used with sqlite3.
#        'HOST': '',                      # Set to empty string for localhost. Not used with sqlite3.
#        'PORT': '',                      # Set to empty string for default. Not used with sqlite3.
#    }
#}

#TIME_ZONE = 'UTC'

#MEDIA_ROOT = '/var/www/fileshackproject/media/'
#MEDIA_URL = '/media/'
#STATIC_ROOT = '/var/www/fileshackproject/static/'
#STATIC_URL = '/static/'

# Serve static and media files even when DEBUG == False.
#SERVE_STATIC = True

# List of hosts which are allowed to run scheduled tasks.
#FILESHACK_CRON_HOSTS = ('127.0.0.1',)

# Shared secret for running scheduled tasks from hosts not listed
# in FILESHACK_CRON_HOSTS.
#FILESHACK_CRON_SECRET = ''

#EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
#EMAIL_HOST = 'localhost'
#EMAIL_HOST_PASSWORD = ''
#EMAIL_HOST_USER = ''
#EMAIL_PORT = 25
#EMAIL_USE_TLS = True

#FILESHACK_EMAIL_FROM = 'no-reply@example.org'

# Fileshack: Be sure to fill in a unique SECRET_KEY. Otherwise recipients
# of e-mail updates will not be able to unsubscribe by following a link.
#
# Use python -c 'from random import choice; print "".join([choice("abcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*(-_=+)") for i in range(50)])'
# to generate a unique SECRET_KEY.
#SECRET_KEY = ''
