// -*- mode: js2 -*-
//
// Copyright (c) 2010 Ivan Shvedunov. All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions
// are met:
//
// * Redistributions of source code must retain the above copyright
// notice, this list of conditions and the following disclaimer.
//
// * Redistributions in binary form must reproduce the above
// copyright notice, this list of conditions and the following
// disclaimer in the documentation and/or other materials
// provided with the distribution.
//
// THIS SOFTWARE IS PROVIDED BY THE AUTHOR 'AS IS' AND ANY EXPRESSED
// OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
// ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY
// DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
// GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
// INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY,
// WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
// NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
// SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

// TBD: add swankjs dir to path so require(...) in the config sees it

var path = require("path"), fs = require("fs");
var CONFIG_AUTO_SECTION_RX =
      /\/\/\s*@@@AUTOGENERATED.*?@@@\s*?\n((?:.|\n)*?)\/\/\s*@@@\/AUTOGENERATED.*?@@@/;
var CONFIG_AUTO_SECTION_START =
      "// @@@AUTOGENERATED SECTION, DON'T EDIT@@@\nsetSwankJSConfig(\n";
var CONFIG_AUTO_SECTION_END =
      "\n);\n// @@@/AUTOGENERATED SECTION@@@";
var CONFIG_INDENT = 2;

function ConfigBase () {
  this.profiles = Object.create(null);
};

ConfigBase.prototype.useProfile = function useProfile (name, cont) {
  if (this.profiles[name])
    this.set(this.profiles[name], cont);
  else
    cont();
};

ConfigBase.prototype.setProfile = function setProfile (name, options) {
  var profile = Object.create(null);
  if (options) {
    for (var k in options) {
      if (options.hasOwnProperty(k))
        profile[k] = options[k];
    }
  }
  this.profiles[name] = profile;
};

ConfigBase.prototype.profileNames = function profileNames () {
  return Object.keys(this.profiles).sort();
};

ConfigBase.prototype.get = function get (names, cont) {
  if (typeof names == "string") {
    names = names.split(/\w*,\w*/);
    if (names.length == 1) {
      this.doGet(names, function (values) {
        cont(values[names[0]]);
      });
      return;
    }
  }
  this.doGet(names, cont);
};

function Config (fileName) {
  ConfigBase.apply(this, arguments);
  this.fileName = fileName;
  if (/^~\//.test(this.fileName))
    this.fileName = path.join(process.env.HOME || "/", this.fileName.substring(2));
  this.config = null;
  this.configText = "";
  this.needToEvalRC = true;
}

Config.prototype = Object.create(ConfigBase.prototype);

Config.prototype.loadConfig = function loadConfig (cont) {
  var self = this;
  if (!this.config) {
    fs.readFile(
      self.fileName, "utf-8", function (err, data) {
        self.config = {};
        if (!err) {
          self.configText = "";
          if (/^{/.test(data)) {
            try {
              self.config = JSON.parse(data);
            } catch (e) {}
          } else {
            self.configText = data;
            if (self.needToEvalRC) {
              global.setSwankJSConfig = function setConfig (cfg) {
                console.log("setSwankJSConfig: %s", JSON.stringify(cfg));
                for (var k in cfg) {
                  if (cfg.hasOwnProperty(k))
                    self.config[k] = cfg[k];
                }
              };
              global.setProfile = self.setProfile.bind(self);
              try {
                require(self.fileName);
                self.needToEvalRC = false;
              } finally {
                delete global.setSwankJSConfig;
              }
            }
          }
        }
        cont(self.config);
      });
  } else
    cont(this.config);
};

Config.prototype.saveConfig = function saveConfig (cont) {
  if (!this.config)
    return;
  var self = this,
      configSection = CONFIG_AUTO_SECTION_START +
        JSON.stringify(this.config, null, CONFIG_INDENT) +
        CONFIG_AUTO_SECTION_END,
      configSectionFound = false,
      configText = this.configText.replace(CONFIG_AUTO_SECTION_RX, function (m) {
        configSectionFound = true;
        return configSection;
      });
  fs.writeFile(
    this.fileName,
    configSectionFound ? configText : configText + "\n" + configSection + "\n",
    "utf8", function (err) {
      if (err)
        console.warn("error writing config file %s: %s", self.fileName, err);
      cont();
    });
};

Config.prototype.doGet = function doGet (names, cont) {
  this.loadConfig(
    function (cfg) {
      var r = {};
      names.forEach(function (name) {
        r[name] = cfg.hasOwnProperty(name) ? cfg[name] : undefined;
      });
      cont(r);
    });
};

Config.prototype.set = function set (name, value, cont) {
  // alternative invocation: config.set(options, cont)
  var opts = Object.create(null);
  if (typeof name == "string")
    opts[name] = value;
  else {
    opts = name;
    cont = value;
  }
  var self = this;
  cont = cont || function () {};
  this.loadConfig(
    function (cfg) {
      for (var k in opts)
        cfg[k] = opts[k];
      self.saveConfig(cont);
    });
};

function FakeConfig (values) {
  ConfigBase.apply(this, arguments);
  this.config = values || {};
}

FakeConfig.prototype = Object.create(ConfigBase.prototype);

FakeConfig.prototype.getNow = function getNow (name) {
  return this.config.hasOwnProperty(name) ? this.config[name] : undefined;
};

FakeConfig.prototype.doGet = function doGet (names, cont) {
  var r = {};
  names.forEach(function (name) {
    r[name] = this.config.hasOwnProperty(name) ? this.config[name] : undefined;
  }, this);
  cont(r);
};

FakeConfig.prototype.set = function set (name, value, cont) {
  var opts = Object.create(null);
  if (typeof name == "string")
    opts[name] = value;
  else {
    opts = name;
    cont = value;
  }
  for (var k in opts)
    this.config[k] = opts[k];
  if (cont) cont();
};

exports.Config = Config;
exports.FakeConfig = FakeConfig;
