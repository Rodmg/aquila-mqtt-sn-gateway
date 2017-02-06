"use strict";
function calcCrc(data) {
    let crc = 0;
    let size = data.length;
    let i;
    let index = 0;
    while (--size >= 0) {
        crc = (crc ^ data[index++] << 8) & 0xFFFF;
        i = 8;
        do {
            if (crc & 0x8000) {
                crc = (crc << 1 ^ 0x1021) & 0xFFFF;
            }
            else {
                crc = (crc << 1) & 0xFFFF;
            }
        } while (--i);
    }
    return crc & 0xFFFF;
}
exports.calcCrc = calcCrc;
;
function checkCrc(data) {
    let dataCrc, calcdCrc;
    dataCrc = (data[data.length - 1]) << 8;
    dataCrc |= (data[data.length - 2]) & 0x00FF;
    calcdCrc = calcCrc(data.slice(0, data.length - 2));
    return calcdCrc === dataCrc;
}
exports.checkCrc = checkCrc;
;

//# sourceMappingURL=CrcUtils.js.map
