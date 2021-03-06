/**
 * This is alpha and probably NOT stable. Use at your own risk.
 *
 * It's also heavily inspired by/stolen from mocha-cloud (https://github.com/visionmedia/mocha-cloud) and
 * uses a similar API to connect safely to mocha-cloud-grid-view.
 *
 * Copyright 2013 Paul Bakaus, licensed under MIT
 * "mocha-cloud" is Copyright 2013 TJ Holowaychuk
 */

var wd = require('wd'),
  Emitter = require('events').EventEmitter,
  debug = require('debug')('mocha-sauce'),
  Batch = require('batch'),
  request = require('request');

function MochaSauce(conf) {
  this.name = conf.name;
  this.user = conf.username || process.env.SAUCE_USER_NAME || process.env.SAUCE_USERNAME;
  this.key = conf.accessKey || process.env.SAUCE_API_KEY || process.env.SAUCE_ACCESS_KEY;
  this.host = conf.host || process.env.SELENIUM_HOST || "ondemand.saucelabs.com";
  this.port = conf.port || process.env.SELENIUM_PORT || 80;
  this.public = conf.public || 'public';

  this.browsers = [];

  this._url = conf.url || '';
  this._concurrency = 2;
  this.tags = conf.tags || [];
  this.build = conf.build || '';
  this._video = false;
  this._screenshots = false;
}

MochaSauce.prototype.__proto__ = Emitter.prototype;

MochaSauce.prototype.build = function(build) {
  this.build = build;
  return this;
};

MochaSauce.prototype.tags = function(tags) {
  this.tags = tags;
  return this;
};

MochaSauce.prototype.url = function(url) {
  this._url = url;
  return this;
};

MochaSauce.prototype.concurrency = function(num) {
  this._concurrency = num;
  return this;
};

MochaSauce.prototype.record = function(video, screenshots) {
  if(screenshots === undefined) {
    screenshots = video;
  }

  this._video = video;
  this._screenshots = screenshots;

  return this;
};

MochaSauce.prototype.browser = function(conf) {
  debug('add %s %s %s', conf.browserName || conf.app, conf.version, conf.platform);
  conf.version = conf.version || '';
  this.browsers.push(conf);
};

MochaSauce.prototype.start = function(fn) {

  var self = this;
  var batch = new Batch();
  fn = fn || function() {};

  batch.concurrency(this._concurrency);

  this.browsers.forEach(function(conf) {
    conf.tags = self.tags;
    conf.name = self.name;
    conf.build = self.build;
    conf['record-video'] = self._video;
    conf['record-screenshots'] = self._screenshots;

    debug("Adding browser: " + conf.browserName);

    batch.push(function(done) {

      // initialize remote connection to Sauce Labs
      debug('running %s %s %s', conf.browserName || conf.app, conf.version, conf.platform);

      var browser = wd.remote(self.host, self.port, self.user, self.key);

      self.emit('init', conf);

      browser.init(conf, function() {

        debug('Getting url: %s', self._url);

        self.emit('start', conf);

        // load the test site
        browser.get(self._url, function(err) {
          if (err) {
            debug("Failed to get URL: " + self._url, err);
            done(err);
            return;
          }

          // wait until choco is ready
          function doItAgain() {

            browser.eval('window.chocoReady', function(err, res) {

              if (res !== true) {
                setTimeout(function() {
                  doItAgain();
                }, 1000);
                return;
              }

              if (err) {
                debug("Failed to eval window.chocoReady: ", err);
                done(err);
                return;
              }

              browser.eval('JSON.stringify(window.mochaResults)', function(err, res) {
                if (err) {
                  debug("Failed to JSON.stringify(window.mochaResults): ", err);
                  done(err);
                  return;
                }

                // convert stringified object back to parsed
                res = JSON.parse(res);

                // add browser conf to be able to identify in the end callback
                res.browser = conf;

                debug("Mocha results: suites: %i, tests: %i, passes: %i, pending: %i, failures: %i",
                  res.suites,
                  res.tests,
                  res.passes,
                  res.pending,
                  res.failures);

                // update Sauce Labs with custom test data
                var data = {
                  'passed': !res.failures,
                  'public': self.public
                };

                // Only set custom-data if it is small enough (otherwise will fail in SauceLabs)
                /*
                if (Buffer.byteLength(JSON.stringify(res.jsonReport), 'utf8') < 30000) {
                  data['custom-data'] = { mocha: res.jsonReport };
                }
                */

                var body = JSON.stringify(data);

                var uri = ["https://", self.user, ":", self.key, "@saucelabs.com/rest", "/v1/", self.user, "/jobs/", browser.sessionID].join('');
                debug('Updating Sauce Labs job: %s - %s', uri, body);

                request({
                  method: "PUT",
                  uri: uri,
                  headers: {'Content-Type': 'application/json'},
                  body: body
                }, function (err, response, body) {
                  if (err) {
                    debug("Failed to update Sauce Labs job: ", err);
                    done(err);
                    return;
                  }

                  debug("Updated Sauce Labs job");

                  self.emit('end', conf, res);

                  debug("Quitting browser: %s - %s", conf.browserName, conf.platform);

                  browser.quit(function(err) {
                    if (err) {
                      debug("Failed to quit browser", err);
                      done(err);
                      return;
                    }

                    debug("Browser quit succeeded - done with job");

                    done(null, res);
                  });
                });
              });
            });
          }

          doItAgain();
        });
      });
    });
  });

  debug("End of batch");
  batch.end(fn);
};

module.exports = MochaSauce;
module.exports.GridView = require('./grid');
