var slip = require( './node-slip' );

var receiver = {
    data: function( input ) {
        console.log( "Hey! We Got a Packet: " + input.toString( 'hex' ).toUpperCase() );
    },
    framing: function( input ) {
        console.log( "OMG! A Framing Error: " + input.toString( 'hex' ).toUpperCase() );
    },
    escape: function( input ) {
        console.log( "OMG! An Escape Error: " + input.toString( 16 ).toUpperCase() );
    }
};

var parser = new slip.parser( receiver );

parser.write( new Buffer( 'C000112233445566DBDCDBDDC0', 'hex' ) );

parser.write( new Buffer( 'C0FFEEDD', 'hex' ) );
parser.write( new Buffer( '001122C0', 'hex' ) );

parser.write( new Buffer( 'C0FFEEDDC0C0DDEEFFC0', 'hex' ) );

parser.write( new Buffer( 'C0FFEEDDC0AA55A55AC0DDEEFFC0', 'hex' ) );

parser.write( new Buffer( 'C00011DBAA1100C0', 'hex' ) );

var input = Buffer( '00FF00FFDBFFC0FF', 'hex' );
console.log( "Here's your SLIPified packet: " + slip.generator( input ).toString( 'hex' ).toUpperCase() );
