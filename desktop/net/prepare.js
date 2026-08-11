'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const {
  verifyPackageToken,
  assertContentMatches,
  PackageTokenError,
} = require('../../lib/offline/package-token');

/**
 * Online preparation: the one step of an offline sitting that needs a network.
 *
 * The lab connects, a learner signs in, this downloads and verifies everything
 * that paper needs, and then the cable comes out. After this returns, nothing
 * in the assessment touches the network again.
 *
 * Deliberately free of Electron imports so it can be exercised under plain Node
 * — `fetchFn` and `mediaDir` are injected. The Electron wiring lives in main.js.
 */

/**
 * @param {object} options
 * @param {string} options.baseUrl              deployment origin
 * @param {string} options.assessmentSystemId   the public ASS#### id
 * @param {string} options.deviceId             this installation's id
 * @param {object} options.repo                 db/repository instance
 * @param {string} options.mediaDir             where question images are written
 * @param {Record<string,string>} options.publicKeys  key id -> SPKI PEM
 * @param {Function} options.fetchFn            fetch implementation (carries the session cookie)
 * @param {number} [options.now]                injectable for testing
 */
async function prepareAssessment({
  baseUrl,
  assessmentSystemId,
  deviceId,
  repo,
  mediaDir,
  publicKeys,
  fetchFn,
  now = Date.now(),
}) {
  const url = new URL(
    `/api/assessments/${encodeURIComponent(assessmentSystemId)}/package`,
    baseUrl
  );
  url.searchParams.set('deviceId', deviceId);

  const response = await fetchFn(url.toString(), {
    method: 'GET',
    headers: { accept: 'application/json' },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body || body.success !== true) {
    // The server's message is written for the learner ("you have already
    // submitted this assessment"), so pass it through rather than replacing it
    // with a status code they can do nothing with.
    throw new Error(body?.message || `Could not download the assessment (HTTP ${response.status}).`);
  }

  const data = body.data;

  // Verify BEFORE anything is written. A package that fails here must leave no
  // trace on the machine, or a half-written paper becomes indistinguishable
  // from a real one.
  const claims = verifyPackageToken(data.token, publicKeys, now);

  if (claims.deviceId !== deviceId) {
    throw new PackageTokenError(
      'This assessment package was prepared for a different computer and cannot be used here.'
    );
  }

  if (claims.assessmentSystemId !== assessmentSystemId) {
    throw new PackageTokenError('This package is for a different assessment.');
  }

  /**
   * Rebuild exactly what the server hashed: student, assessment, questions and
   * nothing else. `token`, `startedAt` and `expiresAt` sit alongside the
   * content in the response but are not part of it — the token cannot contain
   * a hash of itself.
   */
  const content = {
    student: data.student,
    assessment: data.assessment,
    questions: data.questions,
  };
  assertContentMatches(claims, content);

  const questions = await downloadMedia(data.questions, mediaDir, fetchFn);

  repo.savePackage({
    student: data.student,
    assessment: data.assessment,
    questions,
    token: data.token,
    checksum: claims.contentHash,
    expiresAt: claims.validUntil,
  });

  return {
    assessmentId: data.assessment.id,
    title: data.assessment.title,
    questionCount: data.questions.length,
    startedAt: claims.startedAt,
    durationSeconds: claims.durationSeconds,
  };
}

/**
 * Fetches every question image to disk.
 *
 * A picture question IS its picture — "name the shape below" cannot be answered
 * without the shape — so a failure here fails the whole preparation rather than
 * leaving a learner with an unanswerable question and no way to get the image
 * once the cable is out.
 */
async function downloadMedia(questions, mediaDir, fetchFn) {
  fs.mkdirSync(mediaDir, { recursive: true });

  const out = [];
  for (const question of questions) {
    if (!question.imageUrl) {
      out.push(question);
      continue;
    }

    // Content-addressed by URL so re-preparing does not re-download, and two
    // questions sharing a stimulus image share one file.
    const digest = crypto.createHash('sha256').update(question.imageUrl).digest('hex').slice(0, 32);
    const extension = guessExtension(question.imageUrl);
    const file = path.join(mediaDir, `${digest}${extension}`);

    if (!fs.existsSync(file)) {
      const response = await fetchFn(question.imageUrl);
      if (!response.ok) {
        throw new Error(
          `Could not download the image for question ${question.code}. ` +
            'The assessment cannot be prepared without it.'
        );
      }
      const bytes = Buffer.from(await response.arrayBuffer());

      // Write to a temporary name and rename into place: an interrupted
      // download must not leave a truncated file that `existsSync` then treats
      // as a complete one on the next attempt.
      const partial = `${file}.part`;
      fs.writeFileSync(partial, bytes);
      fs.renameSync(partial, file);
    }

    out.push({ ...question, mediaPath: file });
  }

  return out;
}

function guessExtension(url) {
  const match = /\.(png|jpe?g|gif|webp|svg)(?:$|[?#])/i.exec(url);
  return match ? `.${match[1].toLowerCase()}` : '.img';
}

module.exports = { prepareAssessment };
