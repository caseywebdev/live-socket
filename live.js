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

  var Live = herit(_.extend({
    retryWait: 5000,

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
        var id = _.uniqueId();
        this.callbacks[id] = cb;
        this.socket.send(JSON.stringify({id: id, name: name, data: data}));
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
      this.retryTimeoutId = _.delay(_.bind(method, this), this.retryWait);
      return this;
    },

    setState: function (state) {
      var prevState = this.state;
      if (state === prevState) return this;
      this.state = state;
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
      if (cb) cb(raw.error && new Error(JSON.stringify(raw.error)), raw.data);
    }
  }, Backbone.Events));

  return Live;
});
