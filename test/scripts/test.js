/*global jQuery:true, playerjs:true, console:true */

(function($, document, window){
  var DEFAULT_OPTIONS = {
    autoPlay: true,
    testAudio: true,
    timeoutSeconds: 10.0
  };
  // max is 5 minute timeout
  var MAX_TIMEOUT = 5 * 60 * 1000;

  // Allows use to wait a certain ammount of time before we fail.
  var Waiter = function(testCase, time, t, names, msg, next){
    this.init(testCase, time, t, names, msg, next);
  };

  Waiter.prototype.init = function(testCase, time, t, names, msg, next){
    this.testCase = testCase;
    this.names = names;
    this.msg = msg;
    this.t = t;
    this.next = next;

    var self = this;
    setTimeout(function(){
      self.done();
    }, time);
  };

  Waiter.prototype.kill = function(){
    this.killed = true;
  };

  Waiter.prototype.done = function(){
    if (!this.killed){
      for (var i=0; i<this.names.length; i++){

        if (this.t instanceof Array) {
          for (var n=0; n< this.t.length; n++){
            this.testCase.fail(this.t[n], this.names[i], this.msg);
          }
        } else {
          this.testCase.fail(this.t, this.names[i], this.msg);
        }
      }

      if (this.next){
        this.testCase.next();
      } else {
        this.testCase.failure();
      }
    }
  };


  // Test Case.
  var TestCase = function(player, options){
    this.init(player, options || {});
  };

  TestCase.prototype.init = function(player, options){
    this.player = player;

    /** @type {typeof DEFAULT_OPTIONS} */
    this.options = Object.assign({}, DEFAULT_OPTIONS, options);

    var timeout = (this.options.timeoutSeconds * 1000);
    if (timeout <= 0 || isNaN(timeout) || timeout > MAX_TIMEOUT) {
      timeout = MAX_TIMEOUT;
    }
    this.options.timeout = timeout;

    this.tests = ['ready', 'listeners', 'play', 'timeupdate', 'paused'];
    if (this.options.testAudio) {
      this.tests.push('volume', 'mute');
    }
    this.tests.push('duration', 'currentTime', 'loop', 'ended');
    this.index = 0;
    this.waiters = [];
    this.stopped = false;


    this.successes = 0;
    this.failures = 0;
    this.cautions = 0;
  };

  TestCase.prototype.stop = function(){
    // Just clear tests;
    this.tests = [];
    this.waiters = [];
    this.stopped = true;
  };

  TestCase.prototype.test = function(){
    var test = this.tests[this.index];

    try {
      this[test].call(this);
    } catch (err){
      console.error(err);
    }
  };

  TestCase.prototype.next = function(){
    this.index++;

    if (this.stopped){
      return false;
    }

    for (var i = 0; i < this.waiters.length; i++){
      this.waiters[i].kill();
    }
    this.waiters = [];

    if (this.index === this.tests.length){
      $('#success').foundation('reveal', 'open');

      $('.modal-results').html([
        '<ul>',
          '<li><b>Successful Tests:</b> <span>'+this.successes+'</span></li>',
          '<li><b>Not Implemented:</b> <span>'+this.cautions+'</span></li>',
          '<li><b>Failed Tests:</b> <span>'+this.failures+'</span></li>',
        '</ul>'
      ].join(''));

      return false;
    }

    this.test();
  };

  TestCase.prototype.delay = function(func, time){
    var self = this;
    setTimeout(function(){
      func.call(self);
    }, time? time:50);
  };

  TestCase.prototype.wait = function(time, t, names, msg, next){
    var wait = new Waiter(this, time, t, names, msg, next);
    this.waiters.push(wait);
    return wait;
  };

  TestCase.prototype.selector = function(t, name){
    return '#' + t + name.substr(0,1).toUpperCase() + name.substr(1);
  };

  TestCase.prototype.success = function(t, name){
    this.successes += 1;
    this.clearPending(t, name);
    var selector = this.selector(t, name);
    $(selector).addClass('success');
    $(selector+' .test-mark').html('<i class="fa fa-check"></i>');
  };

  TestCase.prototype.pending = function(t, name, msg){
    var selector = this.selector(t, name);
    $(selector).addClass('pending');
    $(selector+' .test-result').text(msg);
    $(selector+' .test-mark').html('<i class="fa fa-exclamation"></i>');
  };

  TestCase.prototype.clearPending = function(t, name) {
    var selector = this.selector(t, name);
    $(selector).removeClass('pending');
    $(selector+' .test-result').text('');
  }

  TestCase.prototype.caution = function(t, name){
    this.cautions += 1;
    this.clearPending(t, name);
    var selector = this.selector(t, name);
    $(selector).addClass('caution');
    $(selector+' .test-result').text('This implementation does not support "'+name+'"');
    $(selector+' .test-mark').html('<i class="fa fa-minus"></i>');
  };

  TestCase.prototype.fail = function(t, name, msg){
    this.failures += 1;
    this.clearPending(t, name);
    var selector = this.selector(t, name);
    $(selector).addClass('error');
    $(selector+' .test-result').text(msg);
    $(selector+' .test-mark').html('<i class="fa fa-times"></i>');
  };

  TestCase.prototype.failure = function(t, name, msg){
    this.stop();
    $('#failure').foundation('reveal', 'open');
  };

  /* TESTS */
  TestCase.prototype.ready = function(){
    this.wait(this.options.timeout, 'event', ['ready'], 'Failed to get ready');

    this.pending('event', 'ready', 'Waiting for ready event');

    this.player.on('ready', function(){
      this.success('event', 'ready');
      this.next();
    }, this);
  };

  TestCase.prototype.listeners = function(){
    var count = 0;

    var onPlay = (function () {
      if (count === 0){
        this.player.pause();
        this.player.off('play');

        this.delay(function(){
          // we might get a timeout before everything is registered.
          if (count === 1){
            this.success('method', 'addEventListener');
            this.success('method', 'removeEventListener');
            this.player.pause();
            this.next();
          }
        }, 750);

        this.player.play();
      }
      count++;
    }).bind(this);

    this.player.on('play', onPlay);

    if (this.options.autoPlay) {
      this.wait(this.options.timeout, 'method', ['addEventListener', 'removeEventListener'], 'Could not add/remove event listeners. This method requires play and pause to work correctly.');
      if (!this.options.testAudio) {
        this.player.mute();
      }

      this.player.play();
    } else {
      console.log('Waiting for play event...');

      this.pending('event', 'play', 'Autoplay not set, press play on video to continue test');
      this.player.getPaused((function (isPaused) {
        // already moved forward, ignore
        if (count > 0) {
          return;
        }
        if (!isPaused) {
          console.log('Video is already playing');
          onPlay();
        } else {
          console.log('Video currently paused');
        }
      }).bind(this));
    }
  };

  TestCase.prototype.play = function(){
    console.log('Testing play');

    this.wait(this.options.timeout, ['method', 'event'], ['play', 'pause'], 'Failed play');

    this.player.on('play', function(){
      this.success('method', 'play');
      this.success('event', 'play');

      this.player.off('play');

      console.log('Testing Pause');
      this.player.on('pause', function(){
        this.success('method', 'pause');
        this.success('event', 'pause');
        this.player.off('pause');

        this.next();
      }, this);

      // Make sure we are playing the video first.
      this.player.on('timeupdate', function(){
        this.player.off('timeupdate');
        this.player.pause();
      }, this);
    }, this);

    this.player.play();
  };

  TestCase.prototype.timeupdate = function(){
    console.log('Testing Timeupdate');

    if (!this.player.supports('event', 'timeupdate')){
      this.caution('event', 'timeupdate');
      this.next();
      return false;
    }

    this.wait(9000, 'event', ['timeupdate'], 'Failed timeupdate');

    var done = false, updates = [];
    this.player.on('timeupdate', function(data){
      updates.push(data);

      if (!done && updates.length === 3){
        done = true;
        this.success('event', 'timeupdate');
        this.player.off('timeupdate');

        this.player.on('pause', function(){
          this.player.off('pause');
          this.next();
        }, this);

        this.player.pause();

      }
    }, this);

    this.player.play();
  };

  TestCase.prototype.paused = function(){
    console.log('Testing getPaused');

    if (!this.player.supports('method', 'getPaused')){
      this.caution('method', 'getPaused');
      this.next();
      return false;
    }

    this.wait(2000, 'method', ['getPaused'], 'Failed getPaused');

    this.player.on('play', function(){
      this.player.off('play');

      // make sure that we set the getPaused
      this.player.getPaused(function(paused){

        if (paused === false){
          this.player.on('pause', function(){
            this.player.off('pause');
            this.player.getPaused(function(paused){
              if (paused === true){
                this.success('method', 'getPaused');
                this.next();
              } else {
                this.fail('method', 'getPaused', 'When the video was paused after play getPaused did not return true');
              }
            }, this);

          }, this);
        } else {
          this.fail('method', 'getPaused', 'When the video was played getPaused did not return false');
        }
        this.player.pause();
      }, this);
    }, this);
    this.player.play();
  };

  TestCase.prototype.ended = function(){
    console.log('Testing ended');

    if (!this.player.supports('event', 'ended')){
      this.caution('event', 'ended');
      this.next();
      return false;
    }

    // If nothing works, fail them.
    this.wait(9000, 'event', ['ended'], 'Failed to fire ended event');

    this.player.on('timeupdate', function(){
      this.player.off('timeupdate');
      this.player.getDuration(function(duration){
        this.player.setCurrentTime(duration-1);
        this.player.on('ended', function(){
          //this.player.setCurrentTime(0);
          this.player.pause();
          this.success('event', 'ended');
          this.next();
        }, this);
      }, this);
    }, this);

    this.player.play();
  };

  TestCase.prototype.duration = function(){
    console.log('Testing getDuration');

    if (!this.player.supports('method', 'getDuration')){
      this.caution('method', 'getDuration');
      this.next();
      return false;
    }

    // If nothing works, fail them.
    this.wait(1000, 'method', ['getDuration'], 'Failed to getDuration', true);

    this.player.getDuration(function(duration){
      if (duration){
        this.success('method', 'getDuration');
        this.next();
      }
    }, this);
  };

  TestCase.prototype.currentTime = function(){
    console.log('Testing setCurrentTime/getCurrentTime');

    if (!this.player.supports('method', ['setCurrentTime', 'getCurrentTime'])){
      this.caution('method', 'setCurrentTime');
      this.caution('method', 'getCurrentTime');
      this.next();
      return false;
    }

    // If nothing works, fail them.
    this.wait(9000, 'method', ['setCurrentTime', 'getCurrentTime'], 'Failed to get / set currentTime', true);

    this.player.on('timeupdate', function(data){
      // Seek back to 0
      if (data.seconds < 0 || data.seconds > 1){
        this.fail('method', 'setCurrentTime', 'Expected a time of .5. Got: "'+data.seconds+'"');
        this.fail('method', 'getCurrentTime', 'Expected a time of .5. Got: "'+data.seconds+'"');
      }

      this.player.off('timeupdate');

      // Seek forward a bit.
      this.player.setCurrentTime(3);

      this.player.on('timeupdate', function(data){
        this.player.off('timeupdate');

        // It takes a bit to seek sometimes.
        this.delay(function(){
          this.player.getCurrentTime(function(time){
            if (time > 2 && time < 4){
              this.success('method', 'setCurrentTime');
              this.success('method', 'getCurrentTime');
            } else {
              this.fail('method', 'setCurrentTime', 'Expected a time of 3. Got: "'+time+'"');
              this.fail('method', 'getCurrentTime', 'Expected a time of 3. Got: "'+time+'"');
            }

            this.player.pause();
            this.next();

          }, this);
        }, 100);

      }, this);
    }, this);

    this.player.setCurrentTime(0);
    this.player.play();
  };

  TestCase.prototype.loop = function(){
    console.log('Testing getLoop/setLoop');

    if (!this.player.supports('method', ['getLoop', 'setLoop'])){
      this.caution('method', 'getLoop');
      this.caution('method', 'setLoop');
      this.next();
      return false;
    }

    // If nothing works, fail them.
    this.wait(1000, 'method', ['getLoop', 'setLoop'], 'Failed to get/set loop', true);

    this.player.setLoop(true);

    this.delay(function(){
      this.player.getLoop(function(loop){
        if (loop === true){
          this.success('method', 'getLoop');
          this.success('method', 'setLoop');
          this.player.setLoop(false);
          this.next();
        } else {
          this.fail('method', 'getLoop', 'Failed to get loop');
          this.fail('method', 'setLoop', 'Failed to set loop');
        }
      }, this);
    }, 200);
  };

  TestCase.prototype.volume = function(){
    console.log('Testing getVolume/setVolume');

    if (!this.player.supports('method', ['getVolume', 'setVolume'])){
      this.caution('method', 'getVolume');
      this.caution('method', 'setVolume');
      this.next();
      return false;
    }

    // If nothing works, fail them.
    this.wait(1000, 'method', ['getVolume', 'setVolume'], 'Failed to get/set volume', true);

    this.player.setVolume(20);

    this.delay(function(){
      this.player.getVolume(function(volume){
        if (volume === 20){
          this.success('method', 'getVolume');
          this.success('method', 'setVolume');
          this.next();
        } else {
          this.fail('method', 'getVolume', 'Failed to get loop');
          this.fail('method', 'setVolume', 'Failed to set loop');
        }
      }, this);
    }, 200);
  };

  TestCase.prototype.mute = function(){
    console.log('Testing mute/unmute/getMuted');

    if (!this.player.supports('method', ['mute', 'unmute', 'getMuted'])){
      this.caution('method', 'mute');
      this.caution('method', 'unmute');
      this.caution('method', 'getMuted');
      this.next();
      return false;
    }

    // If nothing works, fail them.
    this.wait(1000, 'method', ['mute', 'unmute', 'getMuted'], 'Failed to mute/unmute/getMuted', true);

    this.player.mute();

    this.delay(function(){
      this.player.getMuted(function(muted){
        if (muted){
          this.player.unmute();
          this.delay(function(){
            this.player.getMuted(function(muted){
              this.success('method', 'mute');
              this.success('method', 'unmute');
              this.success('method', 'getMuted');
              this.next();
            }, this);
          });

        } else {
          this.fail('method', 'mute', 'Failed to get loop');
        }
      }, this);
    }, 200);
  };

  $('#form a').on('click', function(){
    var options = {
      url: $('#url').val(),
      autoplay: $('#autoplay:checked').length > 0 ? 'true' : 'false',
      audio: $('#audio:checked').length > 0 ? 'true' : 'false',
      timeout: $('#timeout').val()
    };
    window.location.search = '?' + $.param(options);
    // $('#form').submit();
    // loadPlayer(options.url, !!options.autoplay, !!options.muted);

    return false;
  });

  if (window.location.search) {
    /** @type {{url?: string, audio?: string | boolean, autoplay?: string | boolean, timeout?: string | number, test?: string | boolean}} */
    var params = window.location.search.substr(1).split('&').reduce(function(i, v){
      var p=v.split('=');
      i[p[0]] = decodeURIComponent(p[1]);
      return i;
    }, {});

    if (params.audio) {
      var boolValue = !/false|off|no/i.test(params.audio);
      params.audio = boolValue;
    } else {
      params.audio = DEFAULT_OPTIONS.testAudio;
    }

    $('#audio').prop('checked', params.audio);

    if (params.autoplay) {
      var boolValue = !/false|off|no/i.test(params.autoplay);
      params.autoplay = boolValue;
    } else {
      params.autoplay = DEFAULT_OPTIONS.autoPlay;
    }

    $('#autoplay').prop('checked', params.autoplay);

    if (!params.autoplay) {
      $('#play-button').show();
    }

    if (params.timeout && !isNaN(params.timeout)) {
      var val = parseFloat(params.timeout);
      params.timeout = val;
    } else {
      params.timeout = DEFAULT_OPTIONS.timeoutSeconds;
    }

    $('#timeout').val(params.timeout);

    if (params.url) {
      $('#url').val(params.url);

      loadPlayer(params.url, {
        autoPlay: params.autoplay,
        testAudio: params.audio,
        test: params.test,
        timeoutSeconds: params.timeout
      });
    }
  }

  function loadPlayer(iframeUrl, options) {
    if (!options) { options = {}; }

    var test = options.test;

    // add the iframe.
    $('#iframe').html('<iframe width="600" height="400" src="' + iframeUrl + '" frameborder="0" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>');

    var player = new playerjs.Player($('iframe')[0]);
    var testCase = new TestCase(player, options);

    // for testing purposes.
    window.player = player;
    window.testCase = testCase;

    if (test){
      testCase.tests = [test];
    }

    testCase.test();
  }

})(jQuery, document, window);
