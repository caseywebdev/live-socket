(function (global, factory) {
  if (typeof define === 'function' && define.amd) define(factory);
  else if (typeof exports !== 'undefined') module.exports = factory();
  else global.Live = factory();
})(this, function () {
  'use strict';

  var OPEN = 1;
  var CLOSED = 3;
  var ERROR = new Error('The WebSocket connection has closed.');
  var BLACKLIST = {open: true, close: true};

  var extend = function (a, b) {
    for (var key in b) a[key] = b[key];
    return a;
  };

  var erToObj = function (er) {
    if (typeof er !== 'object') return {message: er};
    var obj = {name: er.name, message: er.message};
    for (var key in er) obj[key] = er[key];
    return obj;
  };

  var objToEr = function (obj) {
    if (typeof obj !== 'object') return new Error(obj);
    var er = new Error();
    for (var key in obj) er[key] = obj[key];
    return er;
  };

  var Live = function (options) {
    extend(this, options);
    this.listeners = {};
    this.callbacks = {};
    this.queue = [];
    this.uid = 0;
    if (this.socket) {
      this.shouldRetry = false;
      this.socket.on('message', this.handleMessage.bind(this));
      this.socket.on('close', this.trigger.bind(this, 'close', this));
    } else this.connect();
  };

  extend(Live.prototype, {
    shouldRetry: true,

    retryWait: 1000,

    retryMaxWait: 8000,

    retryAttempt: 0,

    url:
      typeof location === 'undefined' ?
      null :
      location.protocol.replace('http', 'ws') + '//' + location.host,

    isOpen: function () {
      return this.socket && this.socket.readyState === OPEN;
    },

    isClosed: function () {
      return !this.socket || this.socket.readyState === CLOSED;
    },

    connect: function () {
      if (!this.isClosed()) return this;
      var socket = this.socket = new (this.WebSocket || WebSocket)(this.url);
      socket.onopen = this.handleOpen.bind(this);
      socket.onclose = this.handleClose.bind(this);
      socket.onmessage = this.handleMessage.bind(this);
      return this;
    },

    close: function () {
      this.shouldRetry = false;
      this.socket.close();
    },

    send: function (name, data, cb) {
      if (!name) return this;
      if (this.isOpen()) {
        var req = {n: name, d: data};
        if (cb) {
          var id = ++this.uid;
          this.callbacks[id] = cb;
          req.i = id;
        }
        this.socket.send(JSON.stringify(req));
      } else {
        this.queue.push(arguments);
      }
      return this;
    },

    flushQueue: function () {
      var args;
      while (args = this.queue.shift()) this.send.apply(this, args);
      return this;
    },

    retry: function () {
      if (!this.retryWait) return this;
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = setTimeout(this.connect.bind(this), Math.min(
        this.retryWait * Math.pow(2, this.retryAttempt++),
        this.retryMaxWait
      ));
      return this;
    },

    handleOpen: function () {
      this.retryAttempt = 0;
      this.flushQueue();
      this.trigger('open');
    },

    handleClose: function () {
      for (var id in this.callbacks) this.callbacks[id](ERROR);
      this.callbacks = {};

      var args;
      while (args = this.queue.shift()) if (args[2]) args[2](ERROR);

      this.trigger('close');
      if (this.shouldRetry) this.retry();
    },

    handleMessage: function (data) {
      try { data = JSON.parse(data); } catch (er) {
        try { data = JSON.parse(data.data); } catch (er) { return; }
      }
      var id = data.i;
      var cb = this.callbacks[id];
      delete this.callbacks[id];
      if (cb) return cb(data.e && objToEr(data.e), data.d);
      if (data.n == null || BLACKLIST[data.n]) return;
      this.trigger(data.n, data.d, this.handleCallback.bind(this, id));
    },

    handleCallback: function (id, er, data) {
      if (!this.isOpen()) return;
      var res = {i: id};
      if (er) res.e = erToObj(er);
      if (data) res.d = data;
      this.socket.send(JSON.stringify(res));
    },

    on: function (name, cb) {
      var listeners = this.listeners[name];
      if (!listeners) listeners = this.listeners[name] = [];
      listeners.push(cb);
      return this;
    },

    off: function (name, cb) {
      if (!name) this.listeners = {};
      if (!cb) delete this.listeners[name];
      var listeners = this.listeners[name];
      if (!listeners) return this;
      listeners = this.listeners[name] = listeners.filter(function (_cb) {
        return _cb !== cb;
      });
      if (!listeners.length) delete this.listeners[name];
      return this;
    },

    trigger: function (name, data, cb) {
      var listeners = this.listeners[name];
      if (!listeners) return this;
      for (var i = 0, l = listeners.length; i < l; ++i) listeners[i](data, cb);
      return this;
    }
  });

  return Live;
});
