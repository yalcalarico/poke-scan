import sharp from 'sharp';
import cvModule from '@techstark/opencv-js';

const cvReady = Promise.resolve(cvModule).then(async (cv) => {
  if (!cv.Mat)
    await new Promise((resolve) => {
      cv.onRuntimeInitialized = resolve;
    });
  return cv;
});
const cache = new Map();
let cacheVersion;
const WIDTH = 384;
const HEIGHT = 536;

async function features(bytes) {
  const cv = await cvReady;
  const pixels = await sharp(bytes, { limitInputPixels: 24_000_000 })
    .rotate()
    .resize(WIDTH, HEIGHT, { fit: 'fill' })
    .removeAlpha()
    .grayscale()
    .raw()
    .toBuffer();
  const image = cv.matFromArray(HEIGHT, WIDTH, cv.CV_8UC1, pixels);
  const mask = cv.Mat.zeros(HEIGHT, WIDTH, cv.CV_8UC1);
  // El dibujo aporta identidad visual; excluir título y pie evita puntuar sólo texto y marcos comunes.
  for (let y = Math.ceil(HEIGHT * 0.12); y < HEIGHT * 0.78; y++)
    mask.data.fill(255, y * WIDTH + 12, y * WIDTH + WIDTH - 12);
  const keypoints = new cv.KeyPointVector();
  const descriptors = new cv.Mat();
  const orb = new cv.ORB();
  orb.setMaxFeatures(600);
  orb.setFastThreshold(10);
  try {
    orb.detectAndCompute(image, mask, keypoints, descriptors);
    const points = Array.from({ length: keypoints.size() }, (_, i) => {
      const point = keypoints.get(i).pt;
      return { x: point.x, y: point.y };
    });
    return { descriptors, points };
  } catch (error) {
    descriptors.delete();
    throw error;
  } finally {
    image.delete();
    mask.delete();
    keypoints.delete();
    orb.delete();
  }
}

function geometricEvidence(cv, query, reference, matcher) {
  const matches = new cv.DMatchVectorVector();
  const mask = new cv.Mat();
  let source, target, homography;
  try {
    if (query.descriptors.rows < 2 || reference.descriptors.rows < 2)
      return { matches: 0, inliers: 0, coverage: 0, verified: false };
    matcher.knnMatch(query.descriptors, reference.descriptors, matches, 2);
    const pairs = [];
    const used = new Set();
    for (let i = 0; i < matches.size(); i++) {
      const neighbors = matches.get(i);
      try {
        if (neighbors.size() < 2) continue;
        const a = neighbors.get(0),
          b = neighbors.get(1);
        if (
          a.distance >= 64 ||
          a.distance >= b.distance * 0.75 ||
          used.has(a.trainIdx)
        )
          continue;
        used.add(a.trainIdx);
        pairs.push({
          query: query.points[a.queryIdx],
          reference: reference.points[a.trainIdx],
        });
      } finally {
        neighbors.delete();
      }
    }
    if (pairs.length < 8)
      return {
        matches: pairs.length,
        inliers: 0,
        coverage: 0,
        verified: false,
      };
    source = cv.matFromArray(
      pairs.length,
      1,
      cv.CV_32FC2,
      pairs.flatMap((p) => [p.query.x, p.query.y]),
    );
    target = cv.matFromArray(
      pairs.length,
      1,
      cv.CV_32FC2,
      pairs.flatMap((p) => [p.reference.x, p.reference.y]),
    );
    homography = cv.findHomography(
      source,
      target,
      cv.RANSAC,
      4,
      mask,
      1000,
      0.995,
    );
    const consistent = pairs.filter((_, i) => mask.data[i] === 1);
    const xs = consistent.map((p) => p.query.x),
      ys = consistent.map((p) => p.query.y);
    const coverage = consistent.length
      ? ((Math.max(...xs) - Math.min(...xs)) *
          (Math.max(...ys) - Math.min(...ys))) /
        (WIDTH * HEIGHT)
      : 0;
    const verified =
      !homography.empty() &&
      consistent.length >= 8 &&
      consistent.length / pairs.length >= 0.45 &&
      coverage >= 0.08;
    return {
      matches: pairs.length,
      inliers: consistent.length,
      coverage,
      verified,
    };
  } finally {
    matches.delete();
    mask.delete();
    source?.delete();
    target?.delete();
    homography?.delete();
  }
}

export async function rerankDetails(bytes, candidates, version = '') {
  const cv = await cvReady;
  if (cacheVersion !== version) {
    for (const feature of cache.values()) feature.descriptors.delete();
    cache.clear();
    cacheVersion = version;
  }
  const query = await features(bytes);
  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
  const result = [];
  try {
    for (const candidate of candidates) {
      let reference;
      try {
        if (!candidate.imagePath) throw new Error('Sin imagen local');
        reference = cache.get(candidate.imagePath);
        if (!reference) {
          reference = await features(candidate.imagePath);
          if (cache.size >= 128) {
            const key = cache.keys().next().value;
            cache.get(key).descriptors.delete();
            cache.delete(key);
          }
          cache.set(candidate.imagePath, reference);
        }
      } catch {
        result.push({ ...candidate, geometry: null });
        continue;
      }
      result.push({
        ...candidate,
        geometry: geometricEvidence(cv, query, reference, matcher),
      });
    }
    return result.sort(
      (a, b) =>
        Number(b.geometry?.verified ?? false) -
          Number(a.geometry?.verified ?? false) ||
        (a.geometry?.verified && b.geometry?.verified
          ? b.geometry.inliers - a.geometry.inliers
          : 0) ||
        b.similarity - a.similarity,
    );
  } finally {
    query.descriptors.delete();
    matcher.delete();
  }
}
