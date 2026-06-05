// Workaround: Wavedash service worker crashes when Sentry sends
// keepalive fetch with a ReadableStream body. Convert stream to
// ArrayBuffer so the SW can clone the request.
(function() {
  var f = window.fetch.bind(window)
  window.fetch = function(i, o) {
    if (o && o.keepalive && o.body instanceof ReadableStream) {
      return new Response(o.body).arrayBuffer().then(function(b) {
        return f(i, Object.assign({}, o, { body: b }))
      })
    }
    return f.apply(window, arguments)
  }
})()
