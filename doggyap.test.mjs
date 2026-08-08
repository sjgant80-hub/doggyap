// doggyap.test.mjs — the gate.
//
// The headline claim is that multi-axis fusion catches what a sound-or-tail-alone reader gets wrong,
// so the first thing proven here is exactly that: the same wagging tail, opposite state, because the
// other axes decided it. If that test ever goes green for the wrong reason the whole tool is a toy.
//
// The second thing proven is the honesty line — no words, confidence shown, disagreement surfaced,
// a "new signal" is a recurrence and not a meaning. Those are guards, and a guard that cannot be
// shown to fire is decoration.
import assert from 'node:assert/strict';
import {
  AXES, AXIS_NAMES, STATES, vocabulary, vote, votes, fuse, stateOf, vetFlag, assertNotSpeech,
  makeProfile, signature, observe, newSignals, label, known, repertoire, timeline, read,
  profileToJSON, profileFromJSON, SPEC,
} from './doggyap.mjs';
import { boundaries } from './boundaries.mjs';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error(`  ✗ ${name}\n      ${e.message.split('\n')[0]}`); } };

// ════ THE CASE A SOUND-ONLY TOOL GETS WRONG ═════════════════════════════════════════════════════
//
// Both dogs are wagging. One is inviting a game, the other is telling you to back off. Every tool
// that reads the tail alone — or listens to the bark alone — calls both of them happy.

const PLAY = { tail: 'loose-wide-wag', posture: 'play-bow', ears: 'relaxed', gaze: 'soft', voice: 'yip-play', mouth: 'loose-open' };
const THREAT = { tail: 'high-stiff-wag', posture: 'forward-weight', ears: 'pinned', gaze: 'hard-stare', voice: 'growl-low', mouth: 'lip-lift' };

t('THE PROVEN CASE · a loose wide wag with a play-bow reads as play, confidently', () => {
  const r = fuse(PLAY);
  assert.equal(r.state, 'play');
  assert.equal(r.valence, 'positive');
  assert.ok(r.confidence >= 0.7, `confidence was ${r.confidence}`);
  assert.equal(r.conflict.length, 0, 'nothing should be dissenting here');
  assert.equal(r.checkContext, false);
});

t('THE PROVEN CASE · a STIFF high wag with a hard stare reads as a threat warning, confidently', () => {
  const r = fuse(THREAT);
  assert.equal(r.state, 'threat-warning');
  assert.equal(r.valence, 'negative');
  assert.equal(r.arousal, 'high');
  assert.ok(r.confidence >= 0.7, `confidence was ${r.confidence}`);
});

t('THE PROVEN CASE · the tail alone cannot tell them apart, and the fusion can', () => {
  // What a tail-only reader sees: motion, in both cases. It has one axis and no way to choose.
  const tailOnlyPlay = fuse({ tail: 'loose-wide-wag' });
  const tailOnlyThreat = fuse({ tail: 'high-stiff-wag' });
  assert.equal(tailOnlyPlay.checkContext, true, 'one axis must never be treated as a confident read');
  assert.equal(tailOnlyThreat.checkContext, true);

  // And what the whole dog says: two different states, decided by the axes the other tool ignores.
  assert.notEqual(fuse(PLAY).state, fuse(THREAT).state);
  assert.equal(fuse(PLAY).valence, 'positive');
  assert.equal(fuse(THREAT).valence, 'negative');
});

t('THE PROVEN CASE · a sound-only read of the threatening dog is not enough on its own', () => {
  // A growl alone is medium arousal and negative — but one axis can never clear the bar, which is
  // the honest answer: go and look at the dog.
  const voiceOnly = fuse({ voice: 'growl-low' });
  assert.equal(voiceOnly.axes, 1);
  assert.equal(voiceOnly.checkContext, true);
  assert.ok(voiceOnly.confidence < 0.6, `one axis gave confidence ${voiceOnly.confidence}`);
});

t('the body OUTVOTES the voice — a happy-sounding dog with a threatening body is not happy', () => {
  const r = fuse({ voice: 'yip-play', tail: 'high-stiff-wag', posture: 'forward-weight', gaze: 'hard-stare', ears: 'pinned' });
  assert.equal(r.valence, 'negative', 'voice is the lightest axis for exactly this reason');
  assert.equal(r.state, 'threat-warning');
  assert.deepEqual(r.conflict.map(c => c.axis), ['voice'], 'and the dissenting axis must be named, not hidden');
});

// ════ FUSION ════════════════════════════════════════════════════════════════════════════════════

t('confidence IS agreement — it falls when the axes split', () => {
  const agreed = fuse({ posture: 'relaxed', ears: 'relaxed', gaze: 'soft', mouth: 'loose-open' });
  const split = fuse({ posture: 'relaxed', ears: 'pinned', gaze: 'hard-stare', mouth: 'loose-open' });
  assert.ok(agreed.confidence > split.confidence, `${agreed.confidence} should beat ${split.confidence}`);
  assert.ok(agreed.conflict.length < split.conflict.length);
});

t('a dissenting axis is NAMED, with its reading — the most useful thing in the output', () => {
  const r = fuse({ tail: 'loose-wide-wag', posture: 'forward-weight', gaze: 'hard-stare', ears: 'pinned' });
  const tail = r.conflict.find(c => c.axis === 'tail');
  assert.ok(tail, `expected the tail to be flagged as dissenting, got ${JSON.stringify(r.conflict)}`);
  assert.equal(tail.reading, 'loose-wide-wag');
  assert.equal(tail.valence, 'positive');
  assert.equal(r.checkContext, true, 'any dissent means check the context');
});

t('a conflicted dog is reported as conflicted rather than averaged into a smooth answer', () => {
  const r = fuse({ tail: 'loose-wide-wag', ears: 'pinned', gaze: 'whale-eye', posture: 'back-weight' });
  assert.equal(r.checkContext, true);
  assert.ok(r.conflict.length > 0);
  assert.ok(r.confidence < 1);
});

t('drivers say WHICH axes produced the state', () => {
  const r = fuse(PLAY);
  assert.ok(r.drivers.length > 0);
  assert.ok(r.drivers.includes('posture'), `expected posture among ${JSON.stringify(r.drivers)}`);
  assert.ok(r.drivers.every(a => AXIS_NAMES.includes(a)));
});

t('partial observation cannot buy full confidence', () => {
  const one = fuse({ posture: 'relaxed' });
  const four = fuse({ posture: 'relaxed', ears: 'relaxed', gaze: 'soft', mouth: 'loose-open' });
  assert.ok(one.confidence < four.confidence, 'reading one axis is not reading the dog');
  assert.equal(one.coverage < four.coverage, true);
});

t('reading nothing returns nothing, and says so', () => {
  const r = fuse({});
  assert.equal(r.state, null);
  assert.equal(r.confidence, 0);
  assert.equal(r.checkContext, true);
  assert.equal(r.why, 'nothing observed');
  assert.deepEqual(fuse({ tail: null, gaze: '' }).state, null, 'an unobserved axis is not a reading');
});

t('every state the fusion can emit is in the closed set', () => {
  const seen = new Set();
  for (const tail of Object.keys(AXES.tail.readings))
    for (const posture of Object.keys(AXES.posture.readings))
      for (const gaze of Object.keys(AXES.gaze.readings))
        seen.add(fuse({ tail, posture, gaze }).state);
  assert.ok(seen.size >= 5, `only ${seen.size} distinct states reachable — the table is barely used`);
  for (const s of seen) assert.ok(STATES.includes(s), `"${s}" is not a declared state`);
});

t('a tie breaks toward the more careful reading, never the happier one', () => {
  // one axis positive, one axis negative, equal weight — must not resolve to positive
  const r = fuse({ ears: 'relaxed', gaze: 'hard-stare' });
  assert.equal(r.valence, 'negative', 'an even split must not be called positive');
});

t('stateOf covers the whole grid', () => {
  for (const a of ['low', 'medium', 'high'])
    for (const v of ['negative', 'neutral', 'positive'])
      assert.ok(STATES.includes(stateOf(a, v)), `${a}/${v} produced no valid state`);
  assert.throws(() => stateOf('enormous', 'positive'), /no state/);
});

// ════ THE AXES ══════════════════════════════════════════════════════════════════════════════════

t('an unknown axis or reading THROWS — a silently dropped axis makes confidence a lie', () => {
  assert.throws(() => vote('vibes', 'good'), /unknown axis/);
  assert.throws(() => vote('tail', 'wagging'), /unknown tail reading/);
  assert.throws(() => votes({ tail: 'waggy' }), /unknown tail reading/);
});

t('voice is the LIGHTEST axis and posture the heaviest — the weighting is the thesis', () => {
  assert.ok(AXES.voice.weight < AXES.tail.weight, 'sound is roughly a fifth of the signal');
  assert.ok(AXES.posture.weight > AXES.tail.weight, 'posture is the state, unmediated');
  assert.equal(AXES.posture.weight, Math.max(...AXIS_NAMES.map(a => AXES[a].weight)));
  assert.equal(AXES.voice.weight, Math.min(...AXIS_NAMES.map(a => AXES[a].weight)));
});

t('the vocabulary is closed and self-describing, so the UI cannot invent a reading', () => {
  const v = vocabulary();
  assert.deepEqual(Object.keys(v).sort(), [...AXIS_NAMES].sort());
  for (const axis of AXIS_NAMES) {
    assert.ok(v[axis].readings.length >= 2);
    for (const r of v[axis].readings) assert.doesNotThrow(() => vote(axis, r));
  }
});

t('the tail vocabulary separates STIFF from LOOSE at the same height — the whole misread', () => {
  const stiff = vote('tail', 'high-stiff-wag'), loose = vote('tail', 'high-loose-wag');
  assert.notEqual(stiff.valence, loose.valence, 'same height, same motion, opposite meaning');
  assert.equal(stiff.valence, 'negative');
  assert.equal(loose.valence, 'positive');
});

t('hackles vote arousal, NOT aggression', () => {
  assert.equal(vote('hackles', 'raised').arousal, 'high');
  assert.equal(vote('hackles', 'raised').valence, 'neutral', 'raised hackles are not by themselves negative');
});

// ════ THE HONESTY LINE ══════════════════════════════════════════════════════════════════════════

t('NO WORDS · the guard throws on speech put in the dog\'s mouth', () => {
  for (const bad of [
    'I want to go out', 'im hungry', 'he says he wants the ball', 'she is telling me to stop',
    '"let me out"', 'saying hello', 'my ball',
  ]) assert.throws(() => assertNotSpeech(bad), /speech|context/i, `"${bad}" should have been refused`);
});

t('NO WORDS · a context label is accepted, because a context is not an utterance', () => {
  for (const ok of [
    'at the door before a walk', 'when the postman arrives', 'cat on the wall',
    'vet waiting room', 'before dinner',
  ]) assert.equal(assertNotSpeech(ok), ok);
});

t('NO WORDS · an empty label is refused too', () => {
  for (const bad of ['', '   ', null, undefined]) assert.throws(() => assertNotSpeech(bad), /context/);
});

t('NO WORDS · nothing in a read is a sentence about the dog', () => {
  const r = read(PLAY);
  assert.ok(STATES.includes(r.state));
  // the only prose anywhere is the vet note, and only when the vet flag is up
  assert.equal(r.vet.note, null);
  const flat = JSON.stringify({ ...r, vet: undefined });
  assert.ok(!/\bsay|says|saying|tells|wants|thinks|feels\b/i.test(flat), `narration leaked: ${flat.slice(0, 200)}`);
});

t('the vet flag fires on pain-adjacent patterns and NEVER diagnoses', () => {
  const hurt = { posture: 'cower', tail: 'tucked', gaze: 'averted', mouth: 'panting' };
  const v = vetFlag(hurt);
  assert.equal(v.flag, true);
  assert.ok(v.signals.length >= 2);
  assert.match(v.note, /cannot tell them apart/, 'it must state the limit, not the cause');
  assert.ok(!/diagnos|pain is|injur(y|ed)\b/i.test(v.note.replace('consistent with pain', '')), v.note);
});

t('the vet flag does NOT fire on a happy dog, or on one lone signal', () => {
  assert.equal(vetFlag(PLAY).flag, false);
  assert.equal(vetFlag({ tail: 'tucked' }).flag, false, 'one signal is not a pattern');
  assert.equal(vetFlag({}).flag, false);
});

t('a read carries its confidence and its ambiguity flag, always', () => {
  for (const r of [read(PLAY), read(THREAT), read({ tail: 'neutral' }), read({})]) {
    assert.ok(typeof r.confidence === 'number');
    assert.ok(typeof r.checkContext === 'boolean');
    assert.equal(r.spec, SPEC);
  }
});

// ════ THE PER-DOG LAYER ═════════════════════════════════════════════════════════════════════════

t('the signature is content-addressed and order-independent', () => {
  assert.equal(signature({ tail: 'neutral', ears: 'forward' }), signature({ ears: 'forward', tail: 'neutral' }));
  assert.notEqual(signature({ tail: 'neutral' }), signature({ tail: 'tucked' }));
  assert.equal(signature({}), null);
  assert.equal(signature(null), null);
});

t('a pattern must RECUR before it is offered — one occurrence is not a signal', () => {
  const p = makeProfile('rosie');
  const paw = { posture: 'neutral', tail: 'low-slow-wag', gaze: 'soft', mouth: 'neutral' };
  observe(p, paw, { at: 1, context: 'kitchen' });
  assert.equal(newSignals(p, { threshold: 4 }).length, 0, 'once is a coincidence');
  observe(p, paw, { at: 2, context: 'kitchen' });
  observe(p, paw, { at: 3, context: 'kitchen' });
  assert.equal(newSignals(p, { threshold: 4 }).length, 0, 'three times is still under the threshold');
  observe(p, paw, { at: 4, context: 'kitchen' });
  const found = newSignals(p, { threshold: 4 });
  assert.equal(found.length, 1, 'four times is a pattern worth asking about');
  assert.equal(found[0].count, 4);
});

t('a candidate is a PATTERN, and carries no invented meaning', () => {
  const p = makeProfile('rosie');
  const dance = { posture: 'neutral', tail: 'high-loose-wag', voice: 'whine' };
  for (let i = 0; i < 5; i++) observe(p, dance, { at: i, context: 'front door' });
  const [c] = newSignals(p, { threshold: 4 });
  assert.deepEqual(c.readings, dance, 'the candidate IS the readings, nothing more');
  assert.ok(!('meaning' in c) && !('says' in c) && !('name' in c), 'no meaning may appear before the owner supplies one');
  assert.ok(c.fused.state, 'though it may say what STATE the pattern reads as');
});

t('an already-named pattern stops being offered as new', () => {
  const p = makeProfile('rosie');
  const r = { posture: 'neutral', tail: 'high-loose-wag', ears: 'forward' };
  for (let i = 0; i < 6; i++) observe(p, r, { at: i, context: 'lead comes out' });
  const sig = signature(r);
  assert.equal(newSignals(p, { threshold: 4 }).length, 1);
  label(p, sig, 'the lead dance', { context: 'when the lead comes off the hook' });
  assert.equal(newSignals(p, { threshold: 4 }).length, 0, 'a named pattern is repertoire, not a candidate');
  assert.equal(known(p, r).name, 'the lead dance');
});

t('labelling a pattern that was never observed is refused', () => {
  const p = makeProfile('rosie');
  assert.throws(() => label(p, 'deadbeef', 'a thing'), /no pattern/);
});

t('labelling with speech is refused, in the name AND in the context', () => {
  const p = makeProfile('rosie');
  const r = { posture: 'neutral', tail: 'neutral' };
  observe(p, r, { at: 1 });
  const sig = signature(r);
  assert.throws(() => label(p, sig, 'he says he wants out'), /speech/i);
  assert.throws(() => label(p, sig, 'door thing', { context: 'I want a walk' }), /speech/i);
  assert.doesNotThrow(() => label(p, sig, 'door thing', { context: 'before a walk' }));
});

t('distinct contexts are counted, so a resting posture is not promoted to a discovery', () => {
  const p = makeProfile('rosie');
  const rest = { posture: 'relaxed', tail: 'low-still', ears: 'relaxed' };
  for (let i = 0; i < 20; i++) observe(p, rest, { at: i, context: 'asleep by the fire' });
  assert.equal(newSignals(p, { threshold: 4, minContexts: 2 }).length, 0, 'one context, however often, is a habit not a signal');
  observe(p, rest, { at: 21, context: 'the car' });
  assert.equal(newSignals(p, { threshold: 4, minContexts: 2 }).length, 1);
});

t('the repertoire is this dog\'s own, most-seen first', () => {
  const p = makeProfile('rosie');
  const a = { tail: 'high-loose-wag' }, b = { tail: 'tucked' };
  for (let i = 0; i < 5; i++) observe(p, a, { at: i });
  for (let i = 0; i < 2; i++) observe(p, b, { at: i });
  label(p, signature(a), 'lead dance');
  label(p, signature(b), 'thunder');
  assert.deepEqual(repertoire(p).map(x => x.name), ['lead dance', 'thunder']);
});

t('a profile survives a round trip to JSON, patterns and labels intact', () => {
  const p = makeProfile('rosie');
  const r = { posture: 'play-bow', tail: 'loose-wide-wag' };
  for (let i = 0; i < 5; i++) observe(p, r, { at: i, context: 'garden' });
  label(p, signature(r), 'the garden invitation', { context: 'garden, after breakfast' });
  const back = profileFromJSON(JSON.parse(JSON.stringify(profileToJSON(p))));
  assert.equal(back.dog, 'rosie');
  assert.equal(back.observations, 5);
  assert.equal(back.patterns.size, 1);
  assert.equal(known(back, r).name, 'the garden invitation');
  assert.equal(newSignals(back, { threshold: 4 }).length, 0);
});

t('an empty or junk profile restores rather than throwing', () => {
  assert.equal(profileFromJSON(null).observations, 0);
  assert.equal(profileFromJSON({ patterns: [null, {}], labels: [null] }).patterns.size, 0);
});

// ════ THE TIMELINE ══════════════════════════════════════════════════════════════════════════════

t('escalation is detected, step by step', () => {
  const tl = timeline([
    { at: 0, state: 'relaxed' }, { at: 1, state: 'alert' }, { at: 2, state: 'aroused' }, { at: 3, state: 'threat-warning' },
  ]);
  assert.equal(tl.direction, 'escalating');
  assert.equal(tl.escalations.length, 3, 'each step up is a warning, and there were three');
  assert.equal(tl.peak.state, 'threat-warning');
  assert.equal(tl.deescalations.length, 0);
});

t('settling is detected too — the point is knowing which way it is going', () => {
  const tl = timeline([{ at: 0, state: 'threat-warning' }, { at: 1, state: 'alert' }, { at: 2, state: 'relaxed' }]);
  assert.equal(tl.direction, 'settling');
  assert.equal(tl.deescalations.length, 2);
});

t('a flat clip is flat, and the PEAK is still reported', () => {
  const tl = timeline([{ at: 0, state: 'relaxed' }, { at: 1, state: 'aroused' }, { at: 2, state: 'relaxed' }]);
  assert.equal(tl.direction, 'flat', 'it ended where it started');
  assert.equal(tl.peak.state, 'aroused', 'but it did not STAY there, and that matters');
  assert.equal(tl.escalations.length, 1);
  assert.equal(tl.deescalations.length, 1);
});

t('a timeline of nothing does not throw', () => {
  assert.equal(timeline([]).frames, 0);
  assert.equal(timeline(null).direction, 'flat');
  assert.equal(timeline([{ state: 'relaxed' }]).frames, 1);
  assert.equal(timeline([null, { at: 0 }, { at: 1, state: 'play' }]).frames, 1, 'a frame with no state is not a frame');
});

// ════ FUZZ · a pure kernel never throws on garbage ══════════════════════════════════════════════

t('junk input is refused or ignored, never crashed on', () => {
  for (const junk of [null, undefined, {}, [], 0, '', { tail: null }, { tail: undefined }]) {
    assert.doesNotThrow(() => fuse(junk), `fuse(${JSON.stringify(junk)})`);
    assert.doesNotThrow(() => vetFlag(junk));
    assert.doesNotThrow(() => signature(junk));
    assert.doesNotThrow(() => read(junk));
  }
  assert.doesNotThrow(() => observe(makeProfile(), null, {}));
  assert.doesNotThrow(() => timeline([1, 'x', null, {}]));
});

t('a bad reading is the ONE thing that throws, because it must be', () => {
  assert.throws(() => fuse({ tail: 'happy' }));
  assert.throws(() => read({ posture: 'wiggly' }));
});

boundaries(t);

console.log(`\n${fail === 0 ? '✓' : '✗'} doggyap  ${pass}/${pass + fail}${fail ? `  (${fail} failing)` : ''}`);
process.exit(fail === 0 ? 0 : 1);
