const path = require("path");
const Mocha = require("mocha");

async function run() {
  const mocha = new Mocha({
    ui: "bdd",
    color: true,
    timeout: 20_000,
  });

  mocha.addFile(path.resolve(__dirname, "extension.e2e.js"));
  mocha.addFile(path.resolve(__dirname, "webview.integration.js"));

  await new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} extension-host or integration test(s) failed.`));
        return;
      }
      resolve();
    });
  });
}

module.exports = {
  run,
};
