require('dotenv').config();
module.exports = {
  apps: [
    {
      name: "squid-processor",
      script: "./lib/main.js",
      env: {
        ...process.env
      }
    },
    {
      name: "squid-graphql",
      script: "./node_modules/.bin/squid-graphql-server",
      env: {
        ...process.env
      }
    }
  ]
};
