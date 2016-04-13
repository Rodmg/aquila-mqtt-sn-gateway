# node-slip

This package parses (and generates) RFC 1055 Serial Line Internet Protocol
(SLIP) packets. Used in conjunction with packages like node-serialport, it
can be useful to communicate between node programs and old-skool embedded
systems that are still using SLIP.

Note: this package is does not support CSLIP (Compressed SLIP.) 

## Installation

The easiest way to install this package is to use npm:

<pre>    npm install node-slip</pre>

If you want to check out the source, use the git command:

<pre>    git clone git://github.com/OhMeadhbh/node-slip.git</pre>

## Usage

### Theory of Operation

This package lets you parse and generate SLIP formatted packets. The parser
is implemented in a simple stateful object. The user feeds a SLIP octet stream
to the parser object. This parser object strips off the leading and trailing
END characters (0xC0) and unescapes escape sequences (0xDB 0xDC and 0xDB 0xDD).

When you initialize a parser, you pass it a "receiver" object. When the parser
receives a complete packet, it calls the "data" function in the receiver
object. If the receiver defines "framing" or "escape" functions, it will
call these functions when it encounters framing or escape errors.

The packet generator is a simple static method on the slip package. Pass it a
raw node Buffer and the generator will add END characters to the front and
back and escape octets that require escaping.

### Using the Parser

Start your node program like any other by requiring the package:

<pre>    var slip = require( 'node-slip' );</pre>

Now define a receiver object. This is an instance that optionally defines the
functions: data, framing and escape. Here's a very simple example:

<pre>    var receiver = {
      data: function( input ) {
        console.log( "Hey! We Got a Packet: " + input.toString( 'hex' ).toUpperCase() );
      },
      framing: function( input ) {
        console.log( "OMG! A Framing Error: " + input.toString( 'hex' ).toUpperCase() );
      },
      escape: function( input ) {
        console.log( "OMG! An Escape Error: " + input.toString( 16 ).toUpperCase() );
      }
    };</pre>

Now instantiate a slip parser like so:

<pre>    var parser = new slip.parser( receiver, strict );</pre>

(strict is a bool that will mandate SLIP packets begin and end with the END character if set to true.  It defaults to true.)

And start sending the parser some data:

<pre>    parser.write( new Buffer( 'C000112233445566DBDCDBDDC0', 'hex' ) );</pre>

In theory, this line should emit something like this:

<pre>     Hey! We Got a Packet: 00112233445566C0DB</pre>

But if you did something like this, you'll see why it's a useful package:

<pre>    parser.write( new Buffer( 'C0FFEEDD', 'hex' ) );
    parser.write( new Buffer( '001122C0', 'hex' ) );</pre>

This code fragment will emit this:

<pre>     Hey! We Got a Packet: FFEEDD001122</pre>

Note the parser doesn't emit anything until the whole packet is available. This
is useful if (like me) you're using node-serialport to read input from an
embedded system over the serial port and that embedded system doesn't always
give you complete packets.

Another fun thing that can happen is we get two (or more) SLIP packets in one
call to read the serial port. This sometimes happens if your packets are small
and you only process serial port input every NNN microseconds. So if you
do this:

<pre>    parser.write( new Buffer( 'C0FFEEDDC0C0DDEEFFC0', 'hex' ) );</pre>

You'll get this:

<pre>     Hey! We Got a Packet: FFEEDD
     Hey! We Got a Packet: DDEEFF</pre>

And if you get a framing error (like you add stuff between the two middle
END bytes, we collect the data and pass it as a parameter to the framing()
function. Ergo, doing this:

<pre>    parser.write( new Buffer( 'C0FFEEDDC0AA55A55AC0DDEEFFC0', 'hex' ) );</pre>

Will get you this:

<pre>    Hey! We Got a Packet: FFEEDD
    OMG! A Framing Error: AA55A55A
    Hey! We Got a Packet: DDEEFF</pre>

Mucking up an escape sequence will cause the escape() function in the
receiver to be called. So if you do this:

<pre>    parser.write( new Buffer( 'C00011DBAA1100C0', 'hex' ) );</pre>

You get this:
<pre>    OMG! An Escape Error: AA
    Hey! We Got a Packet: DDEEFF</pre>

Note: data() and framing() are passed Buffer objects. escape() is only passed
a number.

### Using the Generator

The generator is much simpler. You simply call the slip.generator() function,
passing it a buffer as input. What you get back will be a data buffer with
starting and ending END bytes applied and C0 and DB bytes escaped.

This routine:

<pre>    var slip = require( 'node-slip' );
    var input = Buffer( '00FF00FFDBFFC0FF', 'hex' );
    console.log( "Here's your SLIPified packet: " + slip.generator( input ).toString( 'hex' ).toUpperCase() );</pre>

Will output this:

<pre>    Here's your SLIPified packet: C000FF00FFDBDDFFDBDCFFC0</pre>

The generator call also takes an optional 'strict' parameter. It defaults to true. Explicitly setting the strict
parameter to false causes the generator to omit the initial END byte. For example, this routine:

<pre>    var slip = require( 'node-slip' );
    var input = Buffer( '00FF00FFDBFFC0FF', 'hex' );
    console.log( "Here's your SLIPified packet: " + slip.generator( input, false ).toString( 'hex' ).toUpperCase() );</pre>

Will generate this:

<pre>    Here's your SLIPified packet: 00FF00FFDBDDFFDBDCFFC0</pre>
