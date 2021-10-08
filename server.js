"use strict";

require("dotenv").config({ path: "../.env.secret" });
require("dotenv").config({ path: ".env" });

let config = require("./config.js");

let path = require("path");
let http = require("http");

let app = require("./app.js");

let express = require("express");

let server = express();
// all API is in app.js
if ("development" === config.NODE_ENV) {
  server.use("/", require("morgan")("tiny"));
}
server.get("/api", listEndpoints);
server.use("/api", app);

// static server for dev assets
server.use("/", express.static(path.join(__dirname, "build")));
// Route all else to index.html for React's sake
if (process.env.REACT_ROUTER) {
  server.get("*", serveReactAppIndexHtml(__dirname + "/build/index.html"));
}
server.get("/", listEndpoints);
server.use("/", handleErrorHtml);

// default non-API error handler
function handleErrorHtml(err, req, res, next) {
  err.id = require("crypto").randomBytes(3).toString("hex");

  console.error("Unexpected Error:");
  console.error(err);
  res.statusCode = err.status || 500;
  res.end(`Internal Server Error: #${err.id}\n`);
}

function serveReactAppIndexHtml(indexPath) {
  try {
    require("fs").readFileSync(indexPath);
  } catch (e) {
    console.error(`React index '${indexPath}' does not exist`);
    process.exit(1);
  }
  return function (req, res, next) {
    res.sendFile(indexPath);
  };
}

async function listEndpoints(req, res) {
  res.end(
    `GET /
GET /public/hello
GET /public/envs
GET /public/versions
GET /public/oidc/config
GET /public/oidc/inspect
GET /public/oidc/profile
GET /public/errors/400
GET /public/errors/404
GET /public/errors/500

# requires authorized user
GET /user/*
`
  );
}

let requiredEnvs = ["NODE_ENV", "CORS_DOMAINS", "CORS_METHODS", "OIDC_ISSUER"];
let hasConfig = requiredEnvs.every(function (key) {
  if (process.env[key]) {
    return true;
  }
  console.warn(`Warning: Missing ENV: '${key}'`);
  return false;
});
if (!hasConfig) {
  console.error(
    [
      "ERROR: Failed to read ENVs",
      "Please read the README and set the appropriate ENVs in either:",
      "\t.env (for local dev)",
      "\tenvironment variables (for production deployment, docker, AWS, GitHub, etc)",
      "",
    ].join("\n")
  );
  process.exit(1);
}

let httpServer = http.createServer(server);
if (require.main === module) {
  httpServer.listen(config.PORT || 3042, function () {
    console.info("Listening on", httpServer.address());
  });
} else {
  module.exports = httpServer;
}
