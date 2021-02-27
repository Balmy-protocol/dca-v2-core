getSelection/*
DEPOSIT
When making a deposit with an unknown token address, then tx is reverted with message
When making a deposit with a valid token address,
  - then correct amount is tranfered from sender
  - then position is created
  - then event is emited

WITHDRAW SWAPPED
When withdrawing swapped with invalid id, then tx is reverted with message
When withdrawing swapped with position that didn't have swaps executed, then nothing happens
When withdrawing swapped with valid id,
  - then swapped tokens are sent to the user
  - then position is updated
  - then event is emited

TERMINATE
When terminating a position with invalid id, then tx is reverted with message
When terminating a position with valid id,
  - then position is removed
  - then swapped balance is returned
  - then unswapped balance is returned
  - then event is emited
When terminating a position without swapped balance, then nothing is returned
When terminating a posotion without unswapped balance, then nothing is returned

MODIFY RATE AND SWAPS
When modifying both rate and swaps with an invalid id, then tx is reverted with message
When re-allocating deposited rate and swaps of a valid position,
  - then position is modified
  - then event is emited
  - then no tokens are returned or requested
When position modification requires more funds,
  - then position is modified
  - then event is emited
  - then extra tokens are requested
When position modification requires less funds, then they are returned
  - then position is modified
  - then event is emited
  - then extra tokens are returned

MODIFY SWAPS
...Igual que MODIFY RATE AND SWAPS

MODIFY RATE
When modifying the rate of a completed position, then tx is reverted with message
...Igual que MODIFY RATE AND SWAPS

EXTRA
Verify that _calculateSwapped works correctly in cases where there was an overflow


*/
