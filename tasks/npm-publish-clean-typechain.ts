import { subtask } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY_COMPILE_JOBS } from 'hardhat/builtin-tasks/task-names';
import fs from 'fs/promises';

subtask(TASK_COMPILE_SOLIDITY_COMPILE_JOBS, 'Clean mocks from types if needed').setAction(async (taskArgs, { run }, runSuper) => {
  const compileSolOutput = await runSuper(taskArgs);
  if (!!process.env.PUBLISHING_NPM) {
    console.log('🫠 Removing all test references from typechain');
    // Cleaning typechained/index
    console.log(`  🧹 Excluding from main index`);
    let typechainIndexBuffer = await fs.readFile('./typechained/index.ts');
    let finalTypechainIndex = typechainIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('mocks'))
      .filter((line) => !line.includes('nodeModules'))
      .filter((line) => !line.includes('node_modules'))
      .join('\n');
    await fs.writeFile('./typechained/index.ts', finalTypechainIndex, 'utf-8');
    // Cleaning typechained/factories/index
    console.log(`  🧹 Excluding from factorie's main index`);
    typechainIndexBuffer = await fs.readFile('./typechained/factories/index.ts');
    finalTypechainIndex = typechainIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('mocks'))
      .filter((line) => !line.includes('nodeModules'))
      .filter((line) => !line.includes('node_modules'))
      .join('\n');
    await fs.writeFile('./typechained/factories/index.ts', finalTypechainIndex, 'utf-8');
    // Cleaning typechained/artifacts/contracts/index
    console.log(`  🧹 Excluding from artifact's contracts index`);
    typechainIndexBuffer = await fs.readFile('./typechained/artifacts/contracts/index.ts');
    finalTypechainIndex = typechainIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('mocks'))
      .join('\n');
    await fs.writeFile('./typechained/artifacts/contracts/index.ts', finalTypechainIndex, 'utf-8');
    // Cleaning typechained/factories/artifacts/contracts/index
    console.log(`  🧹 Excluding from factories artifact's contracts index`);
    typechainIndexBuffer = await fs.readFile('./typechained/factories/artifacts/contracts/index.ts');
    finalTypechainIndex = typechainIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('mock'))
      .filter((line) => !line.includes('nodeModules'))
      .filter((line) => !line.includes('node_modules'))
      .join('\n');
    await fs.writeFile('./typechained/factories/artifacts/contracts/index.ts', finalTypechainIndex, 'utf-8');
  }
  return compileSolOutput;
});
