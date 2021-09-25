export class SwapInterval {
  static readonly FIVE_MINUTES = new SwapInterval(5 * 60, '0x01');
  static readonly FIFTEEN_MINUTES = new SwapInterval(SwapInterval.FIVE_MINUTES.seconds * 3, '0x02');
  static readonly THIRTY_MINUTES = new SwapInterval(SwapInterval.FIFTEEN_MINUTES.seconds * 2, '0x4');
  static readonly ONE_HOUR = new SwapInterval(SwapInterval.THIRTY_MINUTES.seconds * 2, '0x08');
  static readonly TWELVE_HOURS = new SwapInterval(SwapInterval.ONE_HOUR.seconds * 12, '0x10');
  static readonly ONE_DAY = new SwapInterval(SwapInterval.TWELVE_HOURS.seconds * 2, '0x20');
  static readonly ONE_WEEK = new SwapInterval(SwapInterval.ONE_DAY.seconds * 7, '0x40');
  static readonly THIRTY_DAYS = new SwapInterval(SwapInterval.ONE_DAY.seconds * 30, '0x80');

  private static readonly INTERVALS = [
    SwapInterval.FIVE_MINUTES,
    SwapInterval.FIFTEEN_MINUTES,
    SwapInterval.THIRTY_MINUTES,
    SwapInterval.ONE_HOUR,
    SwapInterval.TWELVE_HOURS,
    SwapInterval.ONE_DAY,
    SwapInterval.ONE_WEEK,
    SwapInterval.THIRTY_DAYS,
  ];

  private constructor(readonly seconds: number, readonly mask: string) {}

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
