# Messages format

Aquila Gateway for the most part implements the MQTT-SN spec v 1.2, the communication between the software and the bridge is done via serial port with a variation of the "Forwarder Encapsulation" format of page 19 of the spec. There is also a special pairing mode that doesn't comply with the spec but doesn't interfere with it.

## Forwarder Encapsulation

Let [MQTT-SN FE] be the format specified in the MQTT-SN spec v1.2:

[Length][MsgType][Ctrl][Wireless Node Id (16 bit)][MQTT-SN Message (n bytes)]

The format used in Aquila Gateway is as follows:

**Note:** All the data is embedded in a [SLIP packet](https://en.wikipedia.org/wiki/Serial_Line_Internet_Protocol), this means that it has an SLIP start and stop byte (END), and could have SLIP escape sequences if the start and stop bytes are found in the data.

### Forwarder packet:

[SLIP END][LQI][RSSI][MQTT-SN FE][16 bit CRC][SLIP END]

## Bridge Control messages

The Aquila Gateway Forwarder also implements extra control messages for controlling the bridge:

- NACK and ACK: For flow control
- Enter and exit pair mode
- CONFIG: For setting encryption key **(NOT YET IMPLEMENTED)**

### NACK

[SLIP END][0][0] [Length (2)][0x00] [16 bit CRC][SLIP END]

### ACK

[SLIP END][0][0] [Length (2)][0x01] [16 bit CRC][SLIP END]

### EXIT PAIR

[SLIP END][0][0] [Length (3)][0x03][0x00] [16 bit CRC][SLIP END]

### ENTER PAIR

[SLIP END][0][0] [Length (3)][0x03][0x01] [16 bit CRC][SLIP END]

### PAIR REQ

Sent by the device when searching trying to pair. This has the same structure as the MQTT-SN Forwarder, but uses a non-standard command.

[SLIP END][0][0] [Length (3)][0x03][0x02][addrL (0x00)][addrH (0x00)] [Length (3)][Pair cmd (0x03, non standard MQTT-SN)][randomId] [16 bit CRC][SLIP END]

### PAIR RES

Sent by the Forwarder as a response to PAIR REQ. This has the same structure as the MQTT-SN Forwarder, but uses a non-standard command.

[SLIP END][0][0] [Length (3)][0x03][0x02][addrL (0x00)][addrH (0x00)] [Length (4)][Pair cmd (0x03, non standard MQTT-SN)][randomId][newAddr] [16 bit CRC][SLIP END]

## Pair Mode

This is not a part of MQTT-SN, it's a custom implementation for allowing easy device pairing.

Devices in pair mode are always configured with the address 0x0000, and transmit unencrypted messages.

For pairing devices, the Gateway needs to enter a special mode, this mode ignores any packet not coming or going to the device address 0. this also sets the Bridge in pair mode (if it had encryption, it gets disabled and treats messages differently).

In normal mode, messages from address 0 are ignored.

When the Gateway is in pair mode and receives a PAIR REQ message, it assigns an unassigned address to the device and sends it via a PAIR RES message. Then, it puts itself back into normal mode.

For avoiding collisions, each device sends a random Id with the PAIR REQ, and expects to receive the same id in the response.

## Revisiting Pair Mode [WIP]

Add support for configuring subnet and encryption key.

For this we need to append a byte for subnet and 16 bytes for encryption key in the PAIR RES.

Also we need to implement CONFIG to the bridge with subnet and encryption key. This should be saved in the EEPROM of the bridge in firmware. Consideer adding a periodic ping message to the bridge so we can know when its first ready to receive this config message.