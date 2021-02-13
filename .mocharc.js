const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  require: ['hardhat/register'],
  recursive: true,
  timeout: process.env.MOCHA_TIMEOUT || 300000,
};
