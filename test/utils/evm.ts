import { getNodeUrl } from '@utils/network';
import { network } from 'hardhat';

export let networkBeingForked: string;

const advanceTimeAndBlock = async (time: number): Promise<void> => {
  await advanceTime(time);
  await advanceBlock();
};

const advanceToTimeAndBlock = async (time: number): Promise<void> => {
  await advanceToTime(time);
  await advanceBlock();
};

const advanceTime = async (time: number): Promise<void> => {
  await network.provider.request({
    method: 'evm_increaseTime',
    params: [time],
  });
};

const advanceToTime = async (time: number): Promise<void> => {
  await network.provider.request({
    method: 'evm_setNextBlockTimestamp',
    params: [time],
  });
};

const advanceBlock = async () => {
  await network.provider.request({
    method: 'evm_mine',
    params: [],
  });
};

type ForkConfig = { network: string; skipHardhatDeployFork?: boolean } & Record<string, any>;
const reset = async (forkingConfig: ForkConfig) => {
  if (!forkingConfig.skipHardhatDeployFork) {
    process.env.HARDHAT_DEPLOY_FORK = forkingConfig.network;
  }
  networkBeingForked = forkingConfig.network;
  const params = [
    {
      forking: {
        ...forkingConfig,
        jsonRpcUrl: getNodeUrl(forkingConfig.network),
      },
    },
  ];
  await network.provider.request({
    method: 'hardhat_reset',
    params,
  });
};
class SnapshotManager {
  snapshots: { [id: string]: string } = {};

  async take(): Promise<string> {
    const id = await this.takeSnapshot();
    this.snapshots[id] = id;
    return id;
  }

  async revert(id: string): Promise<void> {
    await this.revertSnapshot(this.snapshots[id]);
    this.snapshots[id] = await this.takeSnapshot();
  }

  private async takeSnapshot(): Promise<string> {
    return (await network.provider.request({
      method: 'evm_snapshot',
      params: [],
    })) as string;
  }

  private async revertSnapshot(id: string) {
    await network.provider.request({
      method: 'evm_revert',
      params: [id],
    });
  }
}

export const snapshot = new SnapshotManager();

export default {
  advanceTimeAndBlock,
  advanceToTimeAndBlock,
  advanceTime,
  advanceToTime,
  advanceBlock,
  reset,
};
