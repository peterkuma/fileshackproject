var View = new Class({
    attributes: [],
    
    initialize: function(model) {
        this.model = model;
        this.el = $(this.template).cloneNode(true);
	
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
		 'progressbar', 'progress_size',
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
	    this_.model.set('type', 'stale');
	});
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
	if (this.model.size_total != 0)
	    this.progressbar.value = (this.model.size * 100)/this.model.size_total;
	else
	    this.progressbar.value = 1;
	
	var percentage = 0;
	if (this.model.size > 0 && this.model.size_total > 0)
	    percentage = Math.round((this.model.size * 100)/this.model.size_total);
	this.progress.set('text', percentage + ' %');    
	if (this.model.type == 'stale') this.progress.set('text', 'stale');
	
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
	if (e.details) {
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
