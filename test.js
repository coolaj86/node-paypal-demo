"use strict";

async function main() {
  console.info("======== [Test] tests/basics.js ========");
  await require("./tests/basics.js")().catch(function (err) {
    console.error("FAIL: tests/basics.js", err.message);
    process.exit(1);
  });

  console.info("");
  console.info("ALL PASS");
}

main();
