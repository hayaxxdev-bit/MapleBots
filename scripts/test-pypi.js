const https = require("node:https");

const url = "https://pypi.org/pypi/gallery-dl/json";

console.log("Testing PyPI:", url);

https
  .get(url, (res) => {
    console.log("HTTP:", res.statusCode);
    console.log("Content-Type:", res.headers["content-type"]);

    let data = "";

    res.on("data", (chunk) => {
      data += chunk;
    });

    res.on("end", () => {
      console.log("Received:", data.length, "bytes");

      if (res.statusCode === 200) {
        const pkg = JSON.parse(data);

        console.log("Package:", pkg.info.name);
        console.log("Version:", pkg.info.version);
        console.log("✅ PyPI accessible");
      } else {
        console.log("❌ PyPI returned HTTP", res.statusCode);
      }
    });
  })
  .on("error", (error) => {
    console.log("❌ Network error:", error.message);
  });
