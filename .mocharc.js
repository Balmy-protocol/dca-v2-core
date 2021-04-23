const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  require: ['hardhat/register'],
  extension: ['.ts'],
  ignore: ['./test/utils/**'],
  recursive: true,
  parallel: true,
  timeout: process.env.MOCHA_TIMEOUT || 300000,
};
