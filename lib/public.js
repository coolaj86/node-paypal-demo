"use strict";

module.exports = function (pkg, config) {
  let Public = {};

  Public.getHello = async function (req, res) {
    res.json({
      message: "Hello, World!",
    });
  };

  Public.getVersions = async function (req, res) {
    res.json({
      api: pkg.version,
      node: process.versions.node,
      icu: process.versions.icu,
      tz: process.versions.tz,
    });
  };

  Public.getPublicEnvs = async function (req, res) {
    res.json({
      NODE_ENV: process.env.NODE_ENV || "",
      PORT: process.env.PORT || 0,
      REACT_ROUTER: process.env.REACT_ROUTER || false,
      CORS_DOMAINS: config.CORS_DOMAINS,
      CORS_METHODS: config.CORS_METHODS,
      OIDC_ISSUER: config.OIDC_ISSUER,
    });
  };

  return Public;
};
