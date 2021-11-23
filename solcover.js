module.exports = {
  skipFiles: [
    'interfaces',

    // We don't care about coverage in these files, since these files are updatable and don't handle any funds
    'libraries/NFTDescriptor.sol',
    'libraries/NFTSVG.sol',
  ],
  providerOptions: {
    default_balance_ether: '10000000000000000000000000',
  },
  mocha: {
    fgrep: '[skip-on-coverage]',
    invert: true,
  },
};
