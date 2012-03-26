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
        
        // Bootstrap items from JSON embedded in index.html.
        this.bootstrap($('bootstrap').get('text'))
        
        var dropbox = $('dropbox');
        var dropboxInput = $('dropbox-input');
        var iframe = $('iframe');
        
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
        
        dropboxInput.onclick = function(e) {
            if (typeof e.stopPropagation != 'undefined')
                e.stopPropagation();
        };
        
        if (Browser.ie && Browser.version <= 7) {
            // Show the file upload input form.
            $('dropbox-text').setStyle('display', 'none');
            $('dropbox-file').setStyle('visibility', 'visible');
            dropboxInput.addEvent('change', function() { dropbox.submit(); });
        } else {
            // Delegate click on dropbox to the hidden input file element.
            dropbox.addEvent('click', function(e) {
                if (typeof File != 'undefined') {
                    dropboxInput.click();
                } else { // Fallback to upload by the iframe hack (IE).
                    if (typeof iframe.contentDocument != 'undefined')
                        var form = iframe.contentDocument.forms[0];
                    else
                        var form = iframe.getDocument().forms[0];
                    form.file.click();
                    iframe.onload = function() { this_.update(); };
                }
            });
        }
        
        dropbox.addEvent('change', function(e) {
            if (e.target.files && (typeof FileReader != 'undefined' || typeof FormData == 'undefined')) {
                Array.each(e.target.files, function(file) {
                    console.log(file);
                    this_.upload(file);
                });
            } else {
                this_.upload(dropbox);
            }
            dropbox.reset();
        });
        
        //window.setInterval(function() { this_.update() }, this.options.updateInterval);
        window.uuid = uuid();
        //this.update();
    },
    
    bootstrap: function(json) {
        var this_ = this;
        items = JSON.decode(json);
        Array.each(items, function(item) {
            var view = new ItemView(new Item());
            view.model.update(item);
            this_.items.add(view);
        });
    },
    
    update: function() {
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
                this.lastUpdate = json.time;
            }
        };
        xhr.send();
    },
    
    upload: function(data) {
        // Determine name and size of the file.
        if (typeof File != 'undefined' && data instanceof File) {
            // Older browsers.
            if (data.fileName) var name = data.fileName;
            if (data.fileSize) var size = data.fileSize;
            // Newer browsers.
            if (data.name) var name = data.name;
            if (data.size) var size = data.size;
        } else if (data instanceof HTMLFormElement) {
            var name = basename(data.file.value);
        } else {
            var name = '';
            var size = 0;
        }
        
        // Is there a stale item with the same size and name?
        var i = this.items.find(function(i) {
            if (!(i.model.type == 'stale' || i.model.type == 'pending' && i.isError()))
                return false;
            if (i.model.size_total != file.size) return false;
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
        
        // If this is a File and FileReader is supported, ask the user about resume.
        if (i && typeof FileReader != 'undefined' && data instanceof File) {
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
            return;
        }
        
        if (typeof File != 'undefined' && data instanceof File && typeof FileReader != 'undefined') {
            var reader = new FileReader()
            reader.onload = function(e) { item.model.upload(e.target.result); };
            reader.readAsBinaryString(data);
        } else if (data instanceof HTMLFormElement && typeof FormData != 'undefined') {
            item.model.upload(new FormData(data));
        } else if (typeof File != 'undefined' && data instanceof File) {
            item.model.upload(data);
        } else {
            data.submit();
        }
    },
    
    removeStaleItems: function(validIds) {
        Object.each(this.items.all(), function(item) {
            if (item.model.type != 'pending' && !validIds.contains(item.model.id))
                item.model.remove();
        });
    }
});

document.addEvent('domready', function() {
    var fs = new FileShack();
});






