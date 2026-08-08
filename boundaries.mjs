// boundaries.mjs — every threshold in the reader, pinned to a case sitting exactly on it.
//
// This tool is thresholds all the way down: where arousal stops being medium, how many pain signals
// make a vet flag, how much agreement is enough to act on. Witness produced a surviving mutant for
// each of them — a `>` quietly becoming a `>=` — and every one of those is a dog read one band off.
// Off by one here is not a rounding error, it is calling a warning "alert".
import assert from 'node:assert/strict';
import {
  fuse, vetFlag, timeline, signature, makeProfile, observe, newSignals, label, repertoire,
  LOW_BAND, HIGH_BAND, CONFIDENT,
} from './doggyap.mjs';

export function boundaries(t) {
  // ── AROUSAL BANDS ─────────────────────────────────────────────────────────────────────────────
  t('the arousal bands are exact — sitting ON a threshold reads as the HIGHER band', () => {
    // silent voice (0, weight 1) + panting mouth (0.5, weight 1) = mean exactly 0.25
    const atLow = fuse({ voice: 'silent', mouth: 'panting' });
    assert.equal(atLow.arousalLevel, LOW_BAND);
    assert.equal(atLow.arousal, 'medium', 'exactly at the low boundary is no longer at rest');

    // freeze(1×3) + high-stiff-wag(1×2) + ears back(0.5×2) + gaze averted(0.5×2) + silent(0×1) = 7/10
    const atHigh = fuse({ posture: 'freeze', tail: 'high-stiff-wag', ears: 'back', gaze: 'averted', voice: 'silent' });
    assert.equal(atHigh.arousalLevel, HIGH_BAND);
    assert.equal(atHigh.arousal, 'high', 'exactly at the high boundary is properly wound up');
  });

  t('just below a threshold stays in the lower band', () => {
    // silent(0×1) + silent-equivalents pushing the mean under 0.25
    const under = fuse({ voice: 'silent', mouth: 'panting', hackles: 'flat' });
    assert.ok(under.arousalLevel < LOW_BAND, `mean was ${under.arousalLevel}`);
    assert.equal(under.arousal, 'low');
  });

  // ── THE VET FLAG ──────────────────────────────────────────────────────────────────────────────
  t('the vet flag fires at EXACTLY two signals, not three', () => {
    const two = vetFlag({ posture: 'cower', tail: 'tucked' });
    assert.equal(two.signals.length, 2);
    assert.equal(two.flag, true, 'two pain-adjacent signals is the threshold, and it is inclusive');
    assert.ok(two.note);
    const one = vetFlag({ posture: 'cower' });
    assert.equal(one.signals.length, 1);
    assert.equal(one.flag, false);
    assert.equal(one.note, null, 'and no note when it has not fired');
  });

  // ── CHECK-CONTEXT ─────────────────────────────────────────────────────────────────────────────
  t('confidence exactly at the bar is CONFIDENT — the bar is inclusive', () => {
    // positive: posture(3) + gaze(2) + voice(1) = 6 · negative: tail(2) + ears(2) = 4 · 6/10 = 0.6
    const r = fuse({ posture: 'relaxed', gaze: 'soft', voice: 'yip-play', tail: 'tucked', ears: 'pinned' });
    assert.equal(r.agreement, CONFIDENT);
    assert.equal(r.coverage, 1);
    assert.equal(r.confidence, CONFIDENT);
    assert.equal(r.flags.lowConfidence, false, 'exactly at the bar is not below it');
    // it still wants context, because the axes are dissenting — a different reason, reported separately
    assert.equal(r.flags.dissent, true);
    assert.equal(r.checkContext, true);
  });

  t('axis count exactly at the minimum is enough', () => {
    const r = fuse({ posture: 'relaxed', ears: 'relaxed' }, { minAxes: 2 });
    assert.equal(r.axes, 2);
    assert.equal(r.flags.tooFewAxes, false, 'two axes with minAxes 2 is not too few');
    assert.equal(fuse({ posture: 'relaxed' }, { minAxes: 2 }).flags.tooFewAxes, true);
  });

  t('ANY ONE reason is enough to want context — the reasons are OR, not AND', () => {
    // dissent alone, with high confidence and plenty of axes
    const dissentOnly = fuse({ posture: 'relaxed', ears: 'relaxed', gaze: 'soft', mouth: 'loose-open', voice: 'growl-low' });
    assert.equal(dissentOnly.flags.dissent, true);
    assert.equal(dissentOnly.flags.lowConfidence, false, `confidence was ${dissentOnly.confidence}`);
    assert.equal(dissentOnly.flags.tooFewAxes, false);
    assert.equal(dissentOnly.checkContext, true, 'one dissenting axis is reason enough on its own');

    // too few axes alone, with perfect agreement
    const fewOnly = fuse({ posture: 'relaxed' });
    assert.equal(fewOnly.flags.dissent, false);
    assert.equal(fewOnly.checkContext, true);

    // THIN AGREEMENT ALONE. One axis, no dissent, and minAxes satisfied — so the only thing wrong is
    // that half the dog was never looked at. That still wants context, and it is the case a reader
    // is most likely to wave through, because nothing visibly disagrees.
    const thinOnly = fuse({ posture: 'relaxed' }, { minAxes: 1 });
    assert.equal(thinOnly.flags.tooFewAxes, false);
    assert.equal(thinOnly.flags.dissent, false);
    assert.equal(thinOnly.flags.lowConfidence, true, `confidence was ${thinOnly.confidence}`);
    assert.equal(thinOnly.checkContext, true, 'thin coverage alone is reason enough');

    // TOO FEW AXES ALONE, with the confidence bar cleared. Three axes agreeing perfectly clears the
    // bar on agreement, and is still not the four this caller asked to see before trusting a read.
    const countOnly = fuse({ posture: 'relaxed', ears: 'relaxed', gaze: 'soft' }, { minAxes: 4 });
    assert.equal(countOnly.flags.lowConfidence, false, `confidence was ${countOnly.confidence}`);
    assert.equal(countOnly.flags.dissent, false);
    assert.equal(countOnly.flags.tooFewAxes, true);
    assert.equal(countOnly.checkContext, true, 'the caller set a bar and it was not met');
  });

  // ── OPPOSITION vs ABSTENTION ──────────────────────────────────────────────────────────────────
  t('a NEUTRAL axis is quiet, not dissenting — abstaining is not arguing', () => {
    // A frightened dog pants. Panting is neutral: it is not evidence the dog is fine, and it is not
    // evidence against the fear either. Counting it as dissent fires the warning on almost every
    // read, and a warning that is always on is one nobody reads.
    const r = fuse({ posture: 'cower', tail: 'tucked', gaze: 'averted', mouth: 'panting' });
    assert.equal(r.valence, 'negative');
    assert.deepEqual(r.conflict, [], 'nothing here is arguing the dog is fine');
    assert.deepEqual(r.quiet, ['mouth'], 'but the neutral axis is still reported, by name');
    assert.equal(r.flags.dissent, false);
  });

  t('an OPPOSING axis still dissents, and is still named', () => {
    const r = fuse({ posture: 'cower', tail: 'tucked', gaze: 'averted', mouth: 'loose-open' });
    assert.equal(r.valence, 'negative');
    assert.deepEqual(r.conflict.map(c => c.axis), ['mouth'], 'a positive mouth genuinely argues with a frightened body');
    assert.equal(r.flags.dissent, true);
    assert.deepEqual(r.quiet, []);
  });

  t('when the majority itself is NEUTRAL, both poles count as dissent', () => {
    const r = fuse({ hackles: 'raised', ears: 'forward', posture: 'relaxed', gaze: 'hard-stare' });
    assert.equal(r.valence, 'neutral');
    assert.deepEqual(r.conflict.map(c => c.axis).sort(), ['gaze', 'posture'], 'a neutral read pulled both ways is exactly when to look again');
    assert.equal(r.flags.dissent, true);
  });

  // ── THE SIGNATURE IS A STORED KEY ─────────────────────────────────────────────────────────────
  t('the signature is a WIRE FORMAT — a saved profile is keyed by it', () => {
    // A profile lives in local storage and its labels are keyed by signature. If the hash drifts,
    // every name the owner has given their dog's signals silently stops matching, and the tool
    // quietly forgets everything it was told. Pinned deliberately; change it only with a migration.
    assert.equal(signature({ tail: 'high-stiff-wag', gaze: 'hard-stare' }), '48217cd2');
    assert.equal(signature({ posture: 'play-bow' }), '56765948');
    // and the axis ORDER must not change the key, or the same read saves under two names
    assert.equal(signature({ gaze: 'hard-stare', tail: 'high-stiff-wag' }), '48217cd2');
  });

  // ── THE TIMELINE ──────────────────────────────────────────────────────────────────────────────
  t('two frames are a timeline — the early return is for ONE frame or none', () => {
    const two = timeline([{ at: 0, state: 'relaxed' }, { at: 1, state: 'threat-warning' }]);
    assert.equal(two.frames, 2);
    assert.equal(two.direction, 'escalating', 'a two-frame escalation is the most urgent kind there is');
    assert.equal(two.escalations.length, 1);
  });

  t('a single frame still reports its peak', () => {
    const one = timeline([{ at: 0, state: 'aroused' }]);
    assert.equal(one.frames, 1);
    assert.ok(one.peak, 'one frame is still a reading, and the peak is that reading');
    assert.equal(one.peak.state, 'aroused');
    assert.equal(timeline([]).peak, null);
  });

  t('an UNCHANGED state is neither an escalation nor a settling', () => {
    const flat = timeline([{ at: 0, state: 'alert' }, { at: 1, state: 'alert' }, { at: 2, state: 'alert' }]);
    assert.equal(flat.escalations.length, 0, 'staying alert is not escalating');
    assert.equal(flat.deescalations.length, 0, 'nor is it settling');
    assert.equal(flat.direction, 'flat');
    // two states of EQUAL severity are also no change, even though the words differ
    const sideways = timeline([{ at: 0, state: 'aroused' }, { at: 1, state: 'distress' }]);
    assert.equal(sideways.escalations.length, 0, 'aroused and distress sit at the same severity');
    assert.equal(sideways.deescalations.length, 0);
  });

  t('the peak is the FIRST time the worst state was reached', () => {
    const tl = timeline([
      { at: 0, state: 'relaxed' }, { at: 1, state: 'threat-warning' },
      { at: 2, state: 'alert' }, { at: 3, state: 'threat-warning' },
    ]);
    assert.equal(tl.peak.at, 1, 'the first warning is the one that mattered, not the last');
  });

  // ── THE PROFILE ───────────────────────────────────────────────────────────────────────────────
  t('first-seen stays the FIRST time, and last-seen moves', () => {
    const p = makeProfile('rosie');
    const r = { tail: 'high-loose-wag', posture: 'neutral' };
    observe(p, r, { at: 10 });
    observe(p, r, { at: 20 });
    observe(p, r, { at: 30 });
    const pat = p.patterns.get(signature(r));
    assert.equal(pat.first, 10, 'when a signal STARTED is the interesting number');
    assert.equal(pat.last, 30);
    assert.equal(pat.count, 3);
  });

  t('candidates are ordered by RECURRENCE, and the signature is only a tie-break', () => {
    // Built so the two orderings disagree: whichever pattern signs FIRST alphabetically is given the
    // FEWER sightings. If the sort ever falls back to the signature the order inverts, which would
    // put the thing a dog does occasionally above the thing it does constantly.
    const a = { tail: 'tucked', ears: 'back' };
    const b = { tail: 'high-loose-wag', ears: 'forward' };
    const [firstBySig, lastBySig] = signature(a) < signature(b) ? [a, b] : [b, a];

    const p = makeProfile('rosie');
    for (let i = 0; i < 5; i++) observe(p, firstBySig, { at: i, context: 'x' });
    for (let i = 0; i < 9; i++) observe(p, lastBySig, { at: i, context: 'y' });

    const found = newSignals(p, { threshold: 4 });
    assert.equal(found.length, 2);
    assert.equal(found[0].count, 9, 'the most frequent candidate must lead, whatever it signs as');
    assert.equal(found[0].sig, signature(lastBySig));
    assert.ok(found[0].sig > found[1].sig, 'the fixture must actually put the two orderings in conflict');
  });

  t('the repertoire is ordered by count too, even when the names disagree with it', () => {
    const p = makeProfile('rosie');
    const a = { tail: 'high-loose-wag' }, b = { tail: 'tucked' };
    for (let i = 0; i < 7; i++) observe(p, a, { at: i });
    for (let i = 0; i < 2; i++) observe(p, b, { at: i });
    label(p, signature(a), 'zoomies');      // last alphabetically, seen most
    label(p, signature(b), 'anxious');      // first alphabetically, seen least
    assert.deepEqual(repertoire(p).map(x => x.name), ['zoomies', 'anxious'],
      'the signal a dog makes most often is the one to show first');
  });
}
