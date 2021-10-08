"use strict";

module.exports = function cors(
  opts = { domains: [], methods: [] }
) {
  return async function _cors(req, res, next) {
    let hostParts = (req.headers.host || "").split(":");
    let host = hostParts[0] || "";
    let port = hostParts[1] || "";

    if (
      !opts.domains.some(function (domain) {
        if (domain === host) {
          return true;
        }

        // *.example.com => .example.com
        if ("*." === domain.slice(0, 2)) {
          // .example.com
          // evilexample.com WILL NOT match
          let root = domain.slice(1);
          if (host.endsWith(root)) {
            return true;
          }
        }
      })
    ) {
      next();
      return;
    }

    if (port && "localhost" !== host) {
      next();
      return;
    }

    // remember Origin may be a more top-level domain than you think
    // (it can be modified by window.document.domain in the browser)
    res.setHeader("Access-Control-Allow-Origin", req.headers.host);
    //res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE");
    res.setHeader("Access-Control-Allow-Methods", opts.methods.join(", "));
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Accept, Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization"
    );
    next();
  };
};
