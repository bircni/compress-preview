const path = require("path");
const Mocha = require("mocha");

async function run() {
  const mocha = new Mocha({
    ui: "bdd",
    color: true,
    timeout: 20_000,
  });

  mocha.addFile(path.resolve(__dirname, "extension.e2e.js"));
  mocha.addFile(path.resolve(__dirname, "webview.e2e.js"));

  await new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} end-to-end test(s) failed.`));
        return;
      }
      resolve();
    });
  });
}

module.exports = {
  run,
};
