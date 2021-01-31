function go(url, dir) {
	var request = new Request.HTML({
		url: url,
		onSuccess: function(responseTree, responseElements, responseHTML, responseJavaScript) {
			var el = new Element('div').set('html', responseHTML);
			var nav = el.getElements('nav')[0];
			var article = el.getElements('article')[0];
			//var footer = el.getElements('footer')[0];
			
			var old = new Object();
			old.nav = $$('nav')[0];
			old.article = $$('article')[0];
			//old.footer = $$('footer')[0];
			
			var content = $('content');
			var width = old.article.getSize().x
			
			article.setStyle('position', 'absolute');
			article.setStyle('top', 0);
			if (dir == 'left') article.setStyle('left', -width);
			else article.setStyle('left', width);
			content.appendChild(article);
				
			if (article.getSize().y > old.article.getSize().y)
				content.setStyle('height', article.getSize().y);
	

			if (dir == 'left') old.article.tween('left', width);
			else old.article.tween('left', -width);
			fx = new Fx.Tween(article).start('left', 0).chain(function() {
				history.pushState(null, '', url);
				nav.replaces(old.nav);
				updateNav();
				//footer.replaces(old.footer);
				old.article.destroy();
				content.setStyle('height', article.getSize().y);
				article.removeClass('new-'+dir);
			});
		}
	}).send();
}

function goRight(url) {
	go(url, 'right');
}

function goLeft(url) {
	go(url, 'left');
}

function updateNav() {
	if (!history.pushState) return;
	var nav = $$('nav')[0];
	var links = nav.getElements('#nav-doc,#nav-overview');
	links.each(function(link) {
		link.onclick = function(e) {
			link.onclick = undefined;
			e.preventDefault();
			if (link.hasClass('left')) goLeft(link.href);
			else goRight(link.href);
		};
	});
}

document.addEvent('domready', function() {
	updateNav();
});

