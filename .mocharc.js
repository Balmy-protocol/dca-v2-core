const dotenv = require('dotenv');
dotenv.config();

module.exports = {
  require: ['hardhat/register'],
  extension: ['.ts'],
  ignore: ['./test/utils/**'],
  recursive: true,
};
