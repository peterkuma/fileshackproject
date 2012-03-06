var Collection = new Class({
    Implements: Events,
    
    initialize: function() {
	this.views = {};
    },
    
    get: function(id) {
	return this.views[id];
    },
    
    all: function() {
	return this.views;
    },

    add: function(view) {
	var this_ = this;
	var id = view.model.id;
	this.views[id] = view;
	view.model.addEvent('change', function() {
            if (id != view.model.id) {
                this_.views[view.model.id] = view;
                delete this_.views[id];
                id = view.model.id;
            }
	    this_.fireEvent('change', view);
        });
	view.model.addEvent('remove', function() {
	    this_.remove(view);
	});
	this.fireEvent('add', view);
    },
    
    remove: function(view) {
	delete this.views[view.model.id];
	this.fireEvent('remove', view);
    },
    
    contains: function(id) {
	return (id in this.views);
    }
});
