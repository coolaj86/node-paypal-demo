"use strict";

let Errors = require("./errors.js");

module.exports = async function mustOk(resp) {
  if (resp.statusCode >= 200 && resp.statusCode < 300) {
    return resp;
  }
  throw Errors.create("BAD_GATEWAY");
};
