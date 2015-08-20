(function (global, factory) {
  if (typeof define === 'function' && define.amd) define(factory);
  else if (typeof exports !== 'undefined') module.exports = factory();
  else global.Live = factory();
})(this, function () {
  'use strict';

  var extend = function (a, b) {
    for (var key in b) a[key] = b;
    return a;
  };

  var Live = function (options) {
    extend(this, options);
    this.callbacks = {};
    this.listeners = {};
    this.queue = [];
    this.uid = 0;
    this.connect();
  };

  extend(Live, {
    erToObj: function (er) {
      if (typeof er !== 'object') return {message: er};
      var obj = {name: er.name, message: er.message};
      for (var key in er) obj[key] = er[key];
      return obj;
    },

    objToEr: function (obj) {
      if (typeof obj !== 'object') return new Error(obj);
      var er = new Error();
      for (var key in obj) er[key] = obj[key];
      return er;
    }
  });

  extend(Live.prototype, {
    retryWait: 1000,

    retryMaxWait: 8000,

    retryAttempt: 0,

    url:
      typeof location === 'undefined' ?
      null :
      location.protocol.replace('http', 'ws') + '//' + location.host,

    isClosed: function () {
      return !this.socket || this.socket.readyState === WebSocket.CLOSED;
    },

    isOpen: function () {
      return this.socket && this.socket.readyState === WebSocket.OPEN;
    },

    connect: function () {
      if (!this.isClosed()) return this;
      var socket = this.socket = new this.socketConstructor(this.url);
      socket.onopen = this.handleOpen.bind(this);
      socket.onclose = this.handleClose.bind(this);
      socket.onmessage = this.handleMessage.bind(this);
      return this;
    },

    on: function (name, cb) {
      var listeners = this.listeners[name];
      if (!listeners) listeners = this.listeners[name] = [];
      listeners.push(cb);
      return this;
    },

    off: function (name, cb) {
      if (!name) {
        this.listeners = {};
        return this;
      }
      var listeners = this.listeners[name];
      if (!listeners) return this;
      if (!cb) {
        var i;
        while ((i = listeners.indexOf(cb)) !== -1) listeners.splice(i, 1);
      }
      if (!listeners.length) delete this.listeners[name];
      return this;
    },

    trigger: function (name, data, cb) {
      var listeners = this.listeners[name];
      if (!listeners) return this;
      for (var i = 0, l = listeners.length; i < l; ++i) {
        listeners[i](data, cb);
      }
      return this;
    },

    send: function (name, data, cb) {
      if (!name) return this;
      if (this.isClosed()) this.connect();
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
      var clone = this.queue.slice();
      this.queue = [];
      var args;
      while (args = clone.shift()) this.send.apply(this, args);
      return this;
    },

    retry: function (method) {
      if (!this.retryWait) return this;
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = setTimeout(method.bind(this), Math.min(
        this.retryWait * Math.pow(2, this.retryAttempt++),
        this.retryMaxWait
      ));
      return this;
    },

    handleOpen: function () {
      this.trigger('open');
      this.flushQueue();
    },

    handleClose: function () {
      this.trigger('close');
      this.retry(this.connect);
    },

    handleMessage: function (ev) {
      var raw = ev.data;
      try { raw = JSON.parse(raw); } catch (er) { return; }

      var id = raw.i;
      var cb = this.callbacks[id];
      delete this.callbacks[id];
      if (cb) return cb(raw.e && Live.objToEr(raw.e), raw.d);

      var name = raw.n;
      if (!name) return;

      this.trigger(name, raw.d, (function (er, data) {
        if (!this.isOpen()) return;
        var res = {i: id};
        if (er) res.e = Live.erToObj(res.e);
        if (data) res.d = data;
        this.socket.send(JSON.stringify(res));
      }).bind(this));
    }
  });

  return Live;
});
