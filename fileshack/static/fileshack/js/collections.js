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
    
    find: function(func) {
	var view = null;
	Object.each(this.views, function(v) {
	    if (view) return; // Already found.
	    if (func(v)) view = v;
	});
	return view;
    },

    add: function(view) {
	var this_ = this;
	var id = view.model[view.model.pk];
	if (this.views[id]) return;
	this.views[id] = view;
	view.model.addEvent('change', function() {
            if (id != view.model[view.model.pk]) {
                this_.views[view.model[view.model.pk]] = view;
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
	delete this.views[view.model[view.model.pk]];
    },
    
    contains: function(id) {
	return (id in this.views);
    }
});
