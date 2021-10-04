export class SwapInterval {
  static readonly ONE_MINUTE = new SwapInterval(60, '0x01');
  static readonly FIVE_MINUTES = new SwapInterval(SwapInterval.ONE_MINUTE.seconds * 5, '0x02');
  static readonly FIFTEEN_MINUTES = new SwapInterval(SwapInterval.FIVE_MINUTES.seconds * 3, '0x04');
  static readonly THIRTY_MINUTES = new SwapInterval(SwapInterval.FIFTEEN_MINUTES.seconds * 2, '0x08');
  static readonly ONE_HOUR = new SwapInterval(SwapInterval.THIRTY_MINUTES.seconds * 2, '0x10');
  static readonly FOUR_HOURS = new SwapInterval(SwapInterval.ONE_HOUR.seconds * 4, '0x20');
  static readonly ONE_DAY = new SwapInterval(SwapInterval.FOUR_HOURS.seconds * 6, '0x40');
  static readonly ONE_WEEK = new SwapInterval(SwapInterval.ONE_DAY.seconds * 7, '0x80');

  static readonly INTERVALS = [
    SwapInterval.ONE_MINUTE,
    SwapInterval.FIVE_MINUTES,
    SwapInterval.FIFTEEN_MINUTES,
    SwapInterval.THIRTY_MINUTES,
    SwapInterval.ONE_HOUR,
    SwapInterval.FOUR_HOURS,
    SwapInterval.ONE_DAY,
    SwapInterval.ONE_WEEK,
  ];

  private constructor(readonly seconds: number, readonly mask: string) {}

  public isInByteSet(byte: string): boolean {
    return (parseInt(byte) & parseInt(this.mask)) != 0;
  }

  static intervalsToByte(...intervals: SwapInterval[]): string {
    const finalMask = intervals.map((intervals) => parseInt(intervals.mask)).reduce((a, b) => a | b, 0);
    return '0x' + finalMask.toString(16).padStart(2, '0');
  }

  static intervalsfromByte(byte: string): SwapInterval[] {
    let num = parseInt(byte);
    let index = 0;
    const result = [];
    while (index <= 8 && 1 << index <= num) {
      if ((num & (1 << index)) != 0) {
        result.push(SwapInterval.INTERVALS[index]);
      }
      index++;
    }
    return result;
  }
}

// TODO: Add tests for this file
