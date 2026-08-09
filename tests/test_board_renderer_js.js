/**
 * Tests for BoardRenderer.js — how the board is actually drawn.
 *
 * Most of this file is DOM assembly, and a broken element shows up the moment
 * anyone opens the game. What is worth pinning is the arithmetic underneath
 * it, where a mistake is a tile drawn a few pixels out — or a tile silently
 * not drawn at all — rather than a crash.
 *
 * The centrepiece is the rotation invariant. A rotated cluster is drawn by
 * CSS-rotating its whole tile IMAGE about the anchor point, while the game
 * model rotates the cluster's AXIAL coordinates and stores the results. Those
 * are two completely different computations that have to land in the same
 * place, or the picture and the board disagree: a player clicks the hex they
 * can see and the server resolves a different one. It holds exactly — but
 * only for hex dimensions in the true pointy-top ratio, and the shipped
 * dimensions (60 x 69) are a rounded 60 x 69.282, so there is a real, small
 * drift that this measures rather than hides.
 *
 * A second thing worth having: every cluster needs an entry in both
 * CLUSTER_IMAGES and CLUSTER_IMAGE_DIMS. renderClusterImage warns and returns
 * when either is missing, so a cluster added to the definitions without an
 * image config does not error — that tile just never appears on the board.
 *
 * Run: node tests/test_board_renderer_js.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) {
    if (cond) { pass++; } else { console.log('  FAIL: ' + msg); fail++; }
}
function close(got, want, tol, msg) {
    ok(Math.abs(got - want) <= tol, msg + '  (got ' + got + ' want ~' + want + ')');
}

// --- a stand-in DOM: enough for the renderer, nothing more ------------------
function makeEl(tag) {
    return {
        tagName: tag, className: '', id: '', src: '', alt: '',
        style: {}, dataset: {}, children: [],
        appendChild(child) { this.children.push(child); return child; },
        set innerHTML(v) { if (v === '') this.children = []; },
        get innerHTML() { return ''; },
    };
}
const stubDocument = { createElement: (tag) => makeEl(tag) };

function loadModule(relPath, extraGlobals) {
    const sandbox = Object.assign({
        console: { log() {}, warn() {}, error() {} },   // the renderer warns; stay quiet
        Math, Map, Set, JSON, captured: null, spec: null,
        document: stubDocument,
    }, extraGlobals || {});
    sandbox.define = function (_deps, factory) {
        const stubDeclare = (_parent, spec) => {
            sandbox.spec = spec;
            return function (...args) {
                Object.assign(this, spec);
                if (typeof spec.constructor === 'function') spec.constructor.apply(this, args);
            };
        };
        sandbox.captured = factory({}, stubDeclare);
    };
    vm.createContext(sandbox);
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8'), sandbox);
    return { Class: sandbox.captured, spec: sandbox.spec };
}

const RendererMod = loadModule('modules/js/BoardRenderer.js');
const ClusterMod = loadModule('modules/js/ClusterDefinitions.js');
const defs = new ClusterMod.Class();
ok(typeof RendererMod.spec.render === 'function', 'BoardRenderer loaded');
ok(typeof defs.getCluster === 'function', 'ClusterDefinitions loaded');

const container = makeEl('div');
const renderer = new RendererMod.Class(container, { themeUrl: 'https://x.test/theme' });

// ============ image config completeness ======================================
// A cluster missing from either map is not an error — renderClusterImage
// warns and returns, and that tile simply never appears.
const allClusterIds = [3, 7, 9, 11]
    .flatMap(size => defs.getClustersBySize(size).map(c => c.id)).sort();
ok(allClusterIds.length === 18, 'found all 18 clusters, got ' + allClusterIds.length);

const missingImage = allClusterIds.filter(id => !renderer.CLUSTER_IMAGES[id]);
const missingDims = allClusterIds.filter(id => !renderer.CLUSTER_IMAGE_DIMS[id]);
ok(missingImage.length === 0, 'every cluster has an image path (' + missingImage.join(', ') + ')');
ok(missingDims.length === 0, 'every cluster has image dimensions (' + missingDims.join(', ') + ')');

const orphanImages = Object.keys(renderer.CLUSTER_IMAGES).filter(id => !allClusterIds.includes(id));
const orphanDims = Object.keys(renderer.CLUSTER_IMAGE_DIMS).filter(id => !allClusterIds.includes(id));
ok(orphanImages.length === 0, 'no image paths for clusters that do not exist (' + orphanImages.join(', ') + ')');
ok(orphanDims.length === 0, 'no image dimensions for clusters that do not exist (' + orphanDims.join(', ') + ')');

const badDims = allClusterIds.filter(id => {
    const d = renderer.CLUSTER_IMAGE_DIMS[id];
    return !(d.w > 0 && d.h > 0 && Number.isFinite(d.anchorX) && Number.isFinite(d.anchorY));
});
ok(badDims.length === 0, 'every dimension entry has positive size and a real anchor (' + badDims.join(', ') + ')');

// The anchor must sit inside the image, or the tile hangs off its own hex.
const anchorOutside = allClusterIds.filter(id => {
    const d = renderer.CLUSTER_IMAGE_DIMS[id];
    return d.anchorX < 0 || d.anchorY < 0 || d.anchorX > d.w || d.anchorY > d.h;
});
ok(anchorOutside.length === 0, 'every anchor point lies within its image (' + anchorOutside.join(', ') + ')');

// ============ the rotation invariant =========================================
// The drawn position of a hex is its UNROTATED pixel offset from the anchor,
// spun by the CSS transform. The logical position is the pixel offset of its
// ROTATED axial coordinate. These must agree.
function drawnOffset(r, dq, dr, rotation) {
    const p = r.hexToPixel(dq, dr);
    const t = rotation * 60 * Math.PI / 180;
    return { x: p.x * Math.cos(t) - p.y * Math.sin(t), y: p.x * Math.sin(t) + p.y * Math.cos(t) };
}
function maxRotationDrift(hexWidth, hexHeight) {
    const r = Object.assign({}, RendererMod.spec, { hexWidth, hexHeight });
    let worst = 0;
    for (const id of allClusterIds) {
        const cluster = defs.getCluster(id);
        for (let rotation = 0; rotation < 6; rotation++) {
            const rotated = defs.getRotatedHexes(cluster, rotation);
            cluster.hexes.forEach((h, i) => {
                const drawn = drawnOffset(r, h.dq, h.dr, rotation);
                const logical = r.hexToPixel(rotated[i].dq, rotated[i].dr);
                worst = Math.max(worst, Math.abs(drawn.x - logical.x), Math.abs(drawn.y - logical.y));
            });
        }
    }
    return worst;
}

// With true pointy-top dimensions the two computations are the same map.
const exactHeight = 60 * 2 / Math.sqrt(3);
ok(maxRotationDrift(60, exactHeight) < 1e-9,
    'CSS image rotation and axial rotation agree exactly at the true hex ratio ('
    + maxRotationDrift(60, exactHeight) + 'px)');

// The shipped dimensions round 69.282 to 69, which is a real but sub-pixel
// anisotropy. Pinned so a wilder ratio cannot creep in unnoticed.
const shippedDrift = maxRotationDrift(RendererMod.spec.hexWidth, RendererMod.spec.hexHeight);
ok(shippedDrift > 0, 'the shipped 60 x 69 is not the exact ratio, so some drift exists');
ok(shippedDrift < 1,
    'and it stays under a pixel across every cluster and rotation (' + shippedDrift.toFixed(3) + 'px)');
close(RendererMod.spec.hexHeight / RendererMod.spec.hexWidth, 2 / Math.sqrt(3), 0.005,
    'the shipped ratio is within 0.5% of the true pointy-top ratio');

// ============ bounds and offsets =============================================
const oneHex = [{ q: 0, r: 0 }];
let b = renderer.calculateBounds(oneHex);
ok(b.minX === 0 && b.minY === 0, 'a single hex at the origin starts the bounds at zero');
ok(b.maxX === renderer.hexWidth && b.maxY === renderer.hexHeight,
    'and extends by one hex width and height');

b = renderer.calculateBounds([{ q: 0, r: 0 }, { q: 2, r: 0 }, { q: 0, r: 2 }]);
ok(b.maxX > b.minX && b.maxY > b.minY, 'bounds grow to cover spread-out hexes');
ok(b.minX === 0, 'the leftmost hex sets minX');

// Documented edge: no hexes leaves the bounds at their infinite seeds, which
// would make the container size NaN. Callers always pass a populated board.
const empty = renderer.calculateBounds([]);
ok(empty.minX === Infinity && empty.maxX === -Infinity,
    'an empty board leaves bounds un-initialised (callers never pass one)');

// ============ render() ========================================================
const hexes = [{ q: 0, r: 0 }, { q: 3, r: -1 }, { q: -2, r: 2 }];
const result = renderer.render({ hexes, clusters: [] }, { padding: 50 });
const rb = renderer.calculateBounds(hexes);
close(result.width, rb.maxX - rb.minX + 100, 1e-9, 'render width is the span plus padding on both sides');
close(result.height, rb.maxY - rb.minY + 100, 1e-9, 'render height likewise');
close(result.offsetX, -rb.minX + 50, 1e-9, 'the offset shifts the leftmost hex to the padding line');
close(result.offsetY, -rb.minY + 50, 1e-9, 'and the topmost hex likewise');
ok(container.style.width === result.width + 'px', 'the container is sized to match');
ok(container.style.position === 'relative', 'and positioned so absolute children land correctly');

const defaultPad = renderer.render({ hexes, clusters: [] });
close(defaultPad.offsetX, -rb.minX + 100, 1e-9, 'padding defaults to 100');

// getHexCenter puts the point in the middle of the hex, not its corner.
const centre = renderer.getHexCenter(0, 0, 10, 20);
close(centre.x, 10 + renderer.hexWidth / 2, 1e-9, 'hex centre is half a width in from the offset');
close(centre.y, 20 + renderer.hexHeight / 2, 1e-9, 'and half a height down');

// ============ clip path =======================================================
// Each hex contributes one closed 6-vertex subpath; the union masks the image
// to the cluster's own hexes so decorative pixels cannot cover a neighbour.
const cluster = defs.getCluster('cluster-7-3');
const clip = renderer._buildClusterClipPath(cluster, 100, 200);
ok(clip.startsWith("path('") && clip.endsWith("')"), 'the clip path is a CSS path() value');
const subpaths = clip.match(/M[^M]*Z/g) || [];
ok(subpaths.length === cluster.hexes.length,
    'one subpath per hex (' + subpaths.length + ' vs ' + cluster.hexes.length + ')');
ok(subpaths.every(sp => (sp.match(/L/g) || []).length === 5),
    'each subpath is a closed hexagon: a move plus five lines');
ok(subpaths.every(sp => /^M[-\d.]+ [-\d.]+(L[-\d.]+ [-\d.]+){5}Z$/.test(sp)),
    'every subpath is well-formed coordinate syntax');

// The polygons are dilated slightly to hide anti-aliasing seams, so a hexagon
// must be marginally larger than the nominal hex.
const firstHexYs = subpaths[0].match(/[-\d.]+ ([-\d.]+)/g).map(s => parseFloat(s.split(' ')[1]));
const spanY = Math.max(...firstHexYs) - Math.min(...firstHexYs);
ok(spanY > renderer.hexHeight, 'polygons are dilated past the nominal hex to cover AA seams');
ok(spanY < renderer.hexHeight + 3, 'but only barely — a big dilation would overlap neighbours');

// ============ placing a cluster image ========================================
container.children = [];
const placement = { cluster: defs.getCluster('cluster-7-3'), anchorQ: 2, anchorR: -1, rotation: 3 };
renderer.renderClusterImage(placement, 40, 60, 7);
ok(container.children.length === 1, 'the cluster produced one element');

const wrapper = container.children[0];
const img = wrapper.children[0];
ok(wrapper.dataset.clusterId === 'cluster-7-3', 'the wrapper records which cluster it is');
ok(Number(wrapper.dataset.anchorQ) === 2 && Number(wrapper.dataset.anchorR) === -1,
    'and where it is anchored');
ok(wrapper.style.zIndex === 7, 'z-index follows the render order so tiles stack predictably');
ok(wrapper.style.transform === 'rotate(180deg)', 'rotation 3 is 180 degrees');
ok(img.src === 'https://x.test/theme/' + renderer.CLUSTER_IMAGES['cluster-7-3'],
    'the image URL is the theme URL joined to the cluster path');

// The image is positioned so its anchor pixel lands on the anchor hex centre,
// and the transform origin is that same point — otherwise rotating the tile
// would swing it away from its hex.
const dims = renderer.CLUSTER_IMAGE_DIMS['cluster-7-3'];
const anchorPixel = renderer.hexToPixel(2, -1);
const expectedLeft = anchorPixel.x + 40 + renderer.hexWidth / 2 - dims.anchorX * renderer.imageScale;
const expectedTop = anchorPixel.y + 60 + renderer.hexHeight / 2 - dims.anchorY * renderer.imageScale;
close(parseFloat(wrapper.style.left), expectedLeft, 1e-9, 'the image anchor sits on the anchor hex centre (x)');
close(parseFloat(wrapper.style.top), expectedTop, 1e-9, 'and on it vertically too');
ok(wrapper.style.transformOrigin
    === `${dims.anchorX * renderer.imageScale}px ${dims.anchorY * renderer.imageScale}px`,
    'the tile rotates about its anchor, not its corner');
close(parseFloat(img.style.width), dims.w * renderer.imageScale, 1e-9,
    'the image is scaled by hexWidth / imageHexWidth');

// Every rotation is a whole multiple of 60 degrees.
const degrees = [];
for (let rotation = 0; rotation < 6; rotation++) {
    container.children = [];
    renderer.renderClusterImage({ ...placement, rotation }, 0, 0, 0);
    degrees.push(container.children[0].style.transform);
}
ok(JSON.stringify(degrees) === JSON.stringify(
    ['rotate(0deg)', 'rotate(60deg)', 'rotate(120deg)', 'rotate(180deg)',
     'rotate(240deg)', 'rotate(300deg)']),
    'the six rotations map to the six 60-degree steps');

// A cluster with no image config is skipped rather than throwing — which is
// why the completeness checks at the top of this file matter.
container.children = [];
renderer.renderClusterImage({ cluster: { id: 'no-such-cluster' }, anchorQ: 0, anchorR: 0, rotation: 0 }, 0, 0, 0);
ok(container.children.length === 0, 'an unknown cluster draws nothing instead of erroring');

// ============ renderFromPlacements ===========================================
container.children = [];
const placements = [
    { clusterId: 'cluster-7-3', anchorQ: 0, anchorR: 0, rotation: 0 },
    { clusterId: 'city-red', anchorQ: 4, anchorR: -2, rotation: 2 },
];
const fromPlacements = renderer.renderFromPlacements(placements, hexes, defs);
ok(container.children.length === 2, 'a saved game renders one element per placement');
ok(fromPlacements && typeof fromPlacements.width === 'number',
    'and returns the same geometry render() does');
ok(container.children[0].dataset.clusterId === 'cluster-7-3'
    && container.children[1].dataset.clusterId === 'city-red',
    'placements keep their order, so z-index matches the stored stacking');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail === 0 ? 0 : 1);
