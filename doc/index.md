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

## Monitoring gateway status

You can make requests to the gateway for getting the list of registered devices, topics and subscriptions.

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
