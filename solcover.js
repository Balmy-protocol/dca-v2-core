module.exports = {
  skipFiles: ['interfaces'],
  providerOptions: {
    default_balance_ether: '10000000000000000000000000',
  },
  mocha: {
    fgrep: '[skip-on-coverage]',
    invert: true,
  },
};
