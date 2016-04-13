( function () {

    function slip_buffer ( start, increment ) {
	this.start = start;
	this.increment = ( increment ? increment : start );
	this.buffer = new Buffer( this.start );
	this.size = 0;
    }

    slip_buffer.prototype.append = function ( input ) {
	if( this.size >= this.buffer.length ) {
	    var new_buffer = new Buffer( this.buffer.length + this.increment );
	    for( var i = 0, il = this.buffer.length; i < il; i++ ) {
		new_buffer[ i ] = this.buffer[ i ];
	    }
	    this.buffer = new_buffer;
	}
	this.buffer[ this.size ] = input;
	this.size++;
    };

    slip_buffer.prototype.contentsAndReset = function ( context, callback ) {
	if( this.size > 0 ) {
	    var emit_this = new Buffer( this.size );
	    this.buffer.copy( emit_this, 0, 0, this.size );
	    callback && callback.apply( context, [ emit_this ] );
	    this.size = 0;
	}
    };

    function slip_parser( receiver, strict ) {
	if (typeof strict === "undefined" || strict === null)
		strict = true
	this.receiver = receiver;
	if ( strict )
		this.state = slip_parser.STATE_OUT;
	else
		this.state = slip_parser.STATE_IN;
	this.strict = strict;
	this.data = new slip_buffer( 16 );
	this.error = new slip_buffer( 16 );
    }

    slip_parser.prototype.write = function ( input_buffer ) {
	for( var i = 0, il = input_buffer.length; i < il; i++ ) {
	    switch( this.state ) {
	    case slip_parser.STATE_OUT:
		switch( input_buffer[ i ] ) {
		case slip_parser.CHAR_END:
		    this.state = slip_parser.STATE_IN;
		    this.error.contentsAndReset( this.receiver, this.receiver.framing );
		    break;
		default:
		    this.error.append( input_buffer[i] );
		    break;
		}
		break;

	    case slip_parser.STATE_IN:
		switch( input_buffer[i] ) {
		case slip_parser.CHAR_END:
			if ( this.strict )
				this.state = slip_parser.STATE_OUT;
		    this.data.contentsAndReset( this.receiver, this.receiver.data );
		    break;
		case slip_parser.CHAR_ESC:
		    this.state = slip_parser.STATE_ESC;
		    break;
		default:
		    this.data.append( input_buffer[ i ] );
		    break;
		}
		break;

	    case slip_parser.STATE_ESC:
		switch( input_buffer[i] ) {
		case slip_parser.CHAR_ESC_END:
		    this.state = slip_parser.STATE_IN;
		    this.data.append( 0xC0 );
		    break;
		    
		case slip_parser.CHAR_ESC_ESC:
		    this.state = slip_parser.STATE_IN;
		    this.data.append( 0xDB );
		    break;

		default:
		    this.state = slip_parser.STATE_IN;
		    this.receiver.escape && this.receiver.escape.apply( this.receiver, [ input_buffer[i] ] );
		    break;
		    
		}
		break;
	    }
	}

    };

    slip_parser.STATE_OUT = 0;
    slip_parser.STATE_IN  = 1;
    slip_parser.STATE_ESC = 2;

    slip_parser.CHAR_END     = 0xC0;
    slip_parser.CHAR_ESC     = 0xDB;
    slip_parser.CHAR_ESC_END = 0xDC;
    slip_parser.CHAR_ESC_ESC = 0xDD;

  slip_generator = function ( input_buffer, strict ) {
      var new_buffer_size = input_buffer.length + 1;

      if( "undefined" == typeof strict ) {
        strict = true;
      }

      if( strict ) {
          new_buffer_size++;
      }

      for( var i = 0, il = input_buffer.length; i < il; i++ ) {
          var c = input_buffer[ i ];
          if( ( c == slip_parser.CHAR_END ) || ( c == slip_parser.CHAR_ESC ) ) {
              new_buffer_size++;
          }
      }

      var new_buffer = new Buffer( new_buffer_size );
      var o = 0;

      if( strict ) {
          new_buffer[ o++ ] = 0xC0;
      }

      for( var i = 0, il = input_buffer.length; i < il; i++ ) {
          var c = input_buffer[ i ];
          switch( c ) {
          case slip_parser.CHAR_END:
            new_buffer[ o++ ] = slip_parser.CHAR_ESC;
            new_buffer[ o++ ] = slip_parser.CHAR_ESC_END;
            break;
          case slip_parser.CHAR_ESC:
            new_buffer[ o++ ] = slip_parser.CHAR_ESC;
            new_buffer[ o++ ] = slip_parser.CHAR_ESC_ESC;
            break;
          default:
            new_buffer[ o++ ] = c;
          }
      }
      new_buffer[ o++ ] = 0xC0;

      return( new_buffer );
    };

    if( module && module.exports ) {
        module.exports = {
	    parser: slip_parser,
	    generator: slip_generator
	};
    }

} ) ( );
