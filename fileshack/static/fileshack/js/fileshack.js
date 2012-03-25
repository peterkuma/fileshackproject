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
        
        this.bootstrap($('bootstrap').get('text'))
        
        var dropbox = $('dropbox');
        var dropboxInput = $('dropbox-input');
        var iframe = $('iframe');
        
        if (typeof dropbox.addEventListener != 'undefined') {
            dropbox.addEventListener("dragenter", function(e) { e.preventDefault(); }, false);
            dropbox.addEventListener("dragover", function(e) { e.preventDefault(); }, false);
            dropbox.addEventListener("drop", function(e) {
                e.preventDefault();
                Array.each(e.dataTransfer.files, function(f) { this_.upload(f); });
            }, false);
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
            if (typeof e.target.files == 'undefined' || typeof FileReader == 'undefined') { // No support for File API.
                this_.uploadSimple(dropbox);
            } else { // Upload using File API.
                Array.each(e.target.files, function(file) {
                    this_.upload(file);
                });
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
    
    upload: function(file) {
        var item = undefined;
        
        Object.each(this.items.all(), function(i) {
            if (!(i.model.type == 'stale' ||
                  i.model.type == 'pending' && i.isError()))
            {
                return;
            }
            if (i.model.size_total != file.size) return;
            if (item) return;
            
            var n = i.model.name;
            if (n.contains('_')) {
                var index = n.lastIndexOf('_');
                var first = n.substring(0, index);
                var second = n.substring(index);
                n = first + second.substring(second.indexOf('.'));
            }
            
            if (n == file.name) {
                var c = confirm('A stale file with the same name and size has been found.\nDo you want to resume uploading?');
                if (c) {
                    item = i;
                    item.clearError();
                }
            }
        });

        if (!item) {
            var item = new ItemView(new Item({
                type: 'pending',
                name: file.name,
                size: 0,
                size_total: file.size,
                status: 'UPLOADING'
            }));
            this.items.add(item);
        }
        
        if (ITEM_SIZE_LIMIT > 0 && file.size > ITEM_SIZE_LIMIT) {
            item.onError({
                label: ITEM_SIZE_LIMIT_ERROR_LABEL,
                message: ITEM_SIZE_LIMIT_ERROR_MESSAGE
	    });
            return;
        }
        
        var reader = new FileReader()
        reader.onload = function(e) { item.model.upload(e.target.result); };
        reader.readAsBinaryString(file);
    },
    
    // No upload by chunks, no resume.
    uploadSimple: function(form) { 
        if (typeof FormData == 'undefined') { // No File API, just submit the form. No progress indication.
            form.submit();
            return;
        }
        
        var item = new ItemView(new Item({
            type: 'pending',
            name: basename(form.file.value),
            size: 0,
            size_total: 0,
            status: 'UPLOADING'
        }));
        this.items.add(item);
        
        item.model.uploadSimple(new FormData(form));
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






