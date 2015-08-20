var Live = require('./live');

exports.ws = function (server, listeners) {
  var ws = require('ws');

  server.on('connection', function (socket) {
    var uid = 0;
    socket.callbacks = {};

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
      if (cb) return cb(raw.e && Live.objToEr(raw.e), raw.d);

      var listener = listeners[raw.n];
      if (!listener) return;

      listener(socket, raw.d, function (er, data) {
        if (socket.readyState !== ws.OPEN) return;
        var res = {i: id};
        if (er) res.e = Live.erToObj(er);
        if (data) res.d = data;
        socket._send(JSON.stringify(res));
      });
    });
  });
};
