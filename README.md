# Hardhat Boilerplate

## Why ?

Thought to have a fast way of bootstraping projects with best practice's in mind. Having linters, prettiers, standards on how to commit, and changelog creation & maintenance.

---

## How ?

This is achieved using several hardhat plugins, and external known packages.

---

## Tools

This boilerplate includes:

- [Hardhat](https://hardhat.org/)
- [Solhint](https://github.com/protofire/solhint)
- [Prettier](https://github.com/prettier-solidity/prettier-plugin-solidity)
- [Coverage](https://github.com/sc-forks/solidity-coverage)
- [Gas reporter](https://github.com/cgewecke/hardhat-gas-reporter/tree/master)
- [Commitizen conventional changelog](https://github.com/commitizen/cz-conventional-changelog)
- [Standard version](https://github.com/conventional-changelog/standard-version)

---

## Commands

### Commit

```bash
npm run commit
```

It will commit with commitizen, allowing standard version to parse & set release's version accordingly.<br/>

### Coverage

```bash
npm run coverage
```

Runs solidity code coverage
<br/>

### Fork

```bash
npm run fork
```

Runs a mainnet fork via hardhat's node forking util.

```bash
npm run fork:script {path}
```

Runs the script in mainnet's fork.

```
npm run fork:test
```

Runs tests that should be run in mainnet's fork.
<br/>

### Lint

```bash
npm run lint
```

Runs solhint.
<br/>

### Prettier (lint fix)

```bash
npm run lint:fix
```

Runs prettier
<br/>

### Release

```bash
npm run release
```

Runs standard changelog, changes package.json version and modifies CHANGELOG.md accordingly.
<br/>

### Test

```
npm run test
```

Runs all solidity tests.
<br/>

### Gas report

```
npm run test:gas
```

Runs all tests and report gas usage.
