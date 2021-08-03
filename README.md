# DCA V1

[![Lint](https://github.com/Mean-Finance/dca-v1/actions/workflows/lint.yml/badge.svg)](https://github.com/Mean-Finance/dca-v1/actions/workflows/lint.yml)
[![Tests (unit, integration, e2e)](https://github.com/Mean-Finance/dca-v1/actions/workflows/tests.yml/badge.svg)](https://github.com/Mean-Finance/dca-v1/actions/workflows/tests.yml)
[![npm version](https://img.shields.io/npm/v/@mean-finance/dca-v1/latest.svg)](https://www.npmjs.com/package/@mean-finance/dca-v1/v/latest)

This repository contains all the smart contracts pertaining to DCA V1 Protocol.

## ⚠️ Audit

These contracts have not been audited yet, use at your own risk.

## 💰 Bug bounty

This repository is subject to the DCA V1 bug bounty program, per the terms defined [here](./BUG_BOUNTY.md).

## 📖 Docs

Documentations live under [docs.mean.finance](https://docs.mean.finance)

## 🛠️ Keeper Job

For detailed instructions on how to execute our keep3r job go to [docs.mean.finance](https://docs.mean.finance/guides/keep3r-job)

## 📦 NPM/YARN Package

- NPM Installation

```bash
npm --save-dev --save-exact @mean-finance/dca-v1
```

- Yarn installation

```bash
yarn add --dev --exact @mean-finance/dca-v1
```

## 👨‍💻 Development environment

- Copy environment file

```bash
cp .env.example .env
```

- Fill environment file with your information

```bash
nano .env
```

## 🧪 Testing

### Unit

```bash
yarn test:unit
```

Will run all tests under [/test/unit](./test/unit)

### E2E

```bash
yarn test:e2e
```

Will run all tests under [/test/e2e](./test/e2e)

### Integration

You will need to set up the development environment first, please refer to the [development environment](#-development-environment) section.

```bash
yarn test:integration
```

Will run all tests under [/test/integration](./test/integration)

## 🚢 Deployment

You will need to set up the development environment first, please refer to the [development environment](#-development-environment) section.

```bash
yarn deploy --network [network]
```

The plugin `hardhat-deploy` is used to deploy contracts.

## Licensing

The primary license for DCA V1 is the Business Source License 1.1 (`BUSL-1.1`), see [`LICENSE`](./LICENSE).

### Exceptions

- All files in `contracts/interfaces/` are licensed under `GPL-2.0-or-later` (as indicated in their SPDX headers), see [`contracts/interfaces/LICENSE`](./contracts/interfaces/LICENSE)
- All files in `contracts/libraries/` are licensed under `GPL-2.0-or-later` (as indicated in their SPDX headers), see [`contracts/libraries/LICENSE`](./contracts/libraries/LICENSE)
- All files in `contracts/mocks` remain unlicensed.
