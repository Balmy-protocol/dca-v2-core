import { subtask } from 'hardhat/config';
import { TASK_COMPILE_SOLIDITY_COMPILE_JOBS } from 'hardhat/builtin-tasks/task-names';
import fs from 'fs/promises';

subtask(TASK_COMPILE_SOLIDITY_COMPILE_JOBS, 'Clean mocks from types if needed').setAction(async (taskArgs, { run }, runSuper) => {
  const compileSolOutput = await runSuper(taskArgs);
  if (!!process.env.PUBLISHING_NPM) {
    console.log('🧹 Excluding mock types from typechain');
    const typechainIndexBuffer = await fs.readFile('./typechained/index.ts');
    const finalTypechainIndex = typechainIndexBuffer
      .toString('utf-8')
      .split(/\r?\n/)
      .filter((line) => !line.includes('Mock'))
      .join('\n');
    await fs.writeFile('./typechained/index.ts', finalTypechainIndex, 'utf-8');
  }
  return compileSolOutput;
});
