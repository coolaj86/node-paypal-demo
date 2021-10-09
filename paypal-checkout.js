"use strict";

require("dotenv").config({ path: ".env" });
require("dotenv").config({ path: ".env.secret" });

let request = require("@root/request");

let PayPal = {};
PayPal.init = function (id, secret) {
  PayPal.__sandboxUrl = "https://api-m.sandbox.paypal.com";
  PayPal.__baseUrl = PayPal.__sandboxUrl;
  PayPal.__id = id;
  PayPal.__secret = secret;
};
PayPal.request = async function _paypalRequest(reqObj) {
  let headers = {};
  if (reqObj.id) {
    // Optional and if passed, helps identify idempotent requests
    headers["PayPal-Request-Id"] = reqObj.id;
  }
  // ex: https://api-m.sandbox.paypal.com/v1/billing/subscriptions
  reqObj.url = `${PayPal.__baseUrl}${reqObj.url}`;
  reqObj.headers = Object.assign(headers, reqObj.headers || {});
  reqObj.auth = {
    user: PayPal.__id,
    pass: PayPal.__secret,
  };
  return await request(reqObj).then(sanitize);
};

function justBody(resp) {
  return resp.body;
}

function sanitize(resp) {
  resp = resp.toJSON();
  Object.keys(resp.headers).forEach(function (k) {
    if (k.toLowerCase().match(/Auth|Cookie|Token|Key/i)) {
      resp.headers[k] = "[redacted]";
    }
  });
  Object.keys(resp.request.headers).forEach(function (k) {
    if (k.toLowerCase().match(/Auth|Cookie|Token|Key/i)) {
      resp.request.headers[k] = "[redacted]";
    }
  });
  return resp;
}

function must201or200(resp) {
  if (![200, 201].includes(resp.statusCode)) {
    let err = new Error("bad response");
    err.response = resp;
    throw err;
  }
  return resp;
}

/*
function enumify(obj) {
  Object.keys(obj).forEach(function (k) {
    obj[k] = k;
  });
}
*/

let Product = {};

// SaaS would be type=SERVICE, category=SOFTWARE
Product.types = {
  DIGITAL: "DIGITAL",
  PHYSICAL: "PHYSICAL",
  SERVICE: "SERVICE",
};
Product.__typeNames = Object.keys(Product.types);

// Documented under "categories" at
// https://developer.paypal.com/docs/api/catalog-products/v1/
Product.categories = require("./categories.json");
Product.__categoryNames = Object.keys(Product.categories);
/*
Product.categories = {
  SOFTWARE: "SOFTWARE",
  PHYSICAL_GOOD: "PHYSICAL_GOOD",
  DIGITAL_MEDIA_BOOKS_MOVIES_MUSIC: "DIGITAL_MEDIA_BOOKS_MOVIES_MUSIC",
  DIGITAL_GAMES: "DIGITAL_GAMES",
};
*/

Product.create = async function _createSubscription({
  id,
  name,
  description,
  type,
  category,
  image_url,
  home_url,
}) {
  if (id) {
    if (!id.startsWith("PROD-")) {
      console.warn(`Warn: product ID should start with "PROD-"`);
    }
  }
  if (!Product.__typeNames.includes(type)) {
    console.warn(`Warn: unknown product type '${type}'`);
  }
  if (!Product.__categoryNames.includes(category)) {
    console.warn(`Warn: unknown product category '${category}'`);
  }

  return await PayPal.request({
    method: "POST",
    url: "/v1/catalogs/products",
    id: id,
    json: {
      // ex: "Video Streaming Service"
      name: name,
      // ex: "Video streaming service"
      description: description,
      // ex: "SERVICE", "PHYSICAL", "DIGITAL"
      type: type,
      // ex: "SOFTWARE", "PHYSICAL_GOOD"
      category: category,
      // ex: "https://example.com/streaming.jpg"
      image_url: image_url,
      // ex: "https://example.com/home"
      home_url: home_url,
    },
  })
    .then(must201or200)
    .then(justBody);
};

let Plan = {};
Plan.intervals = {
  DAY: "DAY",
  WEEK: "WEEK",
  MONTH: "MONTH",
  YEAR: "YEAR",
};
Plan.tenures = {
  TRIAL: "TRIAL",
  REGULAR: "REGULAR",
};

// See https://developer.paypal.com/docs/api/subscriptions/v1/
Plan.create = async function _createPlan({
  id,
  status = "ACTIVE",
  product_id,
  name,
  description = "",
  billing_cycles,
  payment_preferences,
  taxes, // optional
  quantity_supported = false,
}) {
  let headers = {};
  if (id) {
    if (!id.startsWith("PLAN-")) {
      // ex: PLAN-18062020-001
      console.warn(`Warn: plan ID should start with "PLAN-"`);
    }
  }
  headers["Prefer"] = "return=representation";
  return await PayPal.request({
    method: "POST",
    url: "/v1/billing/plans",
    id: id,
    headers: headers,
    json: {
      // ex: "PROD-6XB24663H4094933M"
      product_id: product_id,
      // ex: "Basic Plan"
      name: name,
      // ex: "Basic plan"
      description: description,
      // ex: "CREATED", "ACTIVE", "INACTIVE"
      status: status,
      // ex: TODO
      billing_cycles: billing_cycles.map(function (cycle, i) {
        // sequence is the index in the array,
        // which should never be out-of-order
        if (!cycle.frequency.interval_count) {
          cycle.frequency.interval_count = 1;
        }
        cycle.sequence = i + 1;
        if (!cycle.tenure_type) {
          cycle.tenure_type = Plan.tenures.REGULAR;
        }
        if (!cycle.total_cycles) {
          cycle.total_cycles = 0;
        }
        return cycle;
      }),
      // TODO ???
      payment_preferences: payment_preferences,
      taxes: taxes,
      quantity_supported: quantity_supported,
    },
  })
    .then(must201or200)
    .then(justBody);
};

let Subscription = {};
Subscription.actions = {
  CONTINUE: "CONTINUE",
  SUBSCRIBE_NOW: "SUBSCRIBE_NOW",
};
Subscription.shipping_preferences = {
  GET_FROM_FILE: "GET_FROM_FILE", // provided, or selectable from PayPal addresses
  SET_PROVIDED_ADDRESS: "SET_PROVIDED_ADDRESS", // user can't change it here
  NO_SHIPPING: "NO_SHIPPING", // duh
};
Subscription.payer_selections = {
  PAYPAL: "PAYPAL",
};
Subscription.payee_preferences = {
  UNRESTRICTED: "UNRESTRICTED",
  IMMEDIATE_PAYMENT_REQUIRED: "IMMEDIATE_PAYMENT_REQUIRED",
};

Subscription.createRequest = async function _createSubscription({
  id,
  plan_id,
  start_time,
  quantity,
  shipping_amount,
  subscriber,
  application_context,
}) {
  return await PayPal.request({
    method: "POST",
    url: "/v1/billing/subscriptions",
    id: id,
    json: {
      // ex: "P-5ML4271244454362WXNWU5NQ"
      plan_id: plan_id,
      // ex: "2018-11-01T00:00:00Z" (must be in the future)
      start_time: start_time,
      // ex: "20"
      quantity: quantity,
      // ex: { currency_code: "USD", value: "10.00", },
      shipping_amount: shipping_amount,
      /* ex:
				{
					name: { given_name: "John", surname: "Doe" },
					email_address: "customer@example.com",
					shipping_address: {
						name: { full_name: "John Doe" },
						address: {
							address_line_1: "123 Sesame Street",
							address_line_2: "Building 17",
							admin_area_2: "San Jose",
							admin_area_1: "CA",
							postal_code: "95131",
							country_code: "US",
						},
					}
				}
      */
      subscriber: subscriber,
      /* ex:
				{
					brand_name: "walmart",
					locale: "en-US",
					shipping_preference: "SET_PROVIDED_ADDRESS",
					user_action: "SUBSCRIBE_NOW",
					payment_method: {
						payer_selected: "PAYPAL",
						payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED",
					},
					return_url: "https://example.com/returnUrl",
					cancel_url: "https://example.com/cancelUrl",
				}
      */
      application_context: application_context,
    },
  })
    .then(must201or200)
    .then(justBody);
};

Subscription.get = async function _getSubscription(id) {
  return await PayPal.request({
    url: `/v1/billing/subscriptions/${id}`,
    json: true,
  })
    .then(must201or200)
    .then(justBody);
};

module.exports.init = PayPal.init;
module.exports.request = PayPal.request;
module.exports.Plan = Plan;
module.exports.Product = Product;
module.exports.Subscription = Subscription;

async function test() {
  /*
  let product = await Product.create({
    id: "PROD-test-product-10",
    name: "Test Product #10",
    description: "A great widget for gizmos and gadgets of all ages!",
    type: Product.types.SERVICE,
    category: Product.categories.SOFTWARE,
    image_url: undefined,
    home_url: undefined,
  });
  console.log('Product:');
  console.log(JSON.stringify(product, null, 2));

  let plan = await Plan.create({
    id: "PLAN-test-plan-001",
    product_id: "PROD-2TS60422HM5801517", // product.id,
    name: "Test Plan #1",
    description: "A great plan for pros of all ages!",
    billing_cycles: [
      {
        frequency: {
          interval_unit: Plan.intervals.DAY,
          interval_count: 1,
        },
        tenure_type: Plan.tenures.TRIAL,
        total_cycles: 14,
      },
      {
        frequency: {
          interval_unit: Plan.intervals.YEAR,
          interval_count: 1,
        },
        tenure_type: Plan.tenures.REGULAR,
        total_cycles: 0,
        pricing_scheme: {
          fixed_price: {
            value: "10.00",
            currency_code: "USD",
          },
        },
      },
    ],
    payment_preferences: {
      auto_bill_outstanding: true,
      setup_fee: {
        value: "10",
        currency_code: "USD",
      },
      setup_fee_failure_action: "CONTINUE",
      // suspend the subscription after N attempts
      payment_failure_threshold: 3,
    },
    taxes: {
      percentage: "10",
      // was tax included?
      inclusive: false,
    },
  });
  console.log("Plan:");
  console.log(JSON.stringify(plan, null, 2));

  // See https://developer.paypal.com/docs/subscriptions/integrate/#use-the-subscriptions-api
  let subscription = await Subscription.createRequest({
    plan_id: plan.id,
    //start_time: "2018-11-01T00:00:00Z", (must be in the future)
    //quantity: "20",
    //shipping_amount: { currency_code: "USD", value: "10.00" },
    subscriber: {
      name: { given_name: "James", surname: "Doe" },
      email_address: "customer@example.com",
      /*
      shipping_address: {
        name: { full_name: "James Doe" },
        address: {
          address_line_1: "123 Sesame Street",
          address_line_2: "Building 17",
          admin_area_2: "San Jose",
          admin_area_1: "CA",
          postal_code: "95131",
          country_code: "US",
        },
      },
      */
  //
  /*
    },
    application_context: {
      brand_name: "root",
      locale: "en-US",
      shipping_preference: Subscription.shipping_preferences.NO_SHIPPING,
      user_action: Subscription.actions.SUBSCRIBE_NOW,
      payment_method: {
        payer_selected: Subscription.payer_selections.PAYPAL,
        payee_preferred:
          Subscription.payee_preferences.IMMEDIATE_PAYMENT_REQUIRED,
      },
      return_url:
        "https://example.com/api/paypal-checkout/return?my_token=abc123",
      cancel_url:
        "https://example.com/api/paypal-checkout/cancel?my_token=abc123",
    },
  });
  console.log("Subscribe:");
  console.log(JSON.stringify(subscription, null, 2));
  */
  let s = await Subscription.get("I-HLGJGSEL3254");
  console.log("Subscription:");
  console.log(JSON.stringify(s, null, 2));
}

if (require.main === module) {
  PayPal.init(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);
  test().catch(function (err) {
    console.error("Bad happened:");
    console.error(JSON.stringify(err, null, 2));
  });
}
