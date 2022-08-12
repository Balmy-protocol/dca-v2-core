# DCA V2

[![Lint](https://github.com/Mean-Finance/dca-v2-core/actions/workflows/lint.yml/badge.svg)](https://github.com/Mean-Finance/dca-v2-core/actions/workflows/lint.yml)
[![Tests (unit, integration, e2e)](https://github.com/Mean-Finance/dca-v2-core/actions/workflows/tests.yml/badge.svg)](https://github.com/Mean-Finance/dca-v2-core/actions/workflows/tests.yml)
[![npm version](https://img.shields.io/npm/v/@mean-finance/dca-v2-core/latest.svg)](https://www.npmjs.com/package/@mean-finance/dca-v2-core/v/latest)

This repository contains the core smart contracts for the DCA V2 Protocol.

## ⚠️ Audit

These contracts have been audited. Read all performed audits in [here](./audits).

## 💰 Bug bounty

This repository is subject to the DCA V2 bug bounty program, per the terms defined [here](./BUG_BOUNTY.md).

## 📖 Docs

Check our docs at [docs.mean.finance](https://docs.mean.finance)

## 📦 NPM/YARN Package

- NPM Installation

```bash
npm install @mean-finance/dca-v2-core
```

- Yarn installation

```bash
yarn add @mean-finance/dca-v2-core
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

Will run all tests under [test/unit](./test/unit)

### E2E

```bash
yarn test:e2e
```

Will run all tests under [test/e2e](./test/e2e)

### Integration

You will need to set up the development environment first, please refer to the [development environment](#-development-environment) section.

```bash
yarn test:integration
```

Will run all tests under [test/integration](./test/integration)

## 🚢 Deployment

You will need to set up the development environment first, please refer to the [development environment](#-development-environment) section.

```bash
yarn deploy --network [network]
```

The plugin `hardhat-deploy` is used to deploy contracts.

## Licensing

The primary license for DCA V2 is the Business Source License 1.1 (`BUSL-1.1`), see [`LICENSE`](./LICENSE).

### Exceptions

- All files in `contracts/interfaces/` are licensed under `GPL-2.0-or-later` (as indicated in their SPDX headers), see [`contracts/interfaces/LICENSE`](./contracts/interfaces/LICENSE)
- All files in `contracts/libraries/` are licensed under `GPL-2.0-or-later` (as indicated in their SPDX headers), see [`contracts/libraries/LICENSE`](./contracts/libraries/LICENSE)
- All files in `contracts/mocks` remain unlicensed.
