(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['underscore', 'backbone', 'herit'], factory);
  } else if (typeof exports !== 'undefined') {
    module.exports =
      factory(require('underscore'), require('backbone'), require('herit'));
  } else {
    root.Live = factory(root._, root.Backbone, root.herit);
  }
})(this, function (_, Backbone, herit) {
  'use strict';

  return herit(_.extend({
    retryWait: 1000,

    retryMaxWait: 64000,

    retryAttempt: 0,

    fetchAuthKey: null,

    socketConstructor: window.WebSocket,

    url: 'ws://' + location.host,

    state: 'disconnected',

    constructor: function (options) {
      _.extend(this, options);
      this.callbacks = {};
      this.queue = [];
    },

    isDisconnected: function () { return this.state === 'disconnected'; },

    isConnecting: function () { return this.state === 'connecting'; },

    isAuthorizing: function () { return this.state === 'authorizing'; },

    isConnected: function () { return this.state === 'connected'; },

    connect: function () {
      if (!this.isDisconnected()) return this;
      var socket = this.socket = new this.socketConstructor(this.url);
      socket.onopen = _.bind(this.handleOpen, this);
      socket.onclose = _.bind(this.handleClose, this);
      socket.onmessage = _.bind(this.handleMessage, this);
      this.setState('connecting');
      return this;
    },

    authorize: function () {
      if (!this.isAuthorizing()) return this;
      this.fetchAuthKey(_.bind(function (er, authKey) {
        if (!this.isAuthorizing()) return;
        if (er) {
          console.error(er.toString());
          return this.retry(this.authorize);
        }
        this.send('auth', authKey, _.bind(function (er) {
          if (!this.isAuthorizing()) return;
          if (er) {
            console.error(er.toString());
            return this.retry(this.authorize);
          }
          this.setState('connected').flushQueue();
        }, this));
      }, this));
      return this;
    },

    send: function (name, data, cb) {
      if (!name) return this;
      if (this.isDisconnected()) this.connect();
      if (this.isConnected() || (this.isAuthorizing() && name === 'auth')) {
        var req = {n: name, d: data};
        if (cb) {
          var id = _.uniqueId();
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
      for (var args; args = clone.shift();) this.send.apply(this, args);
      return this;
    },

    retry: function (method) {
      if (!this.retryWait) return this;
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = _.delay(_.bind(method, this), Math.min(
        this.retryWait * Math.pow(2, this.retryAttempt++),
        this.retryMaxWait
      ));
      return this;
    },

    setState: function (state) {
      var prevState = this.state;
      if (state === prevState) return this;
      this.state = state;
      if (state === 'connected') this.retryAttempt = 0;
      this.trigger('live:state:' + state, prevState);
      this.trigger('live:state', state, prevState);
      return this;
    },

    handleOpen: function () {
      if (this.fetchAuthKey) return this.setState('authorizing').authorize();
      this.setState('connected').flushQueue();
    },

    handleClose: function () {
      this.setState('disconnected').retry(this.connect);
    },

    handleMessage: function (ev) {
      var raw = ev.data;
      try { raw = JSON.parse(raw); } catch (er) { return; }
      var id = raw.i;
      var cb = this.callbacks[id];
      delete this.callbacks[id];
      var name = raw.n;
      if (name) {
        var socket = this.socket;
        return this.trigger(name, raw.d, function (er, data) {
          if (socket.readyState !== 1) return;
          var res = {i: id};
          if (er) res.e = er.message || er;
          if (data) res.d = data;
          socket.send(JSON.stringify(res));
        });
      }
      if (cb) cb(raw.e && new Error(raw.e), raw.d);
    }
  }, Backbone.Events));
});
