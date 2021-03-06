/*
 * CDDL HEADER START
 *
 * The contents of this file are subject to the terms of the
 * Common Development and Distribution License, Version 1.0 only
 * (the "License").  You may not use this file except in compliance
 * with the License.
 *
 * You can obtain a copy of the license at http://smartos.org/CDDL
 *
 * See the License for the specific language governing permissions
 * and limitations under the License.
 *
 * When distributing Covered Code, include this CDDL HEADER in each
 * file.
 *
 * If applicable, add the following below this CDDL HEADER, with the
 * fields enclosed by brackets "[]" replaced with your own identifying
 * information: Portions Copyright [yyyy] [name of copyright owner]
 *
 * CDDL HEADER END
 *
 * Copyright 2017 Joyent, Inc.
 *
 */

/*
 * hrtime.js provides helper functions to more easily work with hrtimes.
 *
 * It was originally created with the intent to provide the simplicity of using
 * Date.now(), but with the guarantees offered by a monotonic clock.
 *
 */

var util = require('util');

var assert = require('assert-plus');

module.exports.prettyHrtime = prettyHrtime;
module.exports.hrtimeDelta = hrtimeDelta;
module.exports.hrtimeDeltaPretty = hrtimeDeltaPretty;
module.exports.hrtimeComparator = hrtimeComparator;
module.exports.hrtimeToString = hrtimeToString;
module.exports.stringToHrtime = stringToHrtime;
module.exports.assertHrtime = assertHrtime;

/*
 * Convert an hrtime delta to a relative representation - returns strings like
 * "300.0s (5m)" (5 minutes), "0.523s (523ms)" (523 milliseconds), etc.
 *
 * Example:
 *
 * var then = process.hrtime();
 *
 * setTimeout(function () {
 *     var now = process.hrtime();
 *     var delta;
 *     var s;
 *
 *     // use hrtimeDelta to calculate the delta
 *     delta = hrtimeDelta(now, then);
 *     s = prettyHrtime(delta);
 *     // => "5.0s (5s)"
 *
 *     // pass the first time to the process.hrtime function to calculate the
 *     // delta
 *     delta = process.hrtime(then);
 *     s = prettyHrtime(delta);
 *     // => "5.0s (5s)"
 * }, 5 * 1000);
 *
 */
function prettyHrtime(delta) {
    var times;
    var names;
    var relative = '0ns';

    assertHrtime(delta, 'delta');

    times = [
        delta[0] / 60 / 60 / 24, // days
        delta[0] / 60 / 60,      // hours
        delta[0] / 60,           // minutes
        delta[0],                // seconds
        delta[1] / 1e3 / 1e3,    // ms
        delta[1] / 1e3,          // us
        delta[1]                 // ns
    ];
    names = ['d', 'h', 'm', 's', 'ms', 'us', 'ns'];

    /*
     * All of the numbers in the `times` array will have (at least potentially)
     * decimal numbers with 2 exceptions:
     *
     * 1. seconds: The smallest unit of the first hrtime array spot.
     * 2. nanoseconds: The smallest unit of the second hrtime array spot.
     *
     * Since nanoseconds is the smallest unit available, there is no way for it
     * to have decimal numbers.  However with seconds, we can manually add
     * milliseconds as a decimal number.  This data will then get used below
     * when rounding the final value to 2 decimal places when formatting.
     *
     * For example, given an hrtime like [5, 123456789], the final result (in
     * the line below) will be `5.123`.
     */
    times[3] += (times[4] / 1e3);

    for (var i = 0; i < names.length; i++) {
        var t = times[i];
        if (Math.floor(t) > 0) {
            /*
             * `toFixed(2)` is used to ensure that the number seen has a
             * maximum of 2 decimal places.  The result is then run through
             * `parseFloat()` to remove any insignifacnt zeroes.  For example:
             *
             * Numbers with decimal places get reduced to 2 decimals only.
             * > a = 5.456
             * 5.456
             * > a.toFixed(2)
             * '5.46'
             * > parseFloat(a.toFixed(2))
             * 5.46
             *
             * Numbers without decimals will have the decimal point removed
             * completely.
             * > a = 5
             * 5
             * > a.toFixed(2)
             * '5.00'
             * > parseFloat(a.toFixed(2))
             * 5
             */
            relative = parseFloat(t.toFixed(2), 10) + names[i];
            break;
        }
    }

    return util.format('%ss (%s)', hrtimeToString(delta), relative);
}

/*
 * Calculate the difference of 2 hrtimes (subtracts hr2 from hr1)
 * and returns an array of seconds and nano seconds.
 *
 * hr1 must be larger than hr2
 */
function hrtimeDelta(hr1, hr2) {
    assertHrtime(hr1, 'hr1');
    assertHrtime(hr2, 'hr2');

    var s = hr1[0] - hr2[0];
    var ns = hr1[1] - hr2[1];
    var ret;

    if (ns < 0) {
        ns += 1e9;
        s -= 1;
    }

    ret = [s, ns];

    assertHrtime(ret, 'ret');

    return ret;
}

/*
 * Convenience wrapper for:
 *
 * prettyHrtime(hrtimeDelta(now, then));
 */
function hrtimeDeltaPretty(hr1, hr2) {
    assertHrtime(hr1, 'hr1');
    assertHrtime(hr2, 'hr2');
    return prettyHrtime(hrtimeDelta(hr1, hr2));
}


/*
 * Compare hrtime objects, cane be used directly with Array.prototype.sort
 */
function hrtimeComparator(hr1, hr2) {
    assertHrtime(hr1, 'hr1');
    assertHrtime(hr2, 'hr2');

    var s1 = hr1[0];
    var s2 = hr2[0];
    var ns1 = hr1[1];
    var ns2 = hr2[1];

    // first compare seconds
    if (s1 < s2)
        return -1;
    else if (s1 > s2)
        return 1;

    // next compare nano seconds
    if (ns1 < ns2)
        return -1;
    else if (ns1 > ns2)
        return 1;

    // hr times are the same
    return 0;
}

/*
 * Pretty print an hrtime as a string like "<secs>.<nanosecs>"
 */
function hrtimeToString(hrtime) {
    assertHrtime(hrtime, 'hrtime');

    var s = hrtime[0];
    var ns = hrtime[1].toString();

    while (ns.length < 9) {
        ns = '0' + ns;
    }

    return util.format('%d.%s', s, ns);
}

/*
 * Convert a string like "<secs>.<nanosecs>" to an hrtime array
 */
function stringToHrtime(s) {
    assert.string(s, 's');
    var hrtime = s.split('.').map(function (section) {
        return parseInt(section, 10);
    });
    assertHrtime(hrtime, 'hrtime');
    return hrtime;
}

/*
 * Assert that an object is an hrtime
 */
function assertHrtime(hrtime, s) {
    s = s || 'hrtime';
    assert.string(s, 's');
    assert.arrayOfNumber(hrtime, s);
    assert.equal(hrtime.length, 2, s);
    assert(hrtime[0] >= 0, 'secs >= 0');
    assert(hrtime[1] >= 0, 'nsecs >= 0');
    assert(hrtime[1] < 1e9, 'nsecs < 1e9');
}
