
# Changelog

## develop ()

**Breaking Changes:**

- Changed database to sqlite with the sequelize library. This means that any data from previous versions **will be lost**.

## 0.6.0 (2017-02-13)

- Implemented removing devices from the monitor API.

- Changed Monitor API: All "*/get" command topics are now "*/req" for consistency with responses ("*/res"). Old API is still supported but deprecated.

- Minor bug fix: incorrect buffer function usage in Serial and TCP Transports.

The first change is useful when managing devices from a custom app. Usage:

Removing a device:

1. subscribe to gw/devices/remove/res
2. publish to gw/devices/remove/req a json with the address or id of the device to delete. Example: { "address": 23 } or { "id": 23 }.
3. You should get a JSON response via the subscription to gw/devices/remove/res: { "success": true } (or false).

More info in the docs: https://github.com/Rodmg/aquila-mqtt-sn-gateway/blob/master/doc/index.md

## 0.5.0 (2016-11-05)

- Fixed issues with sleeping devices getting lost.

- Added command line option for specifying path of the device database file.

- Added command line option for specifying the Gateway monitor topics prefix.

The last two changes are useful when running multiple gateway instances on the same machine, so that they don't interfere with each other.

## 0.4.2 (2016-10-22)

- Now you can install it directly from npm as a global package and use it as a command line program. Instructions are on the README of the github repo.

- Implemented experimental TCP Transport: Instead of connecting the Bridge directly via Serial, you can connect it remotely via a TCP transport. For example, connecting the Bridge to a ESP8266 and then to the Gateway via WiFi.

- Framing error fixes: The serial communication between the Bridge and the Gateway uses a protocol called SLIP, it has an start and end character for delimiting packets. Sometimes, when starting the Gateway, the Bridge could be in the middle of receiving a packet from a device and the Gateway would get an incomplete packet, this would cause a "Framing error". Ideally, it should only lose that packet and continue normally, but due the way the node-slip library was implemented, it would cause all the following packets to be also erroneous, a "frame error train".

I added the validation for that special case to the node-slip library in a fork and used it in aquila-gateway, now it works as expected.

- Other minor bug fixes.

**Embedded MQTT-SN library - MQTTClient:**

- Fixed a bug: When connecting with "last will" enabled, it would always return a success even when it failed.

- Updated examples, changed default PAN address to 1, the default in aquila-gateway.