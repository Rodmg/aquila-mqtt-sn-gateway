# Aquila Gateway Documentation

Aquila Gateway is an implementation of a MQTT-SN Gateway for the Aquila 2.0 platform.

This software acts as a transparent link between a sensor network of low power devices (like Altair or other 802.15.4 or RF devices) and a MQTT broker (like mosca or mosquitto). This allows us to seamlessly and easily integrate those devices with existing MQTT applications and libraries.

The low power devices would run a "light" version of the MQTT protocol, called MQTT-SN, and the gateway is tasked with managing and translating those connections to a standard MQTT broker.

In the current implementation, we support communication with sensor networks via a "Bridge" device, connected via serial port. An example Bridge firmware implementation exists for the Altair development board, but should be easily portable to other RF boards.

The communication between the "Bridge" and the "Gateway" is done via a "Forwarder" protocol, the protocol in this implementation is mostly the protocol described in the MQTT-SN spec 1.2, section 5.5 "Forwarder Encapsulation", with a two main modifications: added lqi and rssi data at the start of the frame, and added ACK an NACK support. 

The gateway implementation is of an "Aggregating Gateway", as described in the MQTT-SN spec 1.2, section 4.2

For more information on MQTT-SN and its workings, please read: [MQTT-SN spec 1.2](http://mqtt.org/new/wp-content/uploads/2009/06/MQTT-SN_spec_v1.2.pdf)

## Topology

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

## Practical limits

By default, the bridge and devices are configured with the following limits:

- Max Payload length: 54 bytes
- Max Topic length: 21 bytes
- Max subscriptions in a device: 6

These limits are set due to memory constraints in the embedded devices, or by low level network constraints.

The real theoric network limits of the current network implementations are:

- Altair: Max payload size: 128 bytes, real limits after network layers headers about 96 bytes (TODO: Confirm)
- rfm69: Max payload size: 60 bytes (TODO: Confirm)

Also be aware that the MQTT-SN headers ocuppy some bytes. (TODO: say exactly how many)

Currently, the limits are set for the rfm69 implementation to work correctly.

You could vary those constraints depending on the bridge and device implementation as follows:

1. Change the MAXLEN global variable in Gateway.js of aquila-gateway
2. Change SERIAL_BUFF_SIZE definition in SerialEndpoint.h of the bridge firmware
3. Change recBuffer size of WSNetwork.cpp of the device firmware
4. Change MAX_PACKET_SIZE, MAX_MESSAGE_HANDLERS, MAX_REGISTRATION_TOPIC_NAME_LENGTH, MAX_WILL_TOPIC_LENGTH from MQTTSNClient.h of the device firmware

## Monitoring gateway status

You can make requests to the gateway for getting the list of registered devices, topics and subscriptions.

By default, all the monitor topics start whith the ``gw`` prefix. You can change the prefix by passing a different one with the ``-m`` option when launching aquila-gateway.

#### Getting devices:

1. subscribe to gw/devices/res
2. publish to gw/devices/get
3. You should get a JSON response via the subscription made to gw/devices/res

#### Getting topics:

1. subscribe to gw/topics/res
2. publish to gw/topics/get
3. You should get a JSON response via the subscription made to gw/topics/response

#### Getting subscriptions:

1. subscribe to gw/subscriptions/res
2. publish to gw/subscriptions/get
3. You should get a JSON response via the subscription made to gw/subscriptions/res

#### Enter forwarder pair mode:

publish gw/forwarder/enterpair

#### Exit forwarder pair mode:

publish gw/forwarder/exitpair

#### Get forwarder current mode

1. subscribe to gw/forwarder/mode/res
2. publish to gw/forwarder/mode/get
3. You should get a JSON response via the subscription made to gw/forwarder/mode/res

### Events:

gw/devices/connected: published when a device its connected, has the device details as JSON in the payload

gw/devices/disconnected: published when a device gets disconnected, has the device details as JSON in the payload

gw/devices/paired: published when a device gets paired, has some device details as JSON in the payload, may be incomplete as device has yet to register and subscribe to topics.
