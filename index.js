var uid = 0;

exports.ws = function (server, listeners) {
  var ws = require('ws');

  server.on('connection', function (socket) {
    socket.callbacks = [];

    socket._send = socket.send;
    socket.send = function (name, data, cb) {
      if (!name || socket.readyState !== ws.OPEN) return;
      var req = {n: name, d: data};
      if (cb) {
        var id = ++uid;
        socket.callbacks[id] = cb;
        req.i = id;
      }
      socket._send(JSON.stringify(req));
    };

    socket.on('message', function (raw) {
      try { raw = JSON.parse(raw); } catch (er) { return socket.close(); }
      var id = raw.i;
      var cb = socket.callbacks[id];
      delete socket.callbacks[id];
      var name = raw.n;
      var listener = listeners[name];
      if (listener) {
        return listener(socket, raw.d, function (er, data) {
          if (socket.readyState !== ws.OPEN) return;
          var res = {i: id};
          if (er) res.e = er.toString();
          if (data) res.d = data;
          socket._send(JSON.stringify(res));
        });
      }
      if (cb) cb(raw.e && new Error(raw.e), raw.d);
    });
  });
};
