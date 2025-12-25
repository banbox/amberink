module.exports = {
  apps: [
    {
      name: "squid-processor",
      script: "./lib/main.js"
    },
    {
      name: "squid-graphql",
      script: "./node_modules/.bin/squid-graphql-server"
    }
  ]
};
