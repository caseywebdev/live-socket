var LiveClient = require('./live');
var events = require('events');
var util = require('util');
var ws = require('ws');

var extend = LiveClient.extend;
var erToObj = LiveClient.erToObj;
var objToEr = LiveClient.objToEr;

var uid = 0;

var Live = function (socket) {
  this.callbacks = {};
  this.socket = socket;
  socket.on('open', this.emit.bind(this, 'open', this));
  socket.on('message', this.handleMessage.bind(this));
  socket.on('close', this.emit.bind(this, 'close', this));
};

util.inherits(Live, events.EventEmitter);

extend(Live.prototype, {
  isReady: function () {
    return this.socket.readyState === ws.OPEN;
  },

  handleMessage: function (data) {
    try { data = JSON.parse(data); } catch (er) { return; }
    var id = data.i;
    var cb = this.callbacks[id];
    delete this.callbacks[id];
    if (cb) return cb(data.e && objToEr(data.e), data.d);
    if (!data.n) return;
    this.emit(data.n, this, data.d, this.handleCallback.bind(this, id));
  },

  handleCallback: function (id, er, data) {
    if (!this.isOpen()) return;
    var res = {i: id};
    if (er) res.e = erToObj(er);
    if (data) res.d = data;
    this.socket.send(JSON.stringify(res));
  },

  send: function (name, data, cb) {
    if (!name || !this.isOpen()) return;
    var req = {n: name, d: data};
    if (cb) {
      var id = ++uid;
      this.callbacks[id] = cb;
      req.i = id;
    }
    this.socket.send(JSON.stringify(req));
  },

  close: function () {
    this.socket.close();
  }
});

module.exports = Live;
