module.exports = {
  apps: [
    {
      name: "squid-processor",
      script: "./lib/main.js",
      // 开发/测试环境加载 .env.test
      env: {
        NODE_ENV: "development",
        NODE_OPTIONS: "-r dotenv/config dotenv_config_path=.env.test"
      },
      // 生产环境加载 .env.prod
      env_production: {
        NODE_ENV: "production",
        NODE_OPTIONS: "-r dotenv/config dotenv_config_path=.env.prod"
      }
    },
    {
      name: "squid-graphql",
      script: "./node_modules/.bin/squid-graphql-server",
      // 开发/测试环境加载 .env.test
      env: {
        NODE_ENV: "development",
        NODE_OPTIONS: "-r dotenv/config dotenv_config_path=.env.test"
      },
      // 生产环境加载 .env.prod
      env_production: {
        NODE_ENV: "production",
        NODE_OPTIONS: "-r dotenv/config dotenv_config_path=.env.prod"
      }
    }
  ]
};
