// Web Worker for handling precise audio timing
self.onmessage = function(e) {
    if (e.data.delay) {
        setTimeout(function() {
            self.postMessage({args: e.data.args});
        }, e.data.delay);
    }
}; 