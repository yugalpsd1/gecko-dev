/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

const WIDGET_PANEL_LOG_PREFIX = 'WidgetPanel';

XPCOMUtils.defineLazyGetter(this, 'DebuggerClient', function() {
  return Cu.import('resource://gre/modules/devtools/dbg-client.jsm', {}).DebuggerClient;
});

XPCOMUtils.defineLazyGetter(this, 'WebConsoleUtils', function() {
  let {devtools} = Cu.import("resource://gre/modules/devtools/Loader.jsm", {});
  return devtools.require("devtools/toolkit/webconsole/utils").Utils;
});

XPCOMUtils.defineLazyGetter(this, 'EventLoopLagFront', function() {
  const {devtools} = Cu.import("resource://gre/modules/devtools/Loader.jsm", {});
  return devtools.require("devtools/server/actors/eventlooplag").EventLoopLagFront;
});


/**
 * The Widget Panel is an on-device developer tool that displays widgets,
 * showing visual debug information about apps. Each widget corresponds to a
 * metric as tracked by a metric watcher (e.g. consoleWatcher).
 */
let devtoolsWidgetPanel = {

  _apps: new Map(),
  _urls: new Map(),
  _client: null,
  _webappsActor: null,
  _watchers: [],

  /**
   * This method registers a metric watcher that will watch one or more metrics
   * of apps that are being tracked. A watcher must implement the trackApp(app)
   * and untrackApp(app) methods, add entries to the app.metrics map, keep them
   * up-to-date, and call app.display() when values were changed.
   */
  registerWatcher: function dwp_registerWatcher(watcher) {
    this._watchers.unshift(watcher);
  },

  init: function dwp_init() {
    if (this._client)
      return;

    if (!DebuggerServer.initialized) {
      RemoteDebugger.start();
    }

    this._client = new DebuggerClient(DebuggerServer.connectPipe());
    this._client.connect((type, traits) => {

      // FIXME(Bug 962577) see below.
      this._client.listTabs((res) => {
        this._webappsActor = res.webappsActor;

        for (let w of this._watchers) {
          if (w.init) {
            w.init(this._client);
          }
        }

        Services.obs.addObserver(this, 'remote-browser-frame-pending', false);
        Services.obs.addObserver(this, 'in-process-browser-or-app-frame-shown', false);
        Services.obs.addObserver(this, 'message-manager-disconnect', false);

        let systemapp = document.querySelector('#systemapp');
        let manifestURL = systemapp.getAttribute("mozapp");
        this.trackApp(manifestURL);

        let frames =
          systemapp.contentWindow.document.querySelectorAll('iframe[mozapp]');
        for (let frame of frames) {
          let manifestURL = frame.getAttribute("mozapp");
          this.trackApp(manifestURL);
        }
      });
    });
  },

  uninit: function dwp_uninit() {
    if (!this._client)
      return;

    for (let manifest of this._apps.keys()) {
      this.untrackApp(manifest);
    }

    Services.obs.removeObserver(this, 'remote-browser-frame-pending');
    Services.obs.removeObserver(this, 'in-process-browser-or-app-frame-shown');
    Services.obs.removeObserver(this, 'message-manager-disconnect');

    this._client.close();
    delete this._client;
  },

  /**
   * This method will ask all registered watchers to track and update metrics
   * on an app.
   */
  trackApp: function dwp_trackApp(manifestURL) {
    if (this._apps.has(manifestURL))
      return;

    // FIXME(Bug 962577) Factor getAppActor and watchApps out of webappsActor.
    this._client.request({
      to: this._webappsActor,
      type: 'getAppActor',
      manifestURL: manifestURL
    }, (res) => {
      if (res.error) {
        return;
      }

      let app = new App(manifestURL, res.actor);
      this._apps.set(manifestURL, app);

      for (let w of this._watchers) {
        w.trackApp(app);
      }
    });
  },

  untrackApp: function dwp_untrackApp(manifestURL) {
    let app = this._apps.get(manifestURL);
    if (app) {
      for (let w of this._watchers) {
        w.untrackApp(app);
      }

      // Delete the metrics and call display() to clean up the front-end.
      delete app.metrics;
      app.display();

      this._apps.delete(manifestURL);
    }
  },

  observe: function dwp_observe(subject, topic, data) {
    if (!this._client)
      return;

    let manifestURL;

    switch(topic) {

      // listen for frame creation in OOP (device) as well as in parent process (b2g desktop)
      case 'remote-browser-frame-pending':
      case 'in-process-browser-or-app-frame-shown':
        let frameLoader = subject;
        // get a ref to the app <iframe>
        frameLoader.QueryInterface(Ci.nsIFrameLoader);
        manifestURL = frameLoader.ownerElement.appManifestURL;
        if (!manifestURL) // Ignore all frames but apps
          return;
        this.trackApp(manifestURL);
        this._urls.set(frameLoader.messageManager, manifestURL);
        break;

      // Every time an iframe is destroyed, its message manager also is
      case 'message-manager-disconnect':
        let mm = subject;
        manifestURL = this._urls.get(mm);
        if (!manifestURL)
          return;
        this.untrackApp(manifestURL);
        this._urls.delete(mm);
        break;
    }
  },

  log: function dwp_log(message) {
    dump(WIDGET_PANEL_LOG_PREFIX + ': ' + message + '\n');
  }

};


/**
 * An App object represents all there is to know about a Firefox OS app that is
 * being tracked, e.g. its manifest information, current values of watched
 * metrics, and how to update these values on the front-end.
 */
function App(manifest, actor) {
  this.manifest = manifest;
  this.actor = actor;
  this.metrics = new Map();
}

App.prototype = {

  display: function app_display() {
    let data = {manifestURL: this.manifest, metrics: []};
    let metrics = this.metrics;

    if (metrics && metrics.size > 0) {
      for (let name of metrics.keys()) {
        data.metrics.push({name: name, value: metrics.get(name)});
      }
    }

    shell.sendCustomEvent('widget-panel-update', data);
    // FIXME(after bug 963239 lands) return event.isDefaultPrevented();
    return false;
  }

};


/**
 * The Console Watcher tracks the following metrics in apps: reflows, warnings,
 * and errors.
 */
let consoleWatcher = {

  _apps: new Map(),
  _watching: {
    reflows: false,
    warnings: false,
    errors: false
  },
  _client: null,

  init: function cw_init(client) {
    this._client = client;
    this.consoleListener = this.consoleListener.bind(this);

    let watching = this._watching;

    for (let key in watching) {
      let metric = key;
      SettingsListener.observe('devtools.hud.' + metric, false, value => {
        // Watch or unwatch the metric.
        if (watching[metric] = value) {
          return;
        }

        // If unwatched, remove any existing widgets for that metric.
        for (let app of this._apps.values()) {
          app.metrics.set(metric, 0);
          app.display();
        }
      });
    }

    client.addListener('logMessage', this.consoleListener);
    client.addListener('pageError', this.consoleListener);
    client.addListener('consoleAPICall', this.consoleListener);
    client.addListener('reflowActivity', this.consoleListener);
  },

  trackApp: function cw_trackApp(app) {
    app.metrics.set('reflows', 0);
    app.metrics.set('warnings', 0);
    app.metrics.set('errors', 0);

    this._client.request({
      to: app.actor.consoleActor,
      type: 'startListeners',
      listeners: ['LogMessage', 'PageError', 'ConsoleAPI', 'ReflowActivity']
    }, (res) => {
      this._apps.set(app.actor.consoleActor, app);
    });
  },

  untrackApp: function cw_untrackApp(app) {
    this._client.request({
      to: app.actor.consoleActor,
      type: 'stopListeners',
      listeners: ['LogMessage', 'PageError', 'ConsoleAPI', 'ReflowActivity']
    }, (res) => { });

    this._apps.delete(app.actor.consoleActor);
  },

  bump: function cw_bump(app, metric) {
    if (!this._watching[metric]) {
      return false;
    }

    let metrics = app.metrics;
    metrics.set(metric, metrics.get(metric) + 1);
    return true;
  },

  consoleListener: function cw_consoleListener(type, packet) {
    let app = this._apps.get(packet.from);
    let output = '';

    switch (packet.type) {

      case 'pageError':
        let pageError = packet.pageError;

        if (pageError.warning || pageError.strict) {
          if (!this.bump(app, 'warnings')) {
            return;
          }
          output = 'warning (';
        } else {
          if (!this.bump(app, 'errors')) {
            return;
          }
          output += 'error (';
        }

        let {errorMessage, sourceName, category, lineNumber, columnNumber} = pageError;
        output += category + '): "' + (errorMessage.initial || errorMessage) +
          '" in ' + sourceName + ':' + lineNumber + ':' + columnNumber;
        break;

      case 'consoleAPICall':
        switch (packet.message.level) {

          case 'error':
            if (!this.bump(app, 'errors')) {
              return;
            }
            output = 'error (console)';
            break;

          case 'warn':
            if (!this.bump(app, 'warnings')) {
              return;
            }
            output = 'warning (console)';
            break;

          default:
            return;
        }
        break;

      case 'reflowActivity':
        if (!this.bump(app, 'reflows')) {
          return;
        }

        let {start, end, sourceURL} = packet;
        let duration = Math.round((end - start) * 100) / 100;
        output = 'reflow: ' + duration + 'ms';
        if (sourceURL) {
          output += ' ' + this.formatSourceURL(packet);
        }
        break;
    }

    if (!app.display()) {
      // If the information was not displayed, log it.
      devtoolsWidgetPanel.log(output);
    }
  },

  formatSourceURL: function cw_formatSourceURL(packet) {
    // Abbreviate source URL
    let source = WebConsoleUtils.abbreviateSourceURL(packet.sourceURL);

    // Add function name and line number
    let {functionName, sourceLine} = packet;
    source = 'in ' + (functionName || '<anonymousFunction>') +
      ', ' + source + ':' + sourceLine;

    return source;
  }
};

devtoolsWidgetPanel.registerWatcher(consoleWatcher);


let jankWatcher = {
  _client: null,
  _fronts: new Map(),
  _active: false,

  init: function(client) {
    this._client = client;

    SettingsListener.observe('devtools.hud.jank', false,
      this.settingsListener.bind(this));
  },

  settingsListener: function(value) {
    if (this._active == value) {
      return;
    }
    this._active = value;

    // Toggle the state of existing fronts.
    let fronts = this._fronts;
    for (let app of fronts.keys()) {
      if (value) {
        fronts.get(app).start();
      } else {
        fronts.get(app).stop();
        app.metrics.set('jank', 0);
        app.display();
      }
    }
  },

  trackApp: function(app) {
    app.metrics.set('jank', 0);

    let front = new EventLoopLagFront(this._client, app.actor);
    this._fronts.set(app, front);

    front.on('event-loop-lag', time => {
      app.metrics.set('jank', time);

      if (!app.display()) {
        devtoolsWidgetPanel.log('jank: ' + time + 'ms');
      }
    });

    if (this._active) {
      front.start();
    }
  },

  untrackApp: function(app) {
    let fronts = this._fronts;
    if (fronts.has(app)) {
      fronts.get(app).destroy();
      fronts.delete(app);
    }
  }
};

devtoolsWidgetPanel.registerWatcher(jankWatcher);
