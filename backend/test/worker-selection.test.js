const test = require('node:test');
const assert = require('node:assert/strict');
const { Op } = require('sequelize');
const { workerOptions, technicalWhere, fundamentalWhere, needsYahoo, needsSec, resumeCandidates } = require('../utils/worker-selection');
const options = { resume: true, force: false };

test('resume keeps symbol constraints and selects each missing checkpoint independently', () => {
  assert.deepEqual(technicalWhere({ ...options, symbol: 'AAA' }), { symbol: 'AAA', last_technical_update: null });
  assert.deepEqual(fundamentalWhere(options)[Op.or], [{ last_fundamental_update: null }, { last_sec_update: null }]);
  const yahooDone = { symbol: 'AAA', last_fundamental_update: new Date(), last_sec_update: null };
  const secDone = { symbol: 'BBB', last_fundamental_update: null, last_sec_update: new Date() };
  assert.equal(needsYahoo(yahooDone, options), false);
  assert.equal(needsSec(yahooDone, options), true);
  assert.equal(needsYahoo(secDone, options), true);
  assert.equal(needsSec(secDone, options), false);
});

test('resume does not repeatedly request SEC for companies without a mapping', () => {
  const rows = [
    { symbol: 'AAA', last_fundamental_update: new Date(), last_sec_update: null },
    { symbol: 'BBB', last_fundamental_update: new Date(), last_sec_update: null },
    { symbol: 'CCC', last_fundamental_update: null, last_sec_update: null },
  ];
  assert.deepEqual(resumeCandidates(rows, { AAA: '0000000001' }).map(t => t.symbol), ['AAA', 'CCC']);
});

test('normal checkpoints and force mode retain their behavior', () => {
  const cutoff = new Date();
  assert.deepEqual(technicalWhere({ force: true }, cutoff), {});
  assert.deepEqual(technicalWhere({ symbol: 'AAA' }, cutoff), { symbol: 'AAA' });
  assert.equal(technicalWhere({}, cutoff)[Op.or][0].last_technical_update[Op.lt], cutoff);
  assert.deepEqual(workerOptions(['--resume', '--symbol=aaa']), { resume: true, force: false, symbol: 'AAA' });
  for (const flag of ['--force', '--full', '-f']) {
    assert.throws(() => workerOptions(['--resume', flag]), /not both/);
  }
});

test('update-all continues fundamentals after a failed technical stage, then reports failure', async () => {
  const { runAll } = require('../workers/update-all');
  const stages = [];
  await assert.rejects(runAll({
    technical: async () => { stages.push('technical'); throw new Error('Upstream technical failure'); },
    fundamental: async () => { stages.push('fundamental'); },
  }), /Update incomplete/);
  assert.deepEqual(stages, ['technical', 'fundamental']);
});
