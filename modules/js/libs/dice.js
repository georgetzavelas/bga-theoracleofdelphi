"use strict";

/**
 * @brief generates polyhedral dice with spin-in-place animation
 * @author Anton Natarov aka Teal (original geometry & materials)
 * @author Sarah Rosanna Busch (refactor)
 * @description Simplified for BGA: removed physics (Cannon.js), lighting,
 *   desk plane, shadows. Die spins in place with damping, then settles
 *   onto the predetermined face. Requires Three.js only.
 */

const DICE = (function() {
    var that = {};

    var vars = {
        scale: 100,
        label_color: '#aaaaaa',
        dice_color: '#202020',
        ambient_light_color: 0xffffff,
        spin_duration: 2000,
        settle_duration: 500,
        scale_divisor: 3
    };

    var CONSTS = {
        known_types: ['d4', 'd6', 'd8', 'd9', 'd10', 'd12', 'd20', 'd100'],
        dice_face_range: { 'd4': [1, 4], 'd6': [1, 6], 'd8': [1, 8], 'd9': [0, 9], 'd10': [0, 9],
            'd12': [1, 12], 'd20': [1, 20], 'd100': [0, 9] },

        standart_d20_dice_face_labels: [' ', '0', '1', '2', '3', '4', '5', '6', '7', '8',
                '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
        standart_d100_dice_face_labels: [' ', '00', '10', '20', '30', '40', '50',
                '60', '70', '80', '90'],

        d4_labels: [
            [[], [0, 0, 0], [2, 4, 3], [1, 3, 4], [2, 1, 4], [1, 2, 3]],
            [[], [0, 0, 0], [2, 3, 4], [3, 1, 4], [2, 4, 1], [3, 2, 1]],
            [[], [0, 0, 0], [4, 3, 2], [3, 4, 1], [4, 2, 1], [3, 1, 2]],
            [[], [0, 0, 0], [4, 2, 3], [1, 4, 3], [4, 1, 2], [1, 3, 2]]
        ]
    };

    /**
     * Configure dice options. Call before creating a dice_box.
     */
    that.configure = function(options) {
        if (options) {
            for (var key in options) {
                if (options.hasOwnProperty(key) && vars.hasOwnProperty(key)) {
                    vars[key] = options[key];
                }
            }
        }
    };

    // DICE BOX OBJECT

    that.dice_box = function(container) {
        this.dices = [];
        this.scene = new THREE.Scene();
        this.container = container;
        this.rolling = false;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        container.appendChild(this.renderer.domElement);
        this.renderer.setClearColor(0xffffff, 0);

        this.reinit(container);

        this.scene.add(new THREE.AmbientLight(vars.ambient_light_color));
        this.renderer.render(this.scene, this.camera);
    };

    that.dice_box.prototype.reinit = function(container) {
        this.cw = container.clientWidth / 2;
        this.ch = container.clientHeight / 2;
        this.w = this.cw;
        this.h = this.ch;
        this.aspect = Math.min(this.cw / this.w, this.ch / this.h);
        vars.scale = Math.sqrt(this.w * this.w + this.h * this.h) / vars.scale_divisor;

        this.renderer.setSize(this.cw * 2, this.ch * 2);

        this.wh = this.ch / this.aspect / Math.tan(10 * Math.PI / 180);
        if (this.camera) this.scene.remove(this.camera);
        this.camera = new THREE.PerspectiveCamera(20, this.cw / this.ch, 1, this.wh * 1.3);
        this.camera.position.z = this.wh;

        this.renderer.render(this.scene, this.camera);
    };

    that.dice_box.prototype.setDice = function(diceToRoll) {
        this.diceToRoll = diceToRoll;
    };

    /**
     * Spin the die in place with damping, then settle onto the predetermined face.
     * @param {Function} before_roll - Called with notation; return [value] for predetermined result
     * @param {Function} after_roll - Called with notation when animation completes
     */
    that.dice_box.prototype.start_throw = function(before_roll, after_roll) {
        var box = this;
        if (box.rolling) return;

        var notation = that.parse_notation(box.diceToRoll);
        if (notation.set.length === 0) return;
        box.rolling = true;

        // Get predetermined results
        var request_results = null;
        if (before_roll) {
            request_results = before_roll(notation);
        }

        box.clear();

        // Create die meshes at origin
        for (var i = 0; i < notation.set.length; i++) {
            var type = notation.set[i];
            var dice = threeD_dice['create_' + type]();
            dice.dice_type = type;
            dice.position.set(0, 0, 0);
            box.scene.add(dice);
            box.dices.push(dice);
        }

        // For each die: pick target quaternion, shift faces for predetermined result
        var targetQuats = [];
        for (var i = 0; i < box.dices.length; i++) {
            // Target orientation: d9/d10 get tip-up pose, others random
            var tq;
            var dtype = box.dices[i].dice_type;
            if (dtype === 'd9' || dtype === 'd10') {
                tq = compute_face_up_quaternion(box.dices[i]);
            } else {
                tq = new THREE.Quaternion();
                tq.setFromEuler(new THREE.Euler(
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2,
                    Math.random() * Math.PI * 2
                ));
            }
            targetQuats.push(tq);

            // Determine what value would naturally show at this orientation
            box.dices[i].quaternion.copy(tq);
            var naturalValue = get_dice_value(box.dices[i]);

            // Shift faces so desired value shows instead
            if (request_results && request_results[i] !== undefined) {
                shift_dice_faces(box.dices[i], request_results[i], naturalValue);
            }

            // Set random starting orientation
            box.dices[i].quaternion.setFromEuler(new THREE.Euler(
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2
            ));
        }

        // Random angular velocities per die (radians per frame on each axis)
        var angularVels = box.dices.map(function() {
            return {
                x: (Math.random() * 0.4 + 0.3), // * (Math.random() < 0.5 ? 1 : -1),
                y: (Math.random() * 0.4 + 0.3), // * (Math.random() < 0.5 ? 1 : -1),
                z: (Math.random() * 0.4 + 0.3) //  * (Math.random() < 0.5 ? 1 : -1)
            };
        });

        var spinDuration = vars.spin_duration;
        var settleDuration = vars.settle_duration;
        var startTime = Date.now();
        var settleStartQuats = null;

        function animate() {
            var elapsed = Date.now() - startTime;

            if (elapsed < spinDuration) {
                // Phase 1: tumble with quadratic damping
                var t = elapsed / spinDuration;
                var dampFactor = (1 - t) * (1 - t);

                for (var i = 0; i < box.dices.length; i++) {
                    var av = angularVels[i];
                    var dq = new THREE.Quaternion();
                    dq.setFromEuler(new THREE.Euler(
                        av.x * dampFactor,
                        av.y * dampFactor,
                        av.z * dampFactor
                    ));
                    box.dices[i].quaternion.multiply(dq);
                    box.dices[i].quaternion.normalize();
                }
            } else if (elapsed < spinDuration + settleDuration) {
                // Phase 2: slerp to target with smoothstep easing
                var t = (elapsed - spinDuration) / settleDuration;
                t = t * t * (3 - 2 * t);

                if (!settleStartQuats) {
                    settleStartQuats = box.dices.map(function(d) {
                        return d.quaternion.clone();
                    });
                }

                for (var i = 0; i < box.dices.length; i++) {
                    box.dices[i].quaternion.copy(settleStartQuats[i]);
                    box.dices[i].quaternion.slerp(targetQuats[i], t);
                }
            } else {
                // Done — snap to target
                for (var i = 0; i < box.dices.length; i++) {
                    box.dices[i].quaternion.copy(targetQuats[i]);
                }
                box.renderer.render(box.scene, box.camera);

                var results = get_dice_values(box.dices);
                notation.result = results;
                notation.resultTotal = results.reduce(function(s, a) { return s + a; }, 0) + notation.constant;
                notation.resultString = results.join(' ');

                box.rolling = false;
                if (after_roll) after_roll(notation);
                return;
            }

            box.renderer.render(box.scene, box.camera);
            requestAnimationFrame(animate);
        }

        requestAnimationFrame(animate);
    };

    that.dice_box.prototype.clear = function() {
        this.rolling = false;
        var dice;
        while (dice = this.dices.pop()) {
            this.scene.remove(dice);
        }
        this.renderer.render(this.scene, this.camera);
    };


    // PUBLIC FUNCTIONS

    that.parse_notation = function(notation) {
        var no = notation.split('@');
        var dr0 = /\s*(\d*)([a-z]+)(\d+)(\s*(\+|\-)\s*(\d+)){0,1}\s*(\+|$)/gi;
        var dr1 = /(\b)*(\d+)(\b)*/gi;
        var ret = {
            set: [],
            constant: 0,
            result: [],
            resultTotal: 0,
            resultString: '',
            error: false
        };
        var res;
        while (res = dr0.exec(no[0])) {
            var command = res[2];
            if (command != 'd') { ret.error = true; continue; }
            var count = parseInt(res[1]);
            if (res[1] == '') count = 1;
            var type = 'd' + res[3];
            if (CONSTS.known_types.indexOf(type) == -1) { ret.error = true; continue; }
            while (count--) ret.set.push(type);
            if (res[5] && res[6]) {
                if (res[5] == '+') ret.constant += parseInt(res[6]);
                else ret.constant -= parseInt(res[6]);
            }
        }
        while (res = dr1.exec(no[1])) {
            ret.result.push(parseInt(res[2]));
        }
        return ret;
    };

    that.stringify_notation = function(nn) {
        var dict = {}, notation = '';
        for (var i in nn.set)
            if (!dict[nn.set[i]]) dict[nn.set[i]] = 1; else ++dict[nn.set[i]];
        for (var i in dict) {
            if (notation.length) notation += ' + ';
            notation += (dict[i] > 1 ? dict[i] : '') + i;
        }
        if (nn.constant) {
            if (nn.constant > 0) notation += ' + ' + nn.constant;
            else notation += ' - ' + Math.abs(nn.constant);
        }
        return notation;
    };


    // PRIVATE FUNCTIONS — dice geometries

    var threeD_dice = {};

    threeD_dice.create_d4 = function() {
        if (!this.d4_geometry) this.d4_geometry = create_d4_geometry(vars.scale * 1.2);
        if (!this.d4_material) this.d4_material = new THREE.MeshFaceMaterial(
                create_d4_materials(vars.scale / 2, vars.scale * 2, CONSTS.d4_labels[0]));
        return new THREE.Mesh(this.d4_geometry, this.d4_material);
    };

    threeD_dice.create_d6 = function() {
        if (!this.d6_geometry) this.d6_geometry = create_d6_geometry(vars.scale * 1.1);
        if (!this.dice_material) this.dice_material = new THREE.MeshFaceMaterial(
                create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 0.9));
        return new THREE.Mesh(this.d6_geometry, this.dice_material);
    };

    threeD_dice.create_d8 = function() {
        if (!this.d8_geometry) this.d8_geometry = create_d8_geometry(vars.scale);
        if (!this.dice_material) this.dice_material = new THREE.MeshFaceMaterial(
                create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.4));
        return new THREE.Mesh(this.d8_geometry, this.dice_material);
    };

    threeD_dice.create_d9 = function() {
        if (!this.d10_geometry) this.d10_geometry = create_d10_geometry(vars.scale * 0.9);
        if (!this.dice_material) this.dice_material = new THREE.MeshFaceMaterial(
                create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.0));
        return new THREE.Mesh(this.d10_geometry, this.dice_material);
    };

    threeD_dice.create_d10 = function() {
        if (!this.d10_geometry) this.d10_geometry = create_d10_geometry(vars.scale * 0.9);
        if (!this.dice_material) this.dice_material = new THREE.MeshFaceMaterial(
                create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.0));
        return new THREE.Mesh(this.d10_geometry, this.dice_material);
    };

    threeD_dice.create_d12 = function() {
        if (!this.d12_geometry) this.d12_geometry = create_d12_geometry(vars.scale * 0.9);
        if (!this.dice_material) this.dice_material = new THREE.MeshFaceMaterial(
                create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.0));
        return new THREE.Mesh(this.d12_geometry, this.dice_material);
    };

    threeD_dice.create_d20 = function() {
        if (!this.d20_geometry) this.d20_geometry = create_d20_geometry(vars.scale);
        if (!this.dice_material) this.dice_material = new THREE.MeshFaceMaterial(
                create_dice_materials(CONSTS.standart_d20_dice_face_labels, vars.scale / 2, 1.2));
        return new THREE.Mesh(this.d20_geometry, this.dice_material);
    };

    threeD_dice.create_d100 = function() {
        if (!this.d10_geometry) this.d10_geometry = create_d10_geometry(vars.scale * 0.9);
        if (!this.d100_material) this.d100_material = new THREE.MeshFaceMaterial(
                create_dice_materials(CONSTS.standart_d100_dice_face_labels, vars.scale / 2, 1.5));
        return new THREE.Mesh(this.d10_geometry, this.d100_material);
    };


    // MATERIALS — flat shading with MeshBasicMaterial (no lighting needed)

    function create_dice_materials(face_labels, size, margin) {
        function create_text_texture(text, color, back_color) {
            if (text == undefined) return null;
            var canvas = document.createElement("canvas");
            var context = canvas.getContext("2d");
            var ts = calc_texture_size(size + size * 2 * margin) * 2;
            canvas.width = canvas.height = ts;
            context.font = ts / (1 + 2 * margin) + "pt Arial";
            context.fillStyle = back_color;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = color;
            context.fillText(text, canvas.width / 2, canvas.height / 2);
            if (text == '6' || text == '9') {
                context.fillText('  .', canvas.width / 2, canvas.height / 2);
            }
            var texture = new THREE.Texture(canvas);
            texture.needsUpdate = true;
            return texture;
        }
        var materials = [];
        for (var i = 0; i < face_labels.length; ++i)
            materials.push(new THREE.MeshBasicMaterial({
                map: create_text_texture(face_labels[i], vars.label_color, vars.dice_color)
            }));
        return materials;
    }

    function create_d4_materials(size, margin, labels) {
        function create_d4_text(text, color, back_color) {
            var canvas = document.createElement("canvas");
            var context = canvas.getContext("2d");
            var ts = calc_texture_size(size + margin) * 2;
            canvas.width = canvas.height = ts;
            context.font = (ts - margin) * 0.5 + "pt Arial";
            context.fillStyle = back_color;
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillStyle = color;
            for (var i in text) {
                context.fillText(text[i], canvas.width / 2,
                        canvas.height / 2 - ts * 0.3);
                context.translate(canvas.width / 2, canvas.height / 2);
                context.rotate(Math.PI * 2 / 3);
                context.translate(-canvas.width / 2, -canvas.height / 2);
            }
            var texture = new THREE.Texture(canvas);
            texture.needsUpdate = true;
            return texture;
        }
        var materials = [];
        for (var i = 0; i < labels.length; ++i)
            materials.push(new THREE.MeshBasicMaterial({
                map: create_d4_text(labels[i], vars.label_color, vars.dice_color)
            }));
        return materials;
    }


    // GEOMETRY CREATION

    function create_d4_geometry(radius) {
        var vertices = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
        var faces = [[1, 0, 2, 1], [0, 1, 3, 2], [0, 3, 2, 3], [1, 2, 3, 4]];
        return create_geom(vertices, faces, radius, -0.1, Math.PI * 7 / 6, 0.96);
    }

    function create_d6_geometry(radius) {
        var vertices = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
                [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
        var faces = [[0, 3, 2, 1, 1], [1, 2, 6, 5, 2], [0, 1, 5, 4, 3],
                [3, 7, 6, 2, 4], [0, 4, 7, 3, 5], [4, 5, 6, 7, 6]];
        return create_geom(vertices, faces, radius, 0.1, Math.PI / 4, 0.96);
    }

    function create_d8_geometry(radius) {
        var vertices = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
        var faces = [[0, 2, 4, 1], [0, 4, 3, 2], [0, 3, 5, 3], [0, 5, 2, 4], [1, 3, 4, 5],
                [1, 4, 2, 6], [1, 2, 5, 7], [1, 5, 3, 8]];
        return create_geom(vertices, faces, radius, 0, -Math.PI / 4 / 2, 0.965);
    }

    function create_d10_geometry(radius) {
        var a = Math.PI * 2 / 10, k = Math.cos(a), h = 0.105, v = -1;
        var vertices = [];
        for (var i = 0, b = 0; i < 10; ++i, b += a)
            vertices.push([Math.cos(b), Math.sin(b), h * (i % 2 ? 1 : -1)]);
        vertices.push([0, 0, -1]); vertices.push([0, 0, 1]);
        var faces = [[5, 7, 11, 0], [4, 2, 10, 1], [1, 3, 11, 2], [0, 8, 10, 3], [7, 9, 11, 4],
                [8, 6, 10, 5], [9, 1, 11, 6], [2, 0, 10, 7], [3, 5, 11, 8], [6, 4, 10, 9],
                [1, 0, 2, v], [1, 2, 3, v], [3, 2, 4, v], [3, 4, 5, v], [5, 4, 6, v],
                [5, 6, 7, v], [7, 6, 8, v], [7, 8, 9, v], [9, 8, 0, v], [9, 0, 1, v]];
        return create_geom(vertices, faces, radius, 0, Math.PI * 6 / 5, 0.945);
    }

    function create_d12_geometry(radius) {
        var p = (1 + Math.sqrt(5)) / 2, q = 1 / p;
        var vertices = [[0, q, p], [0, q, -p], [0, -q, p], [0, -q, -p], [p, 0, q],
                [p, 0, -q], [-p, 0, q], [-p, 0, -q], [q, p, 0], [q, -p, 0], [-q, p, 0],
                [-q, -p, 0], [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1],
                [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]];
        var faces = [[2, 14, 4, 12, 0, 1], [15, 9, 11, 19, 3, 2], [16, 10, 17, 7, 6, 3], [6, 7, 19, 11, 18, 4],
                [6, 18, 2, 0, 16, 5], [18, 11, 9, 14, 2, 6], [1, 17, 10, 8, 13, 7], [1, 13, 5, 15, 3, 8],
                [13, 8, 12, 4, 5, 9], [5, 4, 14, 9, 15, 10], [0, 12, 8, 10, 16, 11], [3, 19, 7, 17, 1, 12]];
        return create_geom(vertices, faces, radius, 0.2, -Math.PI / 4 / 2, 0.968);
    }

    function create_d20_geometry(radius) {
        var t = (1 + Math.sqrt(5)) / 2;
        var vertices = [[-1, t, 0], [1, t, 0 ], [-1, -t, 0], [1, -t, 0],
                [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
                [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
        var faces = [[0, 11, 5, 1], [0, 5, 1, 2], [0, 1, 7, 3], [0, 7, 10, 4], [0, 10, 11, 5],
                [1, 5, 9, 6], [5, 11, 4, 7], [11, 10, 2, 8], [10, 7, 6, 9], [7, 1, 8, 10],
                [3, 9, 4, 11], [3, 4, 2, 12], [3, 2, 6, 13], [3, 6, 8, 14], [3, 8, 9, 15],
                [4, 9, 5, 16], [2, 4, 11, 17], [6, 2, 10, 18], [8, 6, 7, 19], [9, 8, 1, 20]];
        return create_geom(vertices, faces, radius, -0.2, -Math.PI / 4 / 2, 0.955);
    }


    // GEOMETRY HELPERS

    function calc_texture_size(approx) {
        return Math.pow(2, Math.floor(Math.log(approx) / Math.log(2)));
    }

    function make_geom(vertices, faces, radius, tab, af) {
        var geom = new THREE.Geometry();
        for (var i = 0; i < vertices.length; ++i) {
            var vertex = vertices[i].multiplyScalar(radius);
            vertex.index = geom.vertices.push(vertex) - 1;
        }
        for (var i = 0; i < faces.length; ++i) {
            var ii = faces[i], fl = ii.length - 1;
            var aa = Math.PI * 2 / fl;
            for (var j = 0; j < fl - 2; ++j) {
                geom.faces.push(new THREE.Face3(ii[0], ii[j + 1], ii[j + 2], [geom.vertices[ii[0]],
                            geom.vertices[ii[j + 1]], geom.vertices[ii[j + 2]]], 0, ii[fl] + 1));
                geom.faceVertexUvs[0].push([
                        new THREE.Vector2((Math.cos(af) + 1 + tab) / 2 / (1 + tab),
                            (Math.sin(af) + 1 + tab) / 2 / (1 + tab)),
                        new THREE.Vector2((Math.cos(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab),
                            (Math.sin(aa * (j + 1) + af) + 1 + tab) / 2 / (1 + tab)),
                        new THREE.Vector2((Math.cos(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab),
                            (Math.sin(aa * (j + 2) + af) + 1 + tab) / 2 / (1 + tab))]);
            }
        }
        geom.computeFaceNormals();
        geom.boundingSphere = new THREE.Sphere(new THREE.Vector3(), radius);
        return geom;
    }

    function chamfer_geom(vectors, faces, chamfer) {
        var chamfer_vectors = [], chamfer_faces = [], corner_faces = new Array(vectors.length);
        for (var i = 0; i < vectors.length; ++i) corner_faces[i] = [];
        for (var i = 0; i < faces.length; ++i) {
            var ii = faces[i], fl = ii.length - 1;
            var center_point = new THREE.Vector3();
            var face = new Array(fl);
            for (var j = 0; j < fl; ++j) {
                var vv = vectors[ii[j]].clone();
                center_point.add(vv);
                corner_faces[ii[j]].push(face[j] = chamfer_vectors.push(vv) - 1);
            }
            center_point.divideScalar(fl);
            for (var j = 0; j < fl; ++j) {
                var vv = chamfer_vectors[face[j]];
                vv.subVectors(vv, center_point).multiplyScalar(chamfer).addVectors(vv, center_point);
            }
            face.push(ii[fl]);
            chamfer_faces.push(face);
        }
        for (var i = 0; i < faces.length - 1; ++i) {
            for (var j = i + 1; j < faces.length; ++j) {
                var pairs = [], lastm = -1;
                for (var m = 0; m < faces[i].length - 1; ++m) {
                    var n = faces[j].indexOf(faces[i][m]);
                    if (n >= 0 && n < faces[j].length - 1) {
                        if (lastm >= 0 && m != lastm + 1) pairs.unshift([i, m], [j, n]);
                        else pairs.push([i, m], [j, n]);
                        lastm = m;
                    }
                }
                if (pairs.length != 4) continue;
                chamfer_faces.push([chamfer_faces[pairs[0][0]][pairs[0][1]],
                        chamfer_faces[pairs[1][0]][pairs[1][1]],
                        chamfer_faces[pairs[3][0]][pairs[3][1]],
                        chamfer_faces[pairs[2][0]][pairs[2][1]], -1]);
            }
        }
        for (var i = 0; i < corner_faces.length; ++i) {
            var cf = corner_faces[i], face = [cf[0]], count = cf.length - 1;
            while (count) {
                for (var m = faces.length; m < chamfer_faces.length; ++m) {
                    var index = chamfer_faces[m].indexOf(face[face.length - 1]);
                    if (index >= 0 && index < 4) {
                        if (--index == -1) index = 3;
                        var next_vertex = chamfer_faces[m][index];
                        if (cf.indexOf(next_vertex) >= 0) {
                            face.push(next_vertex);
                            break;
                        }
                    }
                }
                --count;
            }
            face.push(-1);
            chamfer_faces.push(face);
        }
        return { vectors: chamfer_vectors, faces: chamfer_faces };
    }

    function create_geom(vertices, faces, radius, tab, af, chamfer) {
        var vectors = new Array(vertices.length);
        for (var i = 0; i < vertices.length; ++i) {
            vectors[i] = (new THREE.Vector3).fromArray(vertices[i]).normalize();
        }
        var cg = chamfer_geom(vectors, faces, chamfer);
        var geom = make_geom(cg.vectors, cg.faces, radius, tab, af);
        return geom;
    }


    // VALUE DETECTION & FACE SHIFTING

    /**
     * Compute a target quaternion that places a numbered face flat toward the
     * camera (+z) with the number text upright (+v in UV space → +y on screen).
     */
    function compute_face_up_quaternion(dice) {
        var geom = dice.geometry;

        // Collect all distinct numbered materialIndex values and their face indices
        var matIndices = [];
        var matFaceIndex = {};
        for (var i = 0; i < geom.faces.length; i++) {
            var mi = geom.faces[i].materialIndex;
            if (mi > 0 && matIndices.indexOf(mi) === -1) {
                matIndices.push(mi);
                matFaceIndex[mi] = i;
            }
        }
        if (matIndices.length === 0) {
            var q = new THREE.Quaternion();
            q.setFromEuler(new THREE.Euler(Math.random() * Math.PI * 2,
                Math.random() * Math.PI * 2, Math.random() * Math.PI * 2));
            return q;
        }

        // Pick a random numbered face for visual variety between rolls
        var chosenMat = matIndices[Math.floor(Math.random() * matIndices.length)];
        var faceIdx = matFaceIndex[chosenMat];
        var targetFace = geom.faces[faceIdx];

        // Face normal in object space
        var faceNormal = targetFace.normal.clone().normalize();

        // Get the three vertices and UVs of this face
        var va = geom.vertices[targetFace.a];
        var vb = geom.vertices[targetFace.b];
        var vc = geom.vertices[targetFace.c];
        var uvs = geom.faceVertexUvs[0][faceIdx];

        // Compute bitangent: 3D direction corresponding to +v in UV space
        // (canvas y goes down, UV v goes up, so +v = top of the number text)
        var e1 = vb.clone().sub(va);
        var e2 = vc.clone().sub(va);
        var duv1x = uvs[1].x - uvs[0].x, duv1y = uvs[1].y - uvs[0].y;
        var duv2x = uvs[2].x - uvs[0].x, duv2y = uvs[2].y - uvs[0].y;
        var det = duv1x * duv2y - duv2x * duv1y;

        var textUp;
        if (Math.abs(det) > 1e-10) {
            var invDet = 1.0 / det;
            textUp = new THREE.Vector3(
                (-duv2x * e1.x + duv1x * e2.x) * invDet,
                (-duv2x * e1.y + duv1x * e2.y) * invDet,
                (-duv2x * e1.z + duv1x * e2.z) * invDet
            ).normalize();
        } else {
            // Fallback: use pole vertex direction
            var verts = [va, vb, vc];
            var pole = verts[0];
            for (var j = 1; j < verts.length; j++) {
                if (Math.abs(verts[j].z) > Math.abs(pole.z)) pole = verts[j];
            }
            var cx = (va.x + vb.x + vc.x) / 3;
            var cy = (va.y + vb.y + vc.y) / 3;
            var cz = (va.z + vb.z + vc.z) / 3;
            textUp = new THREE.Vector3(pole.x - cx, pole.y - cy, pole.z - cz).normalize();
        }

        // Step 1: rotation R1 that takes faceNormal → +z (toward camera)
        var r1 = new THREE.Quaternion();
        r1.setFromUnitVectors(faceNormal, new THREE.Vector3(0, 0, 1));

        // Step 2: rotate textUp by R1, then find angle around z to align with +y (screen up)
        var rotatedUp = textUp.clone().applyQuaternion(r1);
        var angle = Math.atan2(rotatedUp.x, rotatedUp.y);
        var r2 = new THREE.Quaternion();
        r2.setFromAxisAngle(new THREE.Vector3(0, 0, 1), angle);

        // Combined: apply r1 first, then r2
        var result = new THREE.Quaternion();
        result.multiplyQuaternions(r2, r1);
        return result;
    }

    function get_dice_value(dice) {
        var vector = new THREE.Vector3(0, 0, dice.dice_type == 'd4' ? -1 : 1);
        var closest_face, closest_angle = Math.PI * 2;
        for (var i = 0, l = dice.geometry.faces.length; i < l; ++i) {
            var face = dice.geometry.faces[i];
            if (face.materialIndex == 0) continue;
            var angle = face.normal.clone().applyQuaternion(dice.quaternion).angleTo(vector);
            if (angle < closest_angle) {
                closest_angle = angle;
                closest_face = face;
            }
        }
        var matindex = closest_face ? closest_face.materialIndex - 1 : -1;
        if (dice.dice_type == 'd100') matindex *= 10;
        if (dice.dice_type == 'd10' && matindex == 0) matindex = 10;
        return matindex;
    }

    function get_dice_values(dices) {
        var values = [];
        for (var i = 0, l = dices.length; i < l; ++i) {
            values.push(get_dice_value(dices[i]));
        }
        return values;
    }

    function shift_dice_faces(dice, value, res) {
        var r = CONSTS.dice_face_range[dice.dice_type];
        if (dice.dice_type == 'd10' && value == 10) value = 0;
        if (!(value >= r[0] && value <= r[1])) return;
        var num = value - res;
        var range = r[1] - r[0] + 1;
        var geom = dice.geometry.clone();
        for (var i = 0, l = geom.faces.length; i < l; ++i) {
            var matindex = geom.faces[i].materialIndex;
            if (matindex == 0) continue;
            matindex += num - 1;
            while (matindex > r[1]) matindex -= range;
            while (matindex < r[0]) matindex += range;
            geom.faces[i].materialIndex = matindex + 1;
        }
        if (dice.dice_type == 'd4' && num != 0) {
            if (num < 0) num += 4;
            dice.material = new THREE.MeshFaceMaterial(
                    create_d4_materials(vars.scale / 2, vars.scale * 2, CONSTS.d4_labels[num]));
        }
        dice.geometry = geom;
    }

    return that;
}());
