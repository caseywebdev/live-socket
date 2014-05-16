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
    reconnectWait: 5000,

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
      return this.isDisconnected() ? this.createSocket() : this;
    },

    createSocket: function () {
      var socket = this.socket = new this.socketConstructor(this.url);
      socket.onopen = _.bind(this.onopen, this);
      socket.onclose = _.bind(this.onclose, this);
      socket.onmessage = _.bind(this.onmessage, this);
      this.setState('connecting');
      return this;
    },

    authorize: function () {
      this.setState('authorizing');
      this.fetchAuthKey(_.bind(function (er, authKey) {
        if (er) {
          this.onclose();
          throw er;
        }
        this.send('authorize', authKey, _.bind(function (er) {
          if (er) {
            this.onclose();
            throw er;
          }
          this.setState('connected');
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
    },

    onopen: function () {
      if (this.fetchAuthKey) return this.authorize();
      this.setState('connected');
      this.flushQueue();
    },

    onclose: function () {
      this.setState('disconnected');
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
    },

    setState: function (state) {
      var prevState = this.state;
      if (state === prevState) return;
      this.state = state;
      this.trigger('live:state:' + state, prevState);
      this.trigger('live:state', state, prevState);
    }
  }, Backbone.Events));

  return Live;
});
