"use strict";

// Note: You MUST load any ENVs BEFORE this file is required. Example:
// require('dotenv').config({ path: ".env" })

var config = module.exports;

config.NODE_ENV = process.env.NODE_ENV;
config.PORT = process.env.PORT;

config.INSECURE_SKIP_VERIFY = process.env.INSECURE_SKIP_VERIFY;

config.OIDC_ISSUER = ensureTrailingSlash(process.env.OIDC_ISSUER);

// CORS
config.CORS_DOMAINS = (process.env.CORS_DOMAINS || "")
  .trim()
  .split(/[,\s]+/g)
  .filter(Boolean);
config.CORS_METHODS = process.env.CORS_METHODS.trim()
  .split(/[,\s]+/g)
  .filter(Boolean);

function ensureTrailingSlash(iss) {
  let Errors = require("./lib/errors.js");
  if (!iss || "string" !== typeof iss) {
    throw Errors.create("'iss' should be an oidc issuer url string");
  }
  if (!iss.endsWith("/")) {
    iss += "/";
  }
  return iss;
}
