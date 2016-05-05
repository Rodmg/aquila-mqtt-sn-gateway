#! /usr/bin/env node

'use strict';

var ascii = "" +
"        O   o-o  o   o o-O-o o      O          \n" +
"       / \\ o   o |   |   |   |     / \\       \n" +
"      o---o|   | |   |   |   |    o---o        \n" +
"      |   |o   O |   |   |   |    |   |        \n" +
"      o   o o-O\\  o-o  o-O-o O---oo   o       \n" +
"                                               \n" +
"                o                              \n" +
"                |                              \n" +
"      o--o  oo -o- o-o o   o   o oo o  o       \n" +
"      |  | | |  |  |-'  \\ / \\ / | | |  |     \n" +
"      o--O o-o- o  o-o   o   o  o-o-o--O       \n" +
"         |                             |       \n" +
"      o--o                          o--o       \n";

var ascii2 = "" +
"        O   o-o  o   o o-O-o o      O          \n" +
"       / \\ o   o |   |   |   |     / \\       \n" +
"      o---o|   | |   |   |   |    o---o        \n" +
"      |   |o   O |   |   |   |    |   |        \n" +
"      o   o o-O\\  o-o  o-O-o O---oo   o       \n" +
"                _  mqtt-sn                     \n" +
"      __ _ __ _| |_ _____ __ ____ _ _  _       \n" +
"     / _` / _` |  _/ -_) V  V / _` | || |      \n" +
"     \\__, \\__,_|\\__\\___|\\_/\\_/\\__,_|\\_, |\n" +
"     |___/                          |__/       \n";

console.log(ascii2);

var main = require('./main');