"use strict";

require("dotenv").config({ path: "../.env.secret" });

let config = require("../config.js");

let request = require("@root/request");

async function main() {
  config.PORT = 60000 + Math.floor(Math.random() * 5000);

  let baseUrl = `http://localhost:${config.PORT}`;
  // { "iss": "https://example.okta.com" }
  let exampleToken =
    "eyJhbGciOiJFUzI1NiIsImtpZCI6IklWUlR3bmcwRW5LZkt0M0tNTXFTYlJPN0otVUtNWXJhd0ZaS0QxZDZQeXciLCJ0eXAiOiJKV1QifQ.eyJleHAiOjE2MzE0MzE5NzcsImlzcyI6Imh0dHBzOi8vZXhhbXBsZS5va3RhLmNvbSJ9.J2G-qQ_xa_6YZQe7bzvIeLa-hAHlWfdMHpYFQkSO2EirQurFFXTMvdqowhiFEiDtaFoXxuocaNJOpegLVV86Hg";
  // { "iss": "https://evil.okta.com" }
  let evilToken =
    "eyJhbGciOiJFUzI1NiIsImtpZCI6IklWUlR3bmcwRW5LZkt0M0tNTXFTYlJPN0otVUtNWXJhd0ZaS0QxZDZQeXciLCJ0eXAiOiJKV1QifQ.eyJleHAiOjE2MzE0MzI2NTUsImlzcyI6Imh0dHBzOi8vZXZpbC5va3RhLmNvbSJ9.7spggiLm77cRcFKBvAYcLF_4FEyoZ-PDxRLNdy6OPBVLZlIbCg8iIqFoQ4h2BxbM3-V6-FaB-DmLNKgHuldCsg";

  let httpServer;

  httpServer = await new Promise(function (resolve, reject) {
    let app = require("../app.js");

    let express = require("express");

    let server = express();
    // all API is in app.js
    server.use("/api", app);

    httpServer = require("http").createServer(server);
    httpServer.on("error", reject);
    httpServer.listen(config.PORT, function () {
      resolve(httpServer);
    });
  });

  let tests = {
    "/doesntexist should return 404": async function (desc) {
      let resp = await request({
        url: `${baseUrl}/api/doesntexist`,
        json: true,
      });
      let body = resp.toJSON().body;
      if ("NOT_FOUND" !== body.code) {
        throw Error(desc);
      }
    },

    "/public/versions should have api version and tz version": async function (
      desc
    ) {
      let resp = await request({
        url: `${baseUrl}/api/public/versions`,
        json: true,
      });
      let body = resp.toJSON().body;
      if (!body.api || !body.tz) {
        throw Error(desc);
      }
    },

    "/public/oidc/config should retrieve object with 'userinfo'":
      async function (desc) {
        // { "iss": "https://example.okta.com" }
        let resp = await request({
          url: `${baseUrl}/api/public/oidc/config`,
          headers: { Authorization: `Bearer ${exampleToken}` },
          json: true,
        });
        let body = resp.toJSON().body;
        if (!body.userinfo_endpoint) {
          throw Error(desc);
        }
      },

    "/user/doesntexist should return UNAUTHORIZED when no token is present":
      async function (desc) {
        let resp = await request({
          url: `${baseUrl}/api/user/doesntexist`,
          json: true,
        });
        let body = resp.toJSON().body;
        if ("E_MISSING_AUTHORIZATION" !== body.code) {
          throw Error(desc);
        }
      },

    "/api/user/doesntexist should require the correct issuer": async function (
      desc
    ) {
      // { "iss": "https://evil.okta.com" }
      let resp = await request({
        url: `${baseUrl}/api/user/doesntexist`,
        headers: { Authorization: `Bearer ${evilToken}` },
        json: true,
      });
      let body = resp.toJSON().body;
      if ("E_UNKNOWN_ISSUER" !== body.code) {
        throw Error(desc);
      }
    },

    "/api/user/doesntexist should 404 when INSECURE_SKIP_VERIFY=true":
      async function (desc) {
        let env = config.NODE_ENV;
        let nosec = config.INSECURE_SKIP_VERIFY;
        config.NODE_ENV = "development";
        config.INSECURE_SKIP_VERIFY = true;
        // { "iss": "https://evil.okta.com" }
        let resp = await request({
          url: `${baseUrl}/api/user/doesntexist`,
          headers: { Authorization: `Bearer ${evilToken}` },
          json: true,
        });
        let body = resp.toJSON().body;
        config.NODE_ENV = env;
        config.INSECURE_SKIP_VERIFY = nosec;
        if ("NOT_FOUND" !== body.code) {
          throw Error(desc);
        }
      },
  };

  // poor man's forEachAsync (runs tests in sequence)
  console.info();
  await Object.keys(tests).reduce(async function (p, desc) {
    await p;
    await tests[desc](desc);
    console.info("PASS:", desc);
  }, Promise.resolve());

  httpServer.close();
  console.info();
  console.info("PASS");
}

if (require.main === module) {
  main().catch(function (err) {
    console.error("FAIL:", err.message);
    process.exit(1);
  });
} else {
  module.exports = main;
}
