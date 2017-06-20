# Aquila MQTT-SN Gateway

MQTT-SN gateway for the Aquila 2.0 platform.

This software acts as a transparent link between a sensor network of low power devices (like [Altair](http://www.aquila.io/en) or other 802.15.4 or RF devices) and a MQTT broker (like mosca or mosquitto). This allows us to seamlessly and easily integrate those devices with existing MQTT applications and libraries.

You can find more information in the [documentation](doc/)

```
    (Device)_____                          ____________________            _______________
                  \___________            |                    |          |               |
                      MQTT-SN \__ ________|                    |   MQTT   |               |
          (Device)_______________| Bridge |      Gateway       |__________|  MQTT Broker  |
                               __ --------|  (aquila-gateway)  |          |               |
            __________________/           |                    |          |               |
    (Device)                               --------------------            ---------------
                                                                                  |
                                                                             MQTT |
                                                                           _______|________
                                                                          |               |
                                                                          |  Other MQTT   |
                                                                          |    Devices    |
                                                                           ---------------
```

## Bridge and client implementations

This gateway is meant to be as transport agnostic as possible, this allows us to use almost any sensor network just by developing a hardware bridge that implements the serial forwarder protocol defined in the [documentation](doc/).

Currently there are implementations for the [Altair](http://www.aquila.io/en) 802.15.4 development board and for rfm69 915Mhz RF devices with Atmel AVR processors.

- Altair: [Bridge](https://github.com/Rodmg/altair-mqtt-sn-bridge) and [example client template](https://github.com/Rodmg/altair-mqtt-sn-client-example)
- rfm69: [Bridge](https://github.com/Rodmg/rfm-mqtt-sn-bridge) and [example client template](https://github.com/Rodmg/rfm-mqtt-sn-client-example)

## Requirements

- [Node.js](https://nodejs.org/en/) v6.5.X or newer. (Tested with v6.10.2+)

## Usage

1. Install:

  ```
  npm install -g aquila-gateway bunyan
  ```

  *If you have problems installing, try with:* ``sudo npm install -g aquila-gateway bunyan --unsafe-perm`` 

2. Run a MQTT broker on your PC, for example [Mosca](https://github.com/mcollina/mosca)

3. Connect the Bridge to the PC and identify which serial port it's connected to

4. Run:

  ```
  aquila-gateway -p <your Bridge serial port> | bunyan
  ```

## Advanced usage

Get help:

```
aquila-gateway -h
```

```
Usage: aquila-gateway [options]

  Options:

    -h, --help                                output usage information
    -V, --version                             output the version number
    -v, --verbose [level]                     Verbosity level for logging (fatal, error, warn, info, debug, trace) [info]
    -t, --transport [transport]               Forwarder transport type (serial, tcp) [serial]
    -p, --port [serial port]                  Serial Port path if using serial transport, TCP port number if using TCP transport [/dev/tty.SLAB_USBtoUART | 6969]
    -b, --broker [url]                        MQTT broker URL [http://localhost:1883]
    -u, --allow-unknown-devices [true/false]  Allow connection of previously unknown (not paired) devices [true]
    -s, --subnet [pan id]                     PAN subnet number (1 to 254) [1]
    -k, --key [16 byte array]                 16 byte encryption key [null]
    -d, --data-path [path]                    Path to data persist file [/Users/rod/.aquila-gateway/data.json]
    -m, --monitor-prefix [prefix]             Gateway monitor topics prefix [gw]
```

Connect to a remote broker (example):

```
aquila-gateway -p /dev/tty.SLAB_USBtoUART -b http://test.mosquitto.org:1883 | bunyan
```

## Developement

1. Clone this repository and ``cd`` to the project directory

2. Install dependencies:

  ```
  npm install
  npm install -g bunyan gulp-cli
  ```
3. Run a MQTT broker on your PC, for example [Mosca](https://github.com/mcollina/mosca)

4. Connect the Bridge to the PC and identify which serial port it's connected to

5. Run:

  ```
  ./aquila-gateway.js -p <your Bridge serial port> | bunyan
  ```

6. Development tasks (uses gulp):

  **Build:**

  ```
  gulp build
  ```

  **Build and run (you may need to edit gulpfile.js for setting the serial port):**

  ```
  gulp serve | bunyan
  ```

  **Automatically watch for changes:**

  ```
  gulp watch | bunyan
  ```

## Supported MQTT-SN features

- QoS: supports QoS0, QoS1 and QoS2 (QoS2 implementation between device and gateway is mostly dummy, equivalent to QoS1)
- Publish retries for QoS1 and QoS2
- Commands:
  - ADVERTISE
  - CONNECT
  - CONNACK
  - DISCONNECT
  - WILLTOPICREQ
  - WILLTOPIC
  - WILLMSGREQ
  - WILLMSG
  - REGISTER
  - REGACK
  - PUBLISH
  - PUBACK
  - SUBSCRIBE
  - SUBACK
  - UNSUBSCRIBE
  - UNSUBACK
  - PINGREQ
  - PINGRESP
  - WILLTOPICUPD
  - WILLMSGUPD
  - WILLTOPICRESP
  - WILLMSGRESP
  - PUBREC, PUBREL, PBCOMP (QoS2)
  - SEARCHGW (basic, not spec checked)
  - GWINFO (basic, not spec checked)
- Implements Forwarder Encapsulation spec with a little modification: adds lqi and rssi data at the start of the frame.
- Supports topic register
- Supports last will
- Supports and manages disconnect timeout
- Will update
- Subscribe, Unsubscribe
- Retained messages support (issue: when a device subscribes to a topic with a retained message, it will be resent to all devices susbscribed to it, check if it's a problem)
- Sleeping nodes -> message buffering

## Extra features (not MQTT-SN standard)

- Gateway management via predefined topics for getting info of connected devices, management of the devices, etc.
- Device pairing management for Altair and rfm69 (Transport dependent)
- Multiple forwarder software transports support: Serial and TCP (experimental proof of concept) are currently implemented.

## TODO

- QoS -1
- WILDCARDS support as mqtt-sn spec
- Short and predefined MQTT-SN topics

## Not supported

- 3 byte MQTT-SN header

## TOTEST

- Check if parser on willtopicupd accept empty flags and topic (for removing will)
- Will update
- Make sure that buffered messages are sent in order
