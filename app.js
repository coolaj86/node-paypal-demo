"use strict";

let config = require("./config.js");

if ("development" === process.env.NODE_ENV) {
  // set special options
  console.info("NODE_ENV=" + process.env.NODE_ENV);
}

let pkg = require("./package.json");

let app = require("@root/async-router").Router();
let Errors = require("./lib/errors.js");

let Keyfetch = require("keyfetch");
let request = require("@root/request");

let Cors = require("./lib/cors.js");
let cors = Cors({ domains: config.CORS_DOMAINS, methods: config.CORS_METHODS });

let Public = require("./lib/public.js")(pkg, config);

// Pretty JSON output
app.use("/", addReqJsonPretty);

// CORS
app.use("/", cors);
app.options("*", endRequest);

//app.use("/api", require("body-parser").json());

// Public / Debug endpoints
app.get("/public/hello", Public.getHello);
app.get("/public/versions", Public.getVersions);
app.get("/public/envs", Public.getPublicEnvs);

// OIDC / Auth Debug endpoints
app.use("/public/oidc", decodeClaims);
app.get("/public/oidc/inspect", async function (req, res) {
  res.json(req.jws);
});
app.get("/public/oidc/config", getConfig, async function (req, res) {
  res.json(req.oidcConfig);
});
app.get("/public/oidc/profile", getConfig, getProfile);

// Error / Debug endpoints
app.get("/public/errors/400", async function (req, res) {
  throw Errors.create("BAD_REQUEST");
});
app.get("/public/errors/500", async function (req, res) {
  throw Errors.create("some rando error");
});
app.get("/public/errors/404", async function (req, res, next) {
  next();
});

// Magic Sauce endpoints
app.use("/user", decodeClaims, verifyClaims);

// TODO error handler for /api
app.use("/", function (req, res) {
  throw Errors.custom({
    code: "NOT_FOUND",
    status: 404,
    message: `'${req.url}' not found`,
  });
});
app.use("/", handleErrorJson);

function endRequest(req, res, next) {
  res.end();
}

// default API error handler
async function handleErrorJson(err, req, res, next) {
  err.id = require("crypto").randomBytes(3).toString("hex");

  if (err.status >= 400 && err.status < 500) {
    res.statusCode = err.status || 500;
    res.json({ status: err.status, code: err.code, message: err.message });
    return;
  }

  console.error("Unexpected Error:");
  console.error(err);
  res.statusCode = err.status || 500;
  res.json({ message: `Internal Server Error: #${err.id}`, id: err.id });
}

async function getProfile(req, res) {
  if (!req.oidcConfig.userinfo_endpoint) {
    throw Errors.custom({
      message:
        "OpenID Configuration is mising userinfo_endpoint - try inspecting with /oidc/config",
      status: 422,
      code: "E_BAD_REMOTE",
    });
  }

  let resp = await request({
    url: req.oidcConfig.userinfo_endpoint,
    headers: { Authorization: "Bearer " + req.jwt },
    json: true,
  })
    .then(mustOk)
    .catch(function (err) {
      console.error(`Could not get '${req.oidcConfig.userinfo_endpoint}':`);
      console.error(err);
      throw Errors.custom({
        message:
          "could not fetch OpenID Configuration - try inspecting the token and checking 'iss'",
        status: 422,
        code: "E_BAD_REMOTE",
      });
    });

  res.json(resp.body);
}

async function decodeClaims(req, res, next) {
  let token = (req.headers["authorization"] || "").split(" ")[1];
  if (!token) {
    throw Errors.custom({
      message:
        "missing token header, example: 'Authorization: Bearer xxxx.yyyy.zzzz'",
      code: "E_MISSING_AUTHORIZATION",
      status: 401,
    });
  }

  req.jwt = token;
  req.jws = await Keyfetch.jwt.decode(token);
  req.claims = req.jws.claims;
  next();
}

function ensureTrailingSlash(iss) {
  if (!iss || "string" !== typeof iss) {
    throw Errors.create("'iss' should be an oidc issuer url string");
  }
  if (!iss.endsWith("/")) {
    iss += "/";
  }
  return iss;
}

async function verifyClaims(req, res, next) {
  if ("development" === config.NODE_ENV && config.INSECURE_SKIP_VERIFY) {
    console.warn("[SECURITY] Skipping token verification");
    next();
    return;
  }

  var oidcUrl = ensureTrailingSlash(req.claims.iss);
  if (config.OIDC_ISSUER !== oidcUrl) {
    throw Errors.custom({
      code: "E_UNKNOWN_ISSUER",
      message: "token is from an unknown or invalid OIDC issuer",
      status: 401,
    });
  }

  req.jws = await Keyfetch.jwt.verify(req.jwt);
  req.claims = req.jws.claims;
  next();
}

async function mustOk(resp) {
  if (resp.statusCode >= 200 && resp.statusCode < 300) {
    return resp;
  }
  throw Errors.create("BAD_GATEWAY");
}

async function getConfig(req, res, next) {
  if (!req.claims.iss) {
    let err = new Error(
      "token should have an 'iss' claim, which should be a URL at which /.well-known/openid-configuration can be found"
    );
    err.code = "E_NO_ISSUER";
    err.status = 422;
    return err;
  }

  let oidcUrl = ensureTrailingSlash(req.claims.iss);
  oidcUrl += ".well-known/openid-configuration";

  // See examples:
  // Google: https://accounts.google.com/.well-known/openid-configuration
  // Auth0: https://example.auth0.com/.well-known/openid-configuration
  // Okta: https://login.writesharper.com/.well-known/openid-configuration
  let resp = await request({ url: oidcUrl, json: true })
    .then(mustOk)
    .catch(function (err) {
      console.error(`Could not get '${oidcUrl}':`);
      console.error(err);
      throw Errors.custom({
        message:
          "could not fetch OpenID Configuration - try inspecting the token and checking 'iss'",
        status: 422,
        code: "E_BAD_REMOTE",
      });
    });

  req.oidcConfig = resp.body;
  next();
}

function addReqJsonPretty(req, res, next) {
  // use a debug / pretty print json
  res.json = function (data) {
    res.setHeader("Content-Type", "application/json");
    let json = JSON.stringify(data, null, 2);
    res.end(json + "\n");
  };
  next();
}

if (require.main === module) {
  require("dotenv").config();

  let http = require("http");
  let express = require("express");
  let server = express().use("/", app);

  let port = process.env.PORT || 3042;
  http.createServer(server).listen(port, function () {
    /* jshint validthis:true */
    console.info("Listening on", this.address());
  });
}

module.exports = app;
module.exports = app;
