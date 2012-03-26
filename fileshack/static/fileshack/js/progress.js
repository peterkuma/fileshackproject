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
    var w = pb.getSize().x;
    pb.setStyle('background-position', (pb.value/100*w-1000) + 'px center');
}
