"use strict";

require("dotenv").config({ path: "./.env.secret" });
require("dotenv").config({ path: "./.env" });

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

let PayPalCheckout = require("@paypal/checkout-server-sdk");

let PP = {};
/**
 * Returns PayPal HTTP client instance with environment which has access
 * credentials context. This can be used invoke PayPal API's provided the
 * credentials have the access to do so.
 */
PP.client = function () {
  return new PayPalCheckout.core.PayPalHttpClient(PP.environment());
};

/**
 * Setting up and Returns PayPal SDK environment with PayPal Access credentials.
 * For demo purpose, we are using SandboxEnvironment. In production this will be
 * LiveEnvironment.
 */
PP.environment = function environment() {
  let clientId = process.env.PAYPAL_CLIENT_ID || "<<CLIENT-ID>>";
  let clientSecret = process.env.PAYPAL_CLIENT_SECRET || "<<CLIENT-SECRET>>";

  if (process.env.NODE_ENV === "production") {
    return new PayPalCheckout.core.LiveEnvironment(clientId, clientSecret);
  }

  return new PayPalCheckout.core.SandboxEnvironment(clientId, clientSecret);
};

/**
 * Setting up the JSON request body for creating the Order. The Intent in the
 * request body should be set as "CAPTURE" for capture intent flow.
 *
 */
function buildRequestBody() {
  // taken from https://github.com/paypal/Checkout-NodeJS-SDK/blob/master/samples/CaptureIntentExamples/createOrder.js
  return {
    // what else? AUTHORIZE?
    intent: "CAPTURE",
    application_context: {
      return_url: "http://localhost:3080/return", // ?token=436225184N2605450&PayerID=YTENGYR8PAF9A
      cancel_url: "http://localhost:3080/cancel?payment_id=xyz", // will have ?token=xxxx appended
      brand_name: "The Root Group, LLC",
      locale: "en-US",
      landing_page: "BILLING",
      // shipping_preference can be:
      // GET_FROM_FILE (selectable from PayPal addresses)
      // SET_PROVIDED_ADDRESS (set fixed from merchant - meaning _you_)
      // NO_SHIPPING (duh)
      shipping_preference: "GET_FROM_FILE",
      // The label for the button (probably constrained)
      user_action: "CONTINUE",
    },
    purchase_units: [
      {
        reference_id: "XYZ_XL", // arbitrary for our records?
        description: "Sporting Goods", // shown to the user?
        custom_id: "CUST-HighFashions", // the order id?
        soft_descriptor: "HighFashions",
        amount: {
          currency_code: "USD",
          value: "220.00",
          breakdown: {
            item_total: {
              currency_code: "USD",
              value: "180.00",
            },
            shipping: {
              currency_code: "USD",
              value: "20.00",
            },
            handling: {
              currency_code: "USD",
              value: "10.00",
            },
            tax_total: {
              currency_code: "USD",
              value: "20.00",
            },
            shipping_discount: {
              currency_code: "USD",
              value: "10",
            },
          },
        },
        items: [
          {
            name: "T-Shirt",
            description: "Green XL",
            sku: "sku01898",
            unit_amount: {
              currency_code: "USD",
              value: "90.00",
            },
            tax: {
              currency_code: "USD",
              value: "10.00",
            },
            quantity: "1",
            // or DIGITAL_GOODS? other options?
            category: "PHYSICAL_GOODS",
          },
          {
            name: "Shoes",
            description: "Running, Size 10.5",
            sku: "sku02898",
            unit_amount: {
              currency_code: "USD",
              value: "45.00",
            },
            tax: {
              currency_code: "USD",
              value: "5.00",
            },
            quantity: "2",
            category: "PHYSICAL_GOODS",
          },
        ],
        shipping: {
          method: "xxxx United States Postal Service", // arbitrary
          name: {
            full_name: "John Doe",
          },
          // suggested default when GET_FROM_FILE
          // required when... the other thing
          address: {
            address_line_1: "123 Sesame St",
            address_line_2: "Floor 6",
            admin_area_2: "San Francisco",
            admin_area_1: "CA",
            postal_code: "94107",
            country_code: "US",
          },
        },
      },
    ],
  };
}

let orderId;
server.get("/", async function (req, res, next) {
  let orderReq = new PayPalCheckout.orders.OrdersCreateRequest();
  // return=minimal (links to full descriptions)
  // return=representation (complete JSON)
  // See <https://developer.paypal.com/docs/api/subscriptions/v1/>.
  orderReq.headers["prefer"] = "return=representation";
  orderReq.requestBody(buildRequestBody());
  let ppClient = new PayPalCheckout.core.PayPalHttpClient(PP.environment());
  await ppClient
    .execute(orderReq)
    .then(function (response) {
      console.log("Status Code: " + response.statusCode);
      console.log("Status: " + response.result.status);
      orderId = response.result.id;
      console.log("Order ID: " + response.result.id);
      console.log("Intent: " + response.result.intent);
      console.log("Links: ");
      res.setHeader("Content-Type", "text/html;charset=utf-8");
      res.write("<h3>User Creds</h3>");
      res.write(
        `<input type="email" value="${process.env.PAYPAL_SANDBOX_EMAIL}" disabled style="width:90%" /><br/>`
      );
      res.write(
        `<input type="text" value="${process.env.PAYPAL_SANDBOX_PASSWORD}" disabled style="width:90%" /><br/>`
      );
      res.write("<h3>Payment Button</h3>");
      response.result.links.forEach((item, index) => {
        let rel = item.rel;
        let href = item.href;
        let method = item.method;
        let message = `\t${rel}: <a href="${href}" target="_blank">${href}</a>\tCall Type: ${method}`;
        console.log(message);
        res.write(`<br>${message}`);
      });
      // TODO handle some errors
      console.log(`OrderID: ${response.result.id}`);
      console.log(
        `Gross Amount: ${response.result.purchase_units[0].amount.currency_code} ${response.result.purchase_units[0].amount.value}`
      );
      // To toggle print the whole body comment/uncomment the below line
      console.log(JSON.stringify(response.result, null, 4));
      res.end();
    })
    .catch(next);
});

server.get("/return", async function (req, res, next) {
  // Not sure what these are useful for...
  console.log(`token=${req.query.token}`);
  console.log(`PayerID=${req.query.PayerID}`);
  let captureReq = new PayPalCheckout.orders.OrdersCaptureRequest(orderId);
  captureReq.requestBody({
    note_to_payer: "Thanks.",
    final_capture: true,
  });
  let ppClient = new PayPalCheckout.core.PayPalHttpClient(PP.environment());
  await ppClient
    .execute(captureReq)
    .then(function (response) {
      console.log(JSON.stringify(response, null, 2));
      res.json(response);
    })
    .catch(function (err) {
      console.error("Did not capture:");
      console.error(err);
      res.end(err.message || "Unknown Error");
    });
});

//server.get("/", listEndpoints);
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
