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

var FileShack = new Class({
    Implements: Options,
    
    options: {
        updateInterval: 2000
    },
    
    initialize: function(options) {
        var this_ = this;
        
        this.setOptions(options);
        this.lastUpdate = undefined;
        
        this.items = new Collection();
        this.items.addEvent('add', function(view) {
            $('list').insertBefore(view.el, $('list').firstChild);
        });
        
        var bootstrap = JSON.decode($('bootstrap').get('text'));
        this.bootstrap(bootstrap.items);
        
        var dropbox = $('dropbox');
        var dropboxInput = $('dropbox-input');
        
        // Drag & Drop.
        if (typeof dropbox.addEventListener != 'undefined' &&
            typeof dropbox.ondrop != 'undefined' &&
            typeof File != 'undefined')
        {
            // Register Drag & Drop events.
            dropbox.addEventListener("dragenter", function(e) { e.preventDefault(); }, false);
            dropbox.addEventListener("dragover", function(e) { e.preventDefault(); }, false);
            dropbox.addEventListener("drop", function(e) {
                e.preventDefault();
                if (e.dataTransfer.files)
                    Array.each(e.dataTransfer.files, function(f) { this_.upload(f); });
            }, false);
        } else {
            // Switch dropbox text, drag & drop is not supported.
            $('dropbox-text').setStyle('display', 'none');
            $('dropbox-text-nodragndrop').setStyle('display', 'block');
        }
        
        var clickDelegated = false;
        dropboxInput.onclick = function(e) {
            clickDelegated = true;
            if (e && e.stopPropagation) e.stopPropagation();
        };
        
        if (Browser.ie && Browser.version <= 7) {
            this.fallback();
        } else {
            // Delegate click on dropbox to the hidden input file element.
            dropbox.addEvent('click', function() {
                if (typeof File != 'undefined') {
                    dropboxInput.click();
                    window.setTimeout(function() { if (!clickDelegated) this_.fallback(); }, 100);
                } else { // Fallback to upload by the iframe hack (IE).
                    this_.uploadIFrame();
                }
            });
        }
        
        dropboxInput.addEvent('change', function() {
            this_.upload(dropbox);
            dropbox.reset();
        });
        
        //window.setInterval(function() { this_.update() }, this.options.updateInterval);
        //this.update();
        
        if ($('watchbtn')) {
            // Watch dialog.
            watch = new Watch();
            watch.bootstrap(bootstrap.watchers);
        }
    },
    
    bootstrap: function(items) {
        var this_ = this;
        Array.each(items, function(item) {
            var view = new ItemView(new Item());
            view.model.update(item);
            this_.items.add(view);
        });
    },
    
    fallback: function() {
        var this_ = this;
        // Show the file upload input form.
        $('dropbox-text').setStyle('display', 'none');
        $('dropbox-text-nodragndrop').setStyle('display', 'none');
        $('dropbox-file').setStyle('visibility', 'visible');
    },
    
    update: function() {
	var this_ = this;
        var xhr = new XMLHttpRequest();
        
        if (this.lastUpdate) xhr.open('GET', 'update/' + this.lastUpdate + '/');
        else xhr.open('GET', 'update/');
        
        var this_ = this;
        xhr.onreadystatechange = function(e) {
            if (this.readyState == 4) {
                json = JSON.decode(this.responseText);
                this_.removeStaleItems(json.item_ids);
                Array.each(json.items, function(item) {                    
                    if (this_.items.get(item.id)) { // Existing item.
                        // Do not update pending items.
                        if (this_.items.get(item.id).model.type != 'pending')
                            this_.items.get(item.id).model.update(item);
                    } else { // New item.
                        var view = new ItemView(new Item());
                        view.model.update(item);
                        this_.items.add(view);
                    }
                });
                this_.lastUpdate = json.time;
            }
        };
        xhr.send();
    },
    
    upload: function(data) {
        var this_ = this;
        // If input[type="file"].files is supported, upload per parts.
        if (typeof HTMLFormElement != 'undefined' && data instanceof HTMLFormElement &&
            data.file && data.file.files)
        {
            Array.each(data.file.files, function(file) { this_.upload(file); });
            return null;
        }
        
        // Determine name and size of the file.
        if (typeof File != 'undefined' && data instanceof File) {
            // Older browsers.
            if (data.fileName) var name = data.fileName;
            if (data.fileSize) var size = data.fileSize;
            // Newer browsers.
            if (data.name) var name = data.name;
            if (data.size) var size = data.size;
        } else if (data.file) {
            var name = basename(data.file.value);
        } else {
            var name = '';
            var size = 0;
        }
        
        // Is there a stale item with the same size and name?
        var i = this.items.find(function(i) {
            if (!(i.model.type == 'stale' || i.model.type == 'pending' && i.isError()))
                return false;
            if (i.model.size_total != size) return false;
            if (i.model.name == name) return true;
            var n = i.model.name;
            // Django appends _#no to duplicate file names, account for that.
            if (n.contains('_')) {
                var index = n.lastIndexOf('_');
                var first = n.substring(0, index);
                var second = n.substring(index);
                n = first + second.substring(second.indexOf('.'));
            }
            if (n == name) return true;
            return false;
        });
        
        // If this is a File, ask the user about resume.
        if (i && typeof File != 'undefined' && data instanceof File) {
            var c = confirm('A stale file with the same name and size has been found.\nDo you want to resume uploading?');
            if (c) {
                item = i;
                item.clearError();
            }
        }

        if (!item) {
            var item = new ItemView(new Item({
                type: 'pending',
                'name': name,
                size: 0,
                size_total: size,
                status: 'UPLOADING'
            }));
            this.items.add(item);
        }
        
        if (ITEM_SIZE_LIMIT > 0 && size > ITEM_SIZE_LIMIT) {
            item.onError({
                label: ITEM_SIZE_LIMIT_ERROR_LABEL,
                message: ITEM_SIZE_LIMIT_ERROR_MESSAGE
	    });
            return null;
        }
        
	if (typeof File != 'undefined' && data instanceof File &&
	    typeof FormData != 'undefined' &&
	    (data.slice || data.mozSlice || data.webkitSlice))
	{
	    item.model.upload(data);
	} else if (typeof File != 'undefined' && data instanceof File && typeof FileReader != 'undefined') {
            var reader = new FileReader()
            reader.onload = function(e) { item.model.upload(e.target.result); };
            reader.readAsBinaryString(data);
	} else if (typeof HTMLFormElement != 'undefined' && data instanceof HTMLFormElement && typeof FormData != 'undefined') {
            item.model.upload(new FormData(data));
        } else if (typeof File != 'undefined' && data instanceof File && typeof FormData != 'undefined') {
            var formData = new FormData();
            formData.append('file', data);
            item.model.upload(formData);
        } else if (typeof File != 'undefined' && data instanceof File) {
            item.model.upload(data.getAsBinary());
        } else {
            data.submit();
        }
        
        return item;
    },
    
    uploadIFrame: function() {
        var this_ = this;
        var iframe = $('iframe');
        var form = iframe.contentDocument.forms[0];
        
        form.file.onchange = function() {
            var item = this_.upload(form);
            iframe.onload = function() {
                var responseText = iframe.contentDocument.body.innerHTML;
                iframe.onload = null;
                iframe.src = iframe.src;
                try {
		    var response = JSON.decode(responseText);
		} catch(e) {
		    item.onError({
			label: 'Upload failed',
			message: 'The server responded with an invalid message',
			details: responseText
		    });
                    return;
		}
                item.model.update(response.item);
                if (response.status != 'success') {
                    item.onError({
			label: response.error_label,
			message: response.error_message,
                        details: response.details
                    });
                    return;
                }
                item.model.set('type', 'complete');
                item.model.update(response.item);
            };
        };
        form.file.click();
    },
    
    removeStaleItems: function(validIds) {
        Object.each(this.items.all(), function(item) {
            if (item.model.type != 'pending' && !validIds.contains(item.model.id))
                item.model.remove();
        });
    }
});

var Watch = new Class({
    initialize: function() {
        var this_ = this;
        
        this.watchers = new Collection();
        this.watchers.addEvent('add', function(view) {
            $('watch-list').appendChild(view.el);
        });
        
        this.watchbtn = $('watchbtn');
        this.dialog = $('watch-dialog');
        this.form = $$('#watch-dialog .new')[0];
        this.email = $$('#watch-dialog .new input[name="email"]')[0];
        this.submit = $$('#watch-dialog .new button[type="submit"]')[0];
        this.error = $('watch-error');
        
        if (!this.form.checkValidity) {
            this.form.checkValidity = function() {
                var pattern  = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/;
                return this.email.value.match(pattern);
            }
        }
        
        var fx = new Fx.Reveal(this.dialog, {
            transition: Fx.Transitions.Sine.easeOut,
            duration: 100
        });
        
        window.addEvent('resize', function() { this_.positionDialog(); });
        this.positionDialog();
        
        this.email.addEvent('change', function() { this_.render(); });
        this.email.addEvent('keyup', function() { this_.render(); });
        this.watchbtn.addEvent('click', function() {
            if (this_.watchbtn.hasClass('active')) {
                this_.watchbtn.removeClass('active');
            } else {
                this_.watchbtn.addClass('active');
            }
            fx.toggle();
        });
        this.submit.addEvent('click', function(e) {
            if (e.preventDefault) e.preventDefault();
            if (!this_.form.checkValidity()) return;
            var watcher = new WatcherView(new Watcher({
                email: this_.email.value,
            }));
	    watcher.model.addEvent('save', function() {
		this_.form.reset();
		this_.submit.removeClass('active');
		this_.error.hide();
		this_.watchers.add(watcher);
		this_.email.disabled = false;
		this_.submit.disabled = false;
	    });
	    watcher.model.addEvent('error', function() {
		this_.email.disabled = false;
		this_.submit.disabled = false;		
	    });
	    this_.email.disabled = true;
	    this_.submit.disabled = true;
            watcher.model.save();
        });
    },
    
    positionDialog: function() {
        var display = this.dialog.getStyle('display');
        var visibility = this.dialog.getStyle('visibility');
        this.dialog.setStyle('visibility', 'hidden');
        this.dialog.setStyle('display', 'block');
        this.dialog.setStyle('left', this.watchbtn.getPosition().x +
                                     this.watchbtn.getSize().x/2 -
                                     this.dialog.getSize().x/2);
        this.dialog.setStyle('top', this.watchbtn.getPosition().y +
                                    this.watchbtn.getSize().y);
        this.dialog.setStyle('display', display);
        this.dialog.setStyle('visibility', visibility);
    },
    
    render: function() {
        if (this.form.checkValidity()) this.submit.addClass('active');
        else this.submit.removeClass('active');
    },
    
    bootstrap: function(watchers) {
        var this_ = this;
        Array.each(watchers, function(watcher) {
            var view = new WatcherView(new Watcher());
            view.model.update(watcher);
            this_.watchers.add(view);
        });
    }
});

document.addEvent('domready', function() {
    var fs = new FileShack();
});






