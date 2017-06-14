'use strict';
var gulp = require('gulp');
var tsc  = require("gulp-typescript");
var del = require('del');
var sourcemaps = require('gulp-sourcemaps');
var path = require('path');
var runSequence = require('run-sequence');
var spawn = require('child_process').spawn;

// Node process
var node = null;

var tsProject = tsc.createProject("tsconfig.json");

gulp.task('clean', function(cb){
  return del('dist', cb)    
});

gulp.task('build', ['clean'], function() {
  var tsResult = gulp.src(["src/**/*.ts"])
    .pipe(sourcemaps.init())
    .pipe(tsProject());
  return tsResult.js
    .pipe(sourcemaps.write('.', {
      sourceRoot: function(file){ return file.cwd + '/src'; }
    }))
    .pipe(gulp.dest("dist"));
});

gulp.task('clean-serve', function(cb) {
  runSequence('clean', 'serve', cb);
});

// first time cleans and compiles, subsecuent times only compiles
gulp.task('watch', ['clean-serve'], function() {
  gulp.watch('src/**/*.ts', ['serve']);
});

gulp.task('serve', ['build'], function() {
  if(node) node.kill();
  node = spawn('node', ['--require', 'source-map-support/register', 'dist/main.js', '-v', 'trace', '-p', '/dev/tty.SLAB_USBtoUART'], {stdio: 'inherit'});
  node.on('close', function (code) {
    if (code === 8) {
      gulp.log('Error detected, waiting for changes...');
    }
  });
});

gulp.task('default', ['build']);

// clean up if an error goes unhandled.
process.on('exit', function() {
    if (node) node.kill();
});
