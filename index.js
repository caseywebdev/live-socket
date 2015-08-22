var Live = require('./live');

module.exports = function (socket, listener) {
  var uid = 0;
  socket.callbacks = {};

  var send = socket.send.bind(socket);
  socket.send = function (name, data, cb) {
    if (!name) return;
    var req = {n: name, d: data};
    if (cb) {
      var id = ++uid;
      socket.callbacks[id] = cb;
      req.i = id;
    }
    send(JSON.stringify(req));
  };

  socket.on('message', function (raw) {
    try { raw = JSON.parse(raw); } catch (er) { return; }

    var id = raw.i;
    var cb = socket.callbacks[id];
    delete socket.callbacks[id];
    if (cb) return cb(raw.e && Live.objToEr(raw.e), raw.d);

    listener(socket, raw.n, raw.d, function (er, data) {
      var res = {i: id};
      if (er) res.e = Live.erToObj(er);
      if (data) res.d = data;
      send(JSON.stringify(res));
    });
  });
};
