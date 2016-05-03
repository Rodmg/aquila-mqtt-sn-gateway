# Aquila Gateway

MQTT-SN gateway for Aquila 2.0 platform.

## Supported MQTT-SN features

- QoS: supports QoS0 and QoS1
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
- Implements Forwarder Encapsulation spec with a little modification: adds lqi and rssi data at the start of the frame.
- Supports topic register
- Supports last will
- Supports and manages disconnect timeout
- Will update
- Subscribe, Unsubscribe

## TODO

- Proper retain support (must simulate, because broker doesn't know when a device connects or disconnects)
- QoS -1, 2
- WILDCARDS
- Sleeping nodes -> message buffering
- Short and predefined MQTT-SN topics
- Commands:
  - SEARCHGW
  - GWINFO
  - PUBREC, PUBREL, PBCOMP (QoS2)

## TODO Mid-term

- Support other transports: TCP socket (for using an ESPino or similar as forwarder)
- Advanced device management: implement predefined Gateway topics for getting info of connected devices, events etc. (non MQTT-SN standard, implement as module)
- Device pairing management

## TOTEST

- Removing subscriptions
- Check disconect parser, should accept messages without duration field
- Check if parser on willtopicupd accept empty flags and topic (for removing will)
- Will update
