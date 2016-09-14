# Aquila MQTT-SN Gateway

Puerta de enlace MQTT-SN para la plataforma Aquila 2.0.

Este software actúa como un enlace transparente entre una red de sensores de bajo consumo (como [Altair](http://www.aquila.io/en) u otros dispositivos 802.15.4 o RF) y un Broker MQTT (como mosca o mosquitto). Esto nos permite integrar fácilmente estos dispositivos con bibliotecas y aplicaciones MQTT existentes.

Puedes encontrar más información técnica en la [documentación](doc/).

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

## Implementaciones del Bridge y clientes

Este Gateway busca ser lo más independiente posible de las capas de transporte de red, esto nos permite utilizar casi cualquier red de sensores con sólo desarrollar un puente o "Bridge" de hardware que implemente el protocolo serial "forwarder" definido en la [documentación](doc/).

Actualmente existen implementaciones para la placa de desarrollo 802.15.4 [Altair](http://www.aquila.io/en) y para dispositivos basados en el módulo rfm69 de radiofrecuencia con microcontroladores Atmel AVR.

- Altair: [Bridge](https://github.com/Rodmg/altair-mqtt-sn-bridge) y [ejemplo/plantilla de cliente](https://github.com/Rodmg/altair-mqtt-sn-client-example)
- rfm69: [Bridge](https://github.com/Rodmg/rfm-mqtt-sn-bridge) y [ejemplo/plantilla de cliente](https://github.com/Rodmg/rfm-mqtt-sn-client-example)

## Requisitos

- [Node.js](https://nodejs.org/en/) v4.X.X o superior. (Probado con v4.5.0 y v6.3.1)

## Uso

1. Clona este repositorio y haz ``cd`` al directorio del proyecto

2. Instala dependencias:

  ```
  npm install
  npm install -g bunyan
  ```
3. Corre un broker MQTT en tu PC, por ejemplo: [Mosca](https://github.com/mcollina/mosca)

4. Conecta el Bridge a la PC e identifica a que puerto serial está conectado

5. Corre:

  ```
  ./aquila-gateway.js -p <puerto serial del Bridge> | bunyan
  ```

## Uso avanzado

Obtén ayuda:

```
./aquila-gateway.js -h
```

```
Usage: aquila-gateway [options]

  Options:

    -h, --help                output usage information
    -V, --version             output the version number
    -v, --verbose [level]     Verbosity level for logging (fatal, error, warn, info, debug, trace) [info]
    -p, --port [serial port]  Serial Port path [/dev/tty.SLAB_USBtoUART]
    -b, --broker [url]        MQTT broker URL [http://localhost:1883]
    -u, --allow-unknown-devices [true/false]  Allow connection of previously unknown (not paired) devices [true]
```

Conectarse a un Broker remoto (ejemplo):

```
./aquila-gateway.js -p /dev/tty.SLAB_USBtoUART -b http://test.mosquitto.org:1883 | bunyan
```