import { TransactionResponse, TransactionReceipt } from '@ethersproject/abstract-provider';
import { expect } from 'chai';
import { Receipt } from 'hardhat-deploy/types';

export async function expectNoEventWithName(response: TransactionResponse, eventName: string) {
  const receipt = await response.wait();
  for (const event of getEvents(receipt)) {
    expect(event.event).not.to.equal(eventName);
  }
}

export async function readArgFromEvent<T>(response: TransactionResponse, eventName: string, paramName: string): Promise<T | undefined> {
  const receipt = await response.wait();
  for (const event of getEvents(receipt)) {
    if (event.event === eventName) {
      return event.args[paramName];
    }
  }
}

export async function readArgFromReceipt<T>(receipt: Receipt, eventName: string, paramName: string): Promise<T | undefined> {
  for (const event of getEvents(receipt)) {
    if (event.event === eventName) {
      return event.args[paramName];
    }
  }
}

export async function readArgFromEventOrFail<T>(response: TransactionResponse, eventName: string, paramName: string): Promise<T> {
  const result = await readArgFromEvent<T>(response, eventName, paramName);
  if (result) {
    return result;
  }
  throw new Error(`Failed to find event with name ${eventName}`);
}

export async function getEventArgs<T>(response: TransactionResponse, eventName: string): Promise<T> {
  const receipt = await response.wait();
  for (const event of getEvents(receipt)) {
    if (event.event === eventName) {
      return event.args;
    }
  }
  throw new Error(`Failed to find event with name ${eventName}`);
}

function getEvents(receipt: TransactionReceipt | Receipt): Event[] {
  // @ts-ignore
  return receipt.events;
}

type Event = {
  event: string; // Event name
  args: any;
};
