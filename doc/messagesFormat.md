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

### CONFIG

Sent by the Gateway to the bridge on initial connection for configuring PAN an Encryption.
If sent by Bridge, it's a request for the bridge to send its settings.

- Sent From the Bridge:

[SLIP END][0][0] [Length (2)][0x02] [16 bit CRC][SLIP END]

- Sent From the Gateway:

[SLIP END][0][0] [Length (19)][0x02] [PAN][KEY1]...[KEY16] [16 bit CRC][SLIP END]

### EXIT PAIR

[SLIP END][0][0] [Length (3)][0x03][0x00] [16 bit CRC][SLIP END]

### ENTER PAIR

[SLIP END][0][0] [Length (3)][0x03][0x01] [16 bit CRC][SLIP END]

### PAIR REQ

Sent by the device when searching trying to pair. This has the same structure as the MQTT-SN Forwarder, but uses a non-standard command.

[SLIP END][0][0] [Length (3)][0x03][0x02][addrL (0x00)][addrH (0x00)] [Length (3)][Pair cmd (0x03, non standard MQTT-SN)][randomId] [16 bit CRC][SLIP END]

### PAIR RES

Sent by the Forwarder as a response to PAIR REQ. This has the same structure as the MQTT-SN Forwarder, but uses a non-standard command.

- Without encryption:

[SLIP END][0][0] [Length (3)][0x03][0x02][addrL (0x00)][addrH (0x00)] [Length (5)][Pair cmd (0x03, non standard MQTT-SN)][randomId][newAddr][newPan] [16 bit CRC][SLIP END]

- With encryption:

[SLIP END][0][0] [Length (3)][0x03][0x02][addrL (0x00)][addrH (0x00)] [Length (21)][Pair cmd (0x03, non standard MQTT-SN)][randomId][newAddr][newPan] [encryption key (16 BYTES)] [16 bit CRC][SLIP END]


## Pair Mode

This is not a part of MQTT-SN, it's a custom implementation for allowing easy device pairing.

Devices in pair mode are always configured with the address 0x0000 and PAN (subnet) 0x00, and transmit unencrypted messages.

For pairing devices, the Gateway needs to enter a special mode, this mode ignores any packet not coming or going to the device address 0. this also sets the Bridge in pair mode (if it had encryption, it gets disabled and treats messages differently, changes pan to 0x00).

In normal mode, messages from address 0 are ignored.

When the Gateway is in pair mode and receives a PAIR REQ message, it assigns an unassigned address to the device and sends it via a PAIR RES message. Then, it puts itself back into normal mode. It also sends the PAN id and optionally, an encryption key.

For avoiding collisions, each device sends a random Id with the PAIR REQ, and expects to receive the same id in the response.

### Network parameters

- Addresses: Valid addresses: 1 to 253. 255 broadcast. 0 for config mode.
- PAN (subnet): Valid values: 1 to 254. 0 for config mode.
- Encryption key: 16 byte value, if every byte is set to 0xFF encryption is disabled.
