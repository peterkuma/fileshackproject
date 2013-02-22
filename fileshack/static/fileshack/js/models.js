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
	id: -1,
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
    
    initialize: function(attributes) {
	this.parent(attributes);
	this.id = uuid();
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
    
    upload: function(data, offset, len) {
	if (typeof offset == 'undefined') offset = this.size;
	if (typeof data == 'string') this.set('size_total', data.length);
	if (data.size) this.set('size_total', data.size);
	if (typeof len == 'undefined') len = CHUNK_SIZE;
	if (this.size + len > this.size_total)
	    len = this.size_total - this.size;
	  
	this.set('type', 'pending');
	
	this.xhr = new XMLHttpRequest();
        this.xhr.open('POST', 'upload/' + this.id + '/');
	
	var this_ = this;
	var startTime = new Date().getTime();
	
	if (this.xhr.upload) {
	    this.xhr.upload.addEventListener('progress', function(e) {
		if (!this_.size_total) this_.set('size_total', e.total);
		if (!len) len = this_.size_total;
		this_.set('size', offset + e.position/e.total*len);
	    }, false);
	
	    this.xhr.upload.addEventListener('load', function(e) {
		if (typeof data == 'string') this_.set('size', offset + len);
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
		    this_.size = offset + len;
		    this_.update(response.item);
		    
		    if (this_.size < this_.size_total) {
			elapsedTime = new Date().getTime() - startTime;
			if (elapsedTime < CHUNK_UPLOAD_LOW*1000) {
			    len *= 2;
			    //if (len > 64*1024*1024) len = 64*1024*1024;
			    //console.log('Doubling chunk size');
			}
			if (elapsedTime > CHUNK_UPLOAD_HIGH*1000) {
			    len /= 2;
			    if (len < 32*1024) len = 32*1024;
			    //console.log('Halving chunk size');
			}
			    
			// Upload the next chunk.
			this_.upload(data, this_.size, len);
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
		    this_.set('size', offset);
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
		    this_.set('size', offset);
		    this_.fireEvent('error', {
			label: 'Upload failed',
			message: 'The upload was terminated before completion'
		    });
		}
	    }
	};
	
	if (typeof File != 'undefined' && data instanceof File && typeof FormData != 'undefined') {
	    if (data.mozSlice) var chunk = data.mozSlice(offset, offset + len);
	    else if (data.webkitSlice) var chunk = data.webkitSlice(offset, offset + len);
	    else var chunk = data.slice(offset, offset + len);
	    var body = new FormData();
	    body.append('file', chunk);
	} else if(typeof data == 'string') {
	    var boundary = 'xxxxxxxxxxxxxxxxxxxx';
	    var body = '--' + boundary + '\r\n';
	    body += 'Content-Disposition: form-data; name="file"; filename="' + encodeURIComponent(this.name) + '"\r\n';
	    body += 'Content-Type: application/octet-stream\r\n';
	    body += '\r\n';
	    body += window.btoa(data.substring(offset, offset + len)) + '\r\n';
	    body += '--' + boundary + '--\r\n';
	    this.xhr.setRequestHeader('Content-Type', 'multipart/form-data; boundary=' + boundary);
	    this.xhr.setRequestHeader('X-File-Encoding', 'base64');
	} else {
	    var body = data;
	    len = this.size_total - offset;
	}
	
	if (this.size_total) this.xhr.setRequestHeader('X-File-Size', this.size_total);
	this.xhr.setRequestHeader('X-File-Offset', offset);
	this.xhr.setRequestHeader('X-File-Name', encodeURIComponent(this.name));
	this.xhr.setRequestHeader('X-CSRFToken', CSRF_TOKEN);
	this.xhr.send(body);
	body = null;
    }
});

var Watcher = new Class({
    Extends: Model,
    
    defaults: {
	pk: 'email',
	email: '',
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
		} else if (xhr.status != 0) {
		    try {
			var response = JSON.decode(xhr.responseText);
			this_.fireEvent('error', response);
		    } catch(e) {
			this_.fireEvent('error', {
			    message: xhr.statusText,
			    details: xhr.responseText
			});
		    }
		} else {
		    this_.fireEvent('error', {
			message: 'Request failed'
		    });		    
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
	    onFailure: function(xhr) {
		if (xhr.status == 403) {
		    this_.fireEvent('error', {
			label: 'Session expired',
			message_html: 'Please <a href="javascript:location.reload(true)">log in again</a>'
		    });
		} else if (xhr.status != 0) {
		    this_.fireEvent('error', {
			message: xhr.statusText,
			details: xhr.responseText
		    });
		} else {
		    this_.fireEvent('error', {
			message: 'Request failed'
		    });
		}
	    }
	}).send();
	
	this_.remove();
    }
});
