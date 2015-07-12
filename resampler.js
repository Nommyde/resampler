/*! resampler.js v0.1 | (c) 2015 Rustam Bakeev (Nommyde) | MIT License */

(function (root, factory) {
    if (typeof define == 'function' && define.amd)
        define(factory);
    else
        root.Resampler = factory();

})(this, function() {
    "use strict";

    function createFilter(f, radius) {
        f.radius = radius;
        return f;
    }

    function createLanczosFilter(r) {
        return createFilter(function(x) {
            if (x == 0) return 1;

            if (x < 0) x = -x;

            if (x < r) {
                x *= Math.PI;
                return r * Math.sin(x) * Math.sin(x / r) / (x * x);
            }

            return 0;
        }, r);
    }

    function createCubicFilter(a) {
        a = -a;

        return createFilter(function(x) {
            if (x < 0) x = -x;

            var xx = x * x;

            if (x < 1) return (a + 2) * xx * x - (a + 3) * xx + 1;
            if (x < 2) return a * xx * x - 5 * a * xx + 8 * a * x - 4 * a;

            return 0;
        }, 2);
    }

    var Filters = {
        lanczos3: createLanczosFilter(3),
        lanczos8: createLanczosFilter(8),
        cubic: createCubicFilter(0.5),

        hermite: createFilter(function(x) {
            if (x < 0) x = -x;

            if (x < 1) return (2 * x - 3) * x * x + 1;

            return 0;
        }, 1),

        triangle: createFilter(function(x) {
            if (x < 0) x = -x;
            if (x < 1) return 1 - x;
            return 0;
        }, 1)
    };



    function resample(nsamples_src, nsamples_dst, get, set, filter, filterScale) {
        var x, to, a;

        var ratio = (nsamples_src - 1) / (nsamples_dst - 1);

        filterScale = ratio > 1 ? ratio * (filterScale || 1) : 1;
        var r = filter.radius * filterScale;

        for (var i = 0; i < nsamples_dst; i++) {
            x = ratio * i;
            to = Math.floor(x + r);

            a = 0;

            for (var j = Math.ceil(x - r); j <= to; j++) {
                a += get(j) * filter((j - x) / filterScale);
            }

            set(i, a / filterScale);
        }
    }



    function stol(c) {
        return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
    }

    function ltos(c) {
        return c > 0.0031308 ? 1.055 * Math.pow(c, 1 / 2.4) - 0.055 : 12.92 * c;
    }

    function linearizePixels(data) {
        var result = new Array(data.length);

        for (var i = 0; i < data.length; i++) {
            result[i] = ((i + 1) % 4) ? (stol(data[i] / 255)) : data[i];
        }

        return result;
    }


    // for resizeCanvas
    var DEFAULT_FILTER_SCALE = 0.7;
    var DEFAULT_FILTER = Filters.lanczos3;
    var DEFAULT_LINEARIZE = true;
    var DEFAULT_SKIP_ALPHA = true;


    function resizeCanvas(canvas, w, h, options) {
        options = options || {};

        var filter = options.filter || DEFAULT_FILTER;
        var filterScale = options.filterScale || DEFAULT_FILTER_SCALE;
        var linearize = typeof options.linearize == 'undefined' ? DEFAULT_LINEARIZE : options.linearize;
        var skipAlpha = typeof options.skipAlpha == 'undefined' ? DEFAULT_SKIP_ALPHA : options.skipAlpha;

        var ctx = canvas.getContext("2d");
        var srcs = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
        var dstImg = ctx.createImageData(w, h);
        var dst = dstImg.data;

        var src = linearize ? linearizePixels(srcs) : srcs;

        var linear = new Array(w * canvas.height);

        if (skipAlpha) {
            var wh = w * h;
            for (var i = 0; i < wh; i++) dst[i * 4 + 3] = 255;
        }

        var nchannels = skipAlpha ? 3 : 4;

        for (var ch = 0; ch < nchannels; ch++) {
            for (i = 0; i < canvas.height; i++) {
                resample(canvas.width, w, function(row, channel) {
                    var offset = row * canvas.width;

                    return function(index) {
                        if (index < 0) index = -index % canvas.width;
                        else if (index >= canvas.width) {
                            index = (-index - 2) % canvas.width;
                            if (index < 0) index += canvas.width;
                        }

                        return src[4 * (offset + index) + channel];
                    };
                }(i, ch), function(row) {
                    return function(index, v) {
                        linear[row * w + index] = v;
                    };
                }(i), filter, filterScale);
            }

            for (i = 0; i < w; i++) {
                resample(canvas.height, h, function(column) {
                    return function(index) {
                        if (index < 0) index = -index % canvas.height;
                        else if (index >= canvas.height) {
                            index = (-index - 2) % canvas.height;
                            if (index < 0) index += canvas.height;
                        }

                        return linear[index * w + column];
                    };
                }(i), function(column, channel) {
                    return function(index, v) {
                        dst[4 * (index * w + column) + channel] = linearize && channel < 3 ? 255 * ltos(v) : v;
                    };
                }(i, ch), filter, filterScale);
            }
        }

        canvas.width = w;
        canvas.height = h;
        ctx.putImageData(dstImg, 0, 0);
    }

    return {
        createFilter: createFilter,
        createLanczosFilter: createLanczosFilter,
        createCubicFilter: createCubicFilter,
        Filters: Filters,
        resample: resample,
        linear2srgb: ltos,
        srgb2linear: stol,
        resizeCanvas: resizeCanvas
    };
});
