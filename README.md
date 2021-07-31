# DCA V1

[![Lint](https://github.com/Mean-Finance/dca-v1/actions/workflows/lint.yml/badge.svg)](https://github.com/Mean-Finance/dca-v1/actions/workflows/lint.yml)
[![Tests (unit, integration, e2e)](https://github.com/Mean-Finance/dca-v1/actions/workflows/tests.yml/badge.svg)](https://github.com/Mean-Finance/dca-v1/actions/workflows/tests.yml)
[![npm version](https://img.shields.io/npm/v/@mean-finance/dca-v1/latest.svg)](https://www.npmjs.com/package/@mean-finance/dca-v1/v/latest)

This repository contains all the smart contracts pertaining to DCA V1 Protocol.

## ⚠️ Audit

These contracts have not been audited yet, use at your own risk.

## 💰 Bug bounty

This repository is subject to the DCA V1 bug bounty program, per the terms defined [here](./bug-bounty.md).

# 📖 Docs

Documentations live under [docs.mean.finance](https://docs.mean.finance)

# 👨‍💻 Deployment

- Copy environment file

```bash
cp .env.example .env
```

- Fill with your network data

```bash
yarn deploy --network [network]
```

## Licensing

The primary license for DCA V1 is the Business Source License 1.1 (`BUSL-1.1`), see [`LICENSE`](./LICENSE).

### Exceptions

- All files in `contracts/interfaces/` are licensed under `GPL-2.0-or-later` (as indicated in their SPDX headers), see [`contracts/interfaces/LICENSE`](./contracts/interfaces/LICENSE)
- All files in `contracts/libraries/` are licensed under `GPL-2.0-or-later` (as indicated in their SPDX headers), see [`contracts/libraries/LICENSE`](./contracts/libraries/LICENSE)
- All files in `contracts/mocks` remain unlicensed.
