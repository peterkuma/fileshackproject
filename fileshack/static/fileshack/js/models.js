/*
 * Copyright (c) 2012 Peter Kuma
   
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

var Model = new Class({
    Implements: Events,
    
    defaults: {
	pk: 'id'
    },

    initialize: function(attributes) {
        for (var attr in this.defaults) {
            this[attr] = this.defaults[attr];
        }
	for (var attr in attributes) {
	    this[attr] = attributes[attr];
	}
    },
    
    set: function(attr, value) {
	if (this[attr] != value) {
	    this[attr] = value;
	    this.fireEvent('change');
	}
    },
    
    get: function(attr) {
        return this[attr];
    },
    
    update: function(json) {
        for (var attr in json) {
	    this[attr] = json[attr];
	}
	this.fireEvent('change');
    },
    
    remove: function() {
	this.fireEvent('remove');
    }
});

var Item = new Class({
    Extends: Model,
    
    defaults: {
	id: uuid(),
	type: 'complete', // 'pending', 'unfinished', 'stale', 'complete'.
        name: '',
	url: '',
        size: 0,
        size_total: 0,
        status: 'READY', // 'READY', 'UPLOADING', 'STALE'.
        created: new Date(),
        uploaded: new Date(),
        modified: new Date()
    },
    
    update: function(json) {
	if (this.type == 'pending')
	    ; // Do nothing.
	else if (json.status == 'READY')
	    this.type = 'complete';
	else if (json.status == 'UPLOADING')
	    this.type = 'unfinished';
	else if (json.status == 'STALE')
	    this.type = 'stale';
	
	for (var attr in json) {
	    if (this.type == 'pending' && (attr == 'status' || attr == 'size'))
		continue;
	    this[attr] = json[attr];
	}
	this.modified = new Date().parse(json.modified);
	this.uploaded = new Date().parse(json.uploaded);
	this.created = new Date().parse(json.created);
	
	this.fireEvent('change');
    },
    
    remove: function() {
	if (this.xhr) this.xhr.abort();
	//this.parent();
	this.fireEvent('remove');
    },
    
    del: function() {
	if (this.xhr) this.xhr.abort();
	
	var xhr = new XMLHttpRequest();
	xhr.open('POST', 'delete/' + this.id + '/');
	xhr.setRequestHeader('X-CSRFToken', CSRF_TOKEN);
	
	var this_ = this;
	xhr.onreadystatechange = function(e) {
	    if (this.readyState == this.DONE) {
		this_.remove();
	    }
	};
	xhr.send('csrfmiddlewaretoken='+CSRF_TOKEN);
	
	this.remove();
    },
    
    upload: function(data, chunkSize) {
	this.set('type', 'pending');
	
	this.xhr = new XMLHttpRequest();
        this.xhr.open('POST', 'upload/' + this.id + '/');
	
	var this_ = this;
	var origSize = this.size;
	var startTime = new Date().getTime();
	
	if (typeof chunkSize == 'undefined')
	    chunkSize = CHUNK_SIZE;
	
	if (typeof data == 'string' && data.length < this.size + chunkSize)
	    chunkSize = data.length - this.size;
	
	if (this.xhr.upload) {
	    this.xhr.upload.addEventListener('progress', function(e) {
		if (typeof data == 'string') {
		    this_.set('size', origSize + e.position/e.total*chunkSize);
		} else {
		    this_.set('size', e.loaded);
		    this_.set('size_total', e.total);
		}
	    }, false);
	
	    this.xhr.upload.addEventListener('load', function(e) {
		if (typeof data == 'string') this_.set('size', origSize + chunkSize);
	    }, false);
	}
	
	this.xhr.onreadystatechange = function(e) {
	    if (this.readyState == 4) {
		try {
		    var response = JSON.decode(this.responseText);
		} catch(e) {
		    this_.fireEvent('error', {
			label: 'Upload failed',
			message: 'The server responded with an invalid message',
			details: this.responseText
		    });
		}
		
		if (this.status == 200 && response.status == 'success') {
		    if (typeof data == 'string') this_.size = origSize + chunkSize;
		    this_.update(response.item);
		    if (typeof data == 'string' && this_.size < this_.size_total) {
			elapsedTime = new Date().getTime() - startTime;
			if (elapsedTime < CHUNK_UPLOAD_LOW*1000) {
			    chunkSize *= 2;
			    //console.log('Doubling chunk size');
			}
			if (elapsedTime > CHUNK_UPLOAD_HIGH*1000) {
			    chunkSize /= 2;
			    if (chunkSize < 32*1024) chunkSize = 32*1024;
			    //console.log('Halving chunk size');
			}
			    
			// Upload the next chunk.
			this_.upload(data, chunkSize);
		    } else {
			// We are done.
			this_.set('type', 'complete');
		    }
		} else if (this.status == 403) {
		    this_.fireEvent('error', {
			label: 'Your session expired',
			message_html: 'Please <a href="javascript:location.reload(true)">log in again</a>'
		    });
		} else if (this.status != 0) {
		    // Revert to the original size as the chunk upload failed.
		    this_.set('size', origSize);
		    if (response) {
			this_.fireEvent('error', {
			    label: response.error_label,
			    message: response.error_message
			});
		    } else {
			this_.fireEvent('error', {
			    label: 'Application Error',
			    message: this.status+' '+this.statusText,
			    details: this.responseText
			});
		    }
		} else {
		    // Revert to the original size as the chunk upload failed.
		    this_.set('size', origSize);
		    this_.fireEvent('error', {
			label: 'Upload failed',
			message: 'The upload was terminated before completion'
		    });
		}
	    }
	};
	
	if (typeof data == 'string') {
	    var chunk = data.substring(this.size, this.size + chunkSize);
	    var boundary = 'xxxxxxxxxxxxxxxxxxxx';
	    var body = '--' + boundary + '\r\n';
	    body += 'Content-Disposition: form-data; name="file"; filename="' + encodeURIComponent(this.name) + '"\r\n';
	    body += 'Content-Type: application/octet-stream\r\n';
	    body += '\r\n';
	    body += window.btoa(chunk) + '\r\n';
	    body += '--' + boundary + '--\r\n';
	    this.xhr.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
	    this.xhr.setRequestHeader('Content-Length', body.length);
	    this.xhr.setRequestHeader('X-File-Size', this.size_total);
	    this.xhr.setRequestHeader('X-File-Offset', this.size);
	    this.xhr.setRequestHeader('X-File-Encoding', 'base64');
	} else {
	    var body = data;
	}
	
	this.xhr.setRequestHeader('X-File-Name', this.name);
	this.xhr.setRequestHeader('X-CSRFToken', CSRF_TOKEN);
	if (this.xhr.sendAsBinary) this.xhr.sendAsBinary(body);
	else this.xhr.send(body);
    }
});

var Watcher = new Class({
    Extends: Model,
    
    defaults: {
	pk: 'email',
	email: '',
	digest: 'daily', // 'immediately', 'hourly', 'daily', 'weekly'.
	last_notification: new Date(),
	created: new Date()
    },
    
    save: function() {
	var this_ = this;
	
	var req = new Request.JSON({
	    url: 'watch/',
	    headers: { 'X-CSRFToken': CSRF_TOKEN },
	    data: {
		email: this.email,
		digest: this.digest
	    },
	    onSuccess: function(response) {
		this_.update(response.watcher);
		this_.fireEvent('save');
	    },
	    onFailure: function(xhr) {
		if (xhr.status == 403) {
		    this_.fireEvent('error', {
			label: 'Session expired',
			message_html: 'Please <a href="javascript:location.reload(true)">log in again</a>'
		    });
		} else {
		    try {
			var response = JSON.decode(xhr.responseText);
			this_.fireEvent('error', response);
		    } catch(e) {
			this_.fireEvent('error', {
			    message: xhr.statusText,
			    details: xhr.responseText
			});
		    }
		}
	    }
	});
	req.send();
    },
    
    del: function() {
	var this_ = this;
	var req = new Request.JSON({
	    url: 'unwatch/',
	    headers: { 'X-CSRFToken': CSRF_TOKEN },
	    data: { email: this.email },
	    onSuccess: function() {
		this_.remove();
	    },
	    onFailure: function(xhr) {
		if (xhr.status == 403) {
		    this_.fireEvent('error', {
			label: 'Session expired',
			message_html: 'Please <a href="javascript:location.reload(true)">log in again</a>'
		    });
		} else {
		    this_.fireEvent('error', {
			message: xhr.statusText,
			details: xhr.responseText
		    });
		}
	    }
	}).send();
    }
});
