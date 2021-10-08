"use strict";

var Errors = module.exports;

var errors = {
  UNKNOWN: {
    code: "INTERNAL_SERVER_ERROR",
    message: "the server had an oopsie - it's not your fault",
    status: 500,
  },
  UNAUTHORIZED: {
    code: "UNAUTHORIZED",
    message: "missing or invalid Authorization Bearer token",
    status: 401,
  },
  FORBIDDEN: {
    code: "FORBIDDEN",
    message: "you do not have permission to access this resource",
    status: 403,
  },
  NOT_FOUND: {
    code: "NOT_FOUND",
    message: "not found",
    status: 404,
  },
  BAD_REQUEST: {
    code: "BAD_REQUEST",
    message: "some information was missing or not formed correctly",
    status: 400,
  },
  BAD_GATEWAY: {
    message: "remote server gave a non-OK response",
    code: "BAD_GATEWAY",
    status: 502,
  },
};

Errors.create = function (code, details) {
  let e = errors[code];
  if (!e) {
    e = errors["UNKNOWN"];
    if (!details) {
      details = code;
    }
  }
  let err = new Error(e.message);
  err.code = e.code;
  err.status = e.status || 500;
  err.details = details;
  return err;
};

Errors.custom = function _CustomizeError({ message, code, status, details }) {
  let err = new Error(message);
  err.code = code;
  err.status = status;
  err.details = details;
  return err;
};
