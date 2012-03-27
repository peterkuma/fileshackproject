document.addEvent('domready', function() {
    var pbars = $$('progress');
    pbars.each(emulateProgress);
});

function emulateProgress(pb) {
    if (typeof HTMLProgressElement != 'undefined') return;
    pb.addClass('progress-emulation');
    updateProgress(pb);
}

function updateProgress(pb) {
    if (typeof HTMLProgressElement != 'undefined') return;
    // Sadly, this does not work in IE:
    // var w = pb.getSize().x;
    var w = 400; // Ugly hack.
    if (pb.value) {
	pb.removeClass('progress-emulation-indeterminate');
	var fx = pb.retrieve('fx');
	if (fx) {
	    fx.cancel();
	    pb.store('fx', null);
	}
	pb.setStyle('background-position', (pb.value/100*w-1000) + 'px center');
    } else {
	pb.addClass('progress-emulation-indeterminate');
	var fx = pb.retrieve('fx');
	if (!fx) {
	    fx = new Fx.Tween(pb, {
		duration: 'long',
		transition: 'linear',
		property: 'background-position',
		link: 'chain'
	    });
	    pb.store('fx', fx);
	    var atStart = true;
	    fx.addEvent('complete', function() {
		if (atStart) fx.start(-1000+w-100);
		else fx.start(-1000);
		atStart = !atStart;
	    });
	    fx.start(-1000, -1000+w-100);
	}
    }
}
