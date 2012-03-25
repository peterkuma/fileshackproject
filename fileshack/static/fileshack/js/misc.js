function uuid() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function bytesToHuman(nBytes) {
    if (isNaN(nBytes)) return '0 B';
    var aMultiples = ['KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    var nMultiple = 0;
    var out = nBytes + ' B';
    for (nApprox = nBytes / 1024; nApprox > 1; nApprox /= 1024, nMultiple++) {
        if (nMultiple > 0) out = nApprox.toFixed(1) + ' ' + aMultiples[nMultiple];
        else out = nApprox.toFixed(0) + ' ' + aMultiples[nMultiple];
    }
    return out;
}

function basename(path) {
    path = path.substring(path.lastIndexOf('/') + 1);
    path = path.substring(path.lastIndexOf('\\') + 1);
    return path;
}
