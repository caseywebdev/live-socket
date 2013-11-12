(function () {
  'use strict';

  var _ = window._;
  var Backbone = window.Backbone;
  var herit = window.herit;

  var Live = window.Live = herit(_.extend({
    reconnectWait: 1000,

    fetchAuthKey: null,

    socketConstructor: WebSocket,

    url: 'ws://' + location.host,

    constructor: function (options) {
      _.extend(this, options);
      this.callbacks = [];
      this.queue = [];
      this.state = Live.DISCONNECTED;
    },

    isDisconnected: function () { return this.state === Live.DISCONNECTED; },

    isConnecting: function () { return this.state === Live.CONNECTING; },

    isAuthorizing: function () { return this.state === Live.AUTHORIZING; },

    isConnected: function () { return this.state === Live.CONNECTED; },

    connect: function () {
      if (!this.isDisconnected()) return;
      this.state = Live.CONNECTING;
      return this.authRequired ? this.authorize() : this.createSocket();
    },

    createSocket: function () {
      var socket = this.socket = new this.socketConstructor(this.url);
      socket.onopen = _.bind(this.onopen, this);
      socket.onclose = _.bind(this.onclose, this);
      socket.onmessage = _.bind(this.onmessage, this);
      return this;
    },

    authorize: function () {
      this.state = Live.AUTHORIZING;
      this.fetchAuthKey(_.bind(function (er, authKey) {
        if (er) {
          this.onclose();
          throw er;
        }
        this.createSocket().send('authorize', authKey, _.bind(function (er) {
          if (er) throw er;
          this.state = Live.CONNECTED;
          this.flushQueue();
        }, this));
      }, this));
      return this;
    },

    send: function (name, data, cb) {
      if (!name) return this;
      if (this.isDisconnected()) this.connect();
      if (this.isConnected() ||
          (this.isAuthorizing() && name === 'authorize')) {
        var id = _.uniqueId();
        this.callbacks[id] = cb;
        this.socket.send(JSON.parse({id: id, name: name, data: data}));
      } else {
        this.queue.push(arguments);
      }
      return this;
    },

    flushQueue: function () {
      var clone = this.queue.slice();
      this.queue = [];
      for (var args; args = clone.shift();) this.send.apply(this, args);
    },

    onopen: function () {
      this.state = this.fetchAuthKey ? Live.AUTHORIZING : Live.CONNECTED;
      this.flushQueue();
    },

    onclose: function () {
      this.state = Live.DISCONNECTED;
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout =
        _.delay(_.bind(this.connect, this), this.reconnectWait);
    },

    onmessage: function (ev) {
      var raw = ev.data;
      try { raw = JSON.parse(raw); } catch (er) { return; }
      var id = raw.id;
      if (!id) return;
      var cb = this.callbacks[id];
      delete this.callbacks[id];
      var name = raw.name;
      if (name) {
        var socket = this.socket;
        return this.trigger(name, raw.data, function (er, data) {
          if (socket.readyState !== 1) return;
          var res = {id: id};
          if (er) res.error = er.message || er;
          if (data) res.data = data;
          socket.send(JSON.stringify(res));
        });
      }
      if (cb) cb(raw.error && new Error(raw.error), raw.data);
    }
  }, Backbone.Events), {
    DISCONNECTED: 0,

    CONNECTING: 1,

    AUTHORIZING: 2,

    CONNECTED: 3
  });
})();
