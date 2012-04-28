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

var View = new Class({
    attributes: [],
    
    initialize: function(model) {
        this.model = model;
        this.el = $(this.template).clone(true, false);
	
	var this_ = this;
	Array.each(this.attributes, function(attr) {
            this_[attr] = this_.el.getElements('.'+attr)[0];
        });
        model.addEvent('change', function() { this_.render(); });
	model.addEvent('remove', function() { this_.el.parentNode.removeChild(this_.el); } );
        this.render();
    },
    
    render: function() {
        return this;
    }
});

var ItemView = new Class({
    Extends: View,
    
    template: 'item-template',
    attributes: ['box', 'name', 'size', 'progress_container', 'progress',
		 'progressbar', 'progressbar_alt', 'progress_size',
		 'uploaded', 'desc', 'deletebtn', 'cancelbtn', 'buttons',
		 'error', 'error_label', 'error_message', 'error_details', 'error_close'],
    
    initialize: function(model) {
	this.parent(model);
	var this_ = this;
	model.addEvent('error', function(e) { this_.onError(e); });
	this.deletebtn.addEvent('click', function(e) {
	    e.preventDefault();
	    this_.model.del();
	    return false;
	});
	this.cancelbtn.addEvent('click', function(e) {
	    e.preventDefault();
	    this_.model.del();
	    return false;
	});
	this.error_close.addEvent('click', function(e) {
	    this_.clearError();
	    if (this_.model.size > 0)
		this_.model.set('type', 'stale');
	    else
		this_.model.del();
	});
	if (!this.progressbar) {
	    this.progressbar = this.progressbar_alt;
	    this.progressbar.removeClass('progressbar_alt');
	    this.progressbar.addClass('progressbar');
	}
	emulateProgress(this.progressbar);
    },
    
    show: function(what) {
	var this_ = this;
	Array.each(what, function(w) { this_[w].setStyle('display', 'block'); });
    },
    
    hide: function(what) {
	var this_ = this;
	Array.each(what, function(w) { this_[w].setStyle('display', 'none'); });
    },
    
    render: function() {
        this.name.set('text', this.model.name);
	this.size.set('text', bytesToHuman(this.model.size_total));
	this.uploaded.set('text', this.model.uploaded.format('%e %B %Y'));
	this.progress_size.set('text', bytesToHuman(this.model.size) + ' / ' + bytesToHuman(this.model.size_total));
	if (this.progressbar) {
	    if (this.model.size_total != 0)
		this.progressbar.value = (this.model.size * 100)/this.model.size_total;
	    else
		this.progressbar.value = 1;
	    updateProgress(this.progressbar);
	}
	var percentage = 0;
	if (this.model.size > 0 && this.model.size_total > 0)
	    percentage = Math.round((this.model.size * 100)/this.model.size_total);
	this.progress.set('text', percentage + ' %');    
	if (this.model.type == 'stale') this.progress.set('text', 'stale');
	if (this.model.type == 'pending' && !this.model.size_total) {
	    this.progress.set('text', '');
	    this.progress_size.set('text', '');
	}
	
	if (this.model.url) this.box.href = this.model.url;
	else this.box.href = 'javascript: return false';
	
	this.el.removeClass('complete');
	this.el.removeClass('pending');
	this.el.removeClass('unfinished');
	this.el.removeClass('stale');
	this.el.addClass(this.model.type);
    },
    
    onError: function(e) {
	this.error.setStyle('display', 'block');
	this.error_label.set('text', e.label);
	if (e.message_html) this.error_message.set('html', e.message_html);
	else this.error_message.set('text', e.message)
	if (e.details && window.btoa) {
	    this.error_details.setStyle('display', 'block');
	    this.error_details.href = 'data:text/html;base64,' + window.btoa(e.details);
	}
	this.el.addClass('selected');
    },
    
    clearError: function() {
	this.error.setStyle('display', 'none');
    },
    
    isError: function() {
	return this.error.getStyle('display') == 'block';
    }
});

var WatcherView = new Class({
    Extends: View,
    
    template: 'watcher-template',
    attributes: ['email', 'deletebtn'],
    
    initialize: function(model) {
	this.parent(model);
	var this_ = this;
	this.deletebtn.addEvent('click', function() {
	    this_.model.del();
	});
	this.model.addEvent('error', function(e) { this_.onError(e); });
    },
    
    render: function() {
	this.email.set('text', this.model.email);
    },
    
    onError: function(e) {
	var label = $$('#watch-error .label')[0];
        var message = $$('#watch-error .message')[0];
        var details = $$('#watch-error .details')[0];
	
	if (e.label) label.set('text', e.label+'.');
	if (e.message_html)
	    message.set('html', e.message_html);
	else
	    message.set('text', e.message);
	if (e.details) {
	    details.href = 'data:text/html;base64,' + window.btoa(e.details);
	    details.show();
	}
	$('watch-error').show();
    }
});
