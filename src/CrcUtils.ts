
// CRC algorithm based on Xmodem AVR code
export function calcCrc(data: Buffer): number {
  let crc = 0;
  let size = data.length;
  let i;
  let index = 0;

  while(--size >= 0)
  {
    crc = (crc ^ data[index++] << 8) & 0xFFFF;
    i = 8;
    do
    {
      if(crc & 0x8000)
      {
        crc = (crc << 1 ^ 0x1021) & 0xFFFF;
      }
      else
      {
        crc = (crc << 1) & 0xFFFF;
      }
    } while(--i);
  }

  return crc & 0xFFFF;
};

export function checkCrc(data: Buffer): boolean {
  let dataCrc: number, calcdCrc: number;
  // Getting crc from packet
  dataCrc = (data[data.length - 1]) << 8;
  dataCrc |= (data[data.length - 2]) & 0x00FF;
  // Calculating crc
  calcdCrc = calcCrc(data.slice(0, data.length - 2));
  // Comparing
  return calcdCrc === dataCrc;
};
