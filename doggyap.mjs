// doggyap.mjs — read the whole dog, not just the yap.
//
// Vocalisation is a small part of how a dog communicates. Tail, posture, ears, gaze, hackles and
// mouth carry most of it, and a tool that listens only to sound reads the small channel and misses
// the big one. Worse, it reads the small channel WRONG: "the tail is wagging" is not a state, and a
// sound-or-tail-alone reader calls a stiff high wag joy when it is a warning.
//
// So every axis votes, and the votes are FUSED. The axes disambiguate each other, which is the whole
// point — and when they disagree, that disagreement is surfaced rather than averaged away, because a
// conflicted dog is a real thing and hiding it is how a reader becomes a liar.
//
// ══ WHAT THIS IS NOT ════════════════════════════════════════════════════════════════════════════
//
// It does not produce words. There is no sentence, no caption, no "he's saying he wants to play."
// The output is a STATE from a closed set, an arousal and valence band, a confidence number, and the
// axes that drove it. `label()` throws on anything that reads as speech put in the dog's mouth —
// publishable by construction rather than by discipline.
//
// It is not a diagnosis. Pain and illness change posture, and this cannot tell you which. Readings
// that are consistent with pain raise a vet flag and nothing more.
//
// It is a READER, not a mind. The ceiling is named: it reports what the body is doing and how the
// axes agree, and stops there.
//
// Pure and deterministic: no I/O, no clock, no randomness. Every input is passed in.

export const VERSION = '0.1.0';
export const SPEC = 'doggyap-v1';

// ── THE AXES ────────────────────────────────────────────────────────────────────────────────────
//
// A closed vocabulary per axis. Closed on purpose: an open one drifts into description, description
// drifts into narration, and narration is the thing this refuses to do. Each reading carries the
// arousal band and valence it votes for, and `weight` is how much that axis is trusted.
//
// Weights are not arbitrary. Voice is deliberately the LIGHTEST — it is roughly a fifth of the
// signal and it is the axis that misleads. Posture is heaviest because posture cannot dissemble: it
// is the state, unmediated, load-bearing and continuous.

export const AROUSAL = Object.freeze(['low', 'medium', 'high']);
export const VALENCE = Object.freeze(['negative', 'neutral', 'positive']);

const R = (arousal, valence) => ({ arousal, valence });

export const AXES = Object.freeze({
  voice: {
    weight: 1,            // ~20% of the signal, and the one that fools a sound-only tool
    measured: true,       // computable from a microphone
    readings: {
      silent: R('low', 'neutral'),
      pant: R('medium', 'neutral'),
      'yip-play': R('high', 'positive'),
      whine: R('medium', 'negative'),
      'growl-low': R('medium', 'negative'),
      'bark-sharp': R('high', 'negative'),
      'bark-repetitive': R('high', 'neutral'),
      howl: R('medium', 'neutral'),
    },
  },
  tail: {
    weight: 2,
    measured: 'partial',  // rate, amplitude and side-bias are measurable; HEIGHT is not — see SPEC.md
    readings: {
      tucked: R('medium', 'negative'),
      'low-still': R('low', 'neutral'),
      'low-slow-wag': R('low', 'positive'),
      neutral: R('low', 'neutral'),
      'loose-wide-wag': R('medium', 'positive'),
      'high-still': R('medium', 'neutral'),
      'high-stiff-wag': R('high', 'negative'),   // the classic misread — fast, high, and NOT joy
      'high-loose-wag': R('high', 'positive'),
    },
  },
  posture: {
    weight: 3,            // heaviest: posture is the state, not a report of it
    measured: false,
    readings: {
      relaxed: R('low', 'positive'),
      'play-bow': R('high', 'positive'),
      neutral: R('low', 'neutral'),
      'forward-weight': R('high', 'negative'),
      'back-weight': R('medium', 'negative'),
      cower: R('medium', 'negative'),
      freeze: R('high', 'negative'),
      'tall-stiff': R('high', 'negative'),
    },
  },
  ears: {
    weight: 2,
    measured: false,
    readings: {
      relaxed: R('low', 'positive'),
      neutral: R('low', 'neutral'),
      forward: R('high', 'neutral'),
      back: R('medium', 'negative'),
      pinned: R('high', 'negative'),
    },
  },
  gaze: {
    weight: 2,
    measured: false,
    readings: {
      soft: R('low', 'positive'),
      neutral: R('low', 'neutral'),
      averted: R('medium', 'negative'),
      'hard-stare': R('high', 'negative'),
      'whale-eye': R('high', 'negative'),        // whites showing — stress, and often missed
    },
  },
  hackles: {
    weight: 1,
    measured: false,
    readings: {
      flat: R('low', 'neutral'),
      raised: R('high', 'neutral'),              // arousal, NOT necessarily aggression
    },
  },
  mouth: {
    weight: 1,
    measured: false,
    readings: {
      'loose-open': R('low', 'positive'),
      panting: R('medium', 'neutral'),
      neutral: R('low', 'neutral'),
      'tight-closed': R('medium', 'negative'),
      'lip-lift': R('high', 'negative'),
    },
  },
});

export const AXIS_NAMES = Object.freeze(Object.keys(AXES));

/** Every reading this kernel understands, per axis. The UI builds itself from this. */
export function vocabulary() {
  return Object.fromEntries(AXIS_NAMES.map(a => [a, {
    weight: AXES[a].weight, measured: AXES[a].measured, readings: Object.keys(AXES[a].readings),
  }]));
}

// ── VOTES ───────────────────────────────────────────────────────────────────────────────────────

/**
 * One axis's vote.
 *
 * THROWS on an unknown axis or an unknown reading rather than skipping it. A silently ignored axis
 * is the failure this whole design exists to prevent — the fusion's confidence is a statement about
 * how many axes agreed, and it is a lie if an axis was quietly dropped on the way in.
 */
export function vote(axis, reading) {
  const spec = AXES[axis];
  if (!spec) throw new Error(`unknown axis "${axis}" — the axes are ${AXIS_NAMES.join(', ')}`);
  const r = spec.readings[reading];
  if (!r) throw new Error(`unknown ${axis} reading "${reading}" — expected one of ${Object.keys(spec.readings).join(', ')}`);
  return { axis, reading, arousal: r.arousal, valence: r.valence, weight: spec.weight };
}

/** Turn `{tail: 'high-stiff-wag', gaze: 'hard-stare'}` into votes. Absent axes simply do not vote. */
export function votes(readings) {
  const out = [];
  for (const [axis, reading] of Object.entries(readings || {})) {
    if (reading == null || reading === '') continue;    // "not observed" is not "unknown reading"
    out.push(vote(axis, reading));
  }
  return out;
}

// ── FUSION ──────────────────────────────────────────────────────────────────────────────────────

const tally = (vs, key) => {
  const t = new Map();
  for (const v of vs) t.set(v[key], (t.get(v[key]) || 0) + v.weight);
  return t;
};

/** Heaviest band wins; ties break toward the more cautious reading, never toward the happier one. */
function winner(t, order) {
  let best = null, bestW = -1;
  for (const band of order) {
    const w = t.get(band) || 0;
    if (w > bestW) { best = band; bestW = w; }
  }
  return { band: best, weight: bestW, total: [...t.values()].reduce((a, b) => a + b, 0) };
}

// Tie-break order for valence: negative first, so a split decision lands on the more careful of the
// two readings. Calling an ambiguous dog "positive" is the failure with a bite at the end of it.
const VALENCE_ORDER = Object.freeze(['negative', 'neutral', 'positive']);

// ── AROUSAL IS NOT A VOTE ───────────────────────────────────────────────────────────────────────
//
// Valence genuinely is a contest: a positive tail and a negative stare are making opposite claims
// about the same dog, and the heavier axes should win. Arousal is not like that. Arousal is ENERGY,
// and energy is present or absent — a low-arousal reading is the absence of a claim, not a claim
// against.
//
// MEASURED, on the play case this whole tool is built to get right: a play-bow, a wide loose wag, a
// play-yip, relaxed ears, soft eyes, loose mouth. Four of those six axes vote LOW arousal and by
// majority the dog is "relaxed" — which is wrong, and wrong in the most obvious situation there is.
// A dog mid-play HAS a soft face and IS highly aroused; the soft face is not evidence against the
// bounce. Counting it as a vote cancels the very signal that identifies play.
//
// So arousal is a weighted mean of the energy each axis reports, and the bands are read off that.
// Nothing cancels; a single high-energy axis lifts the read, which is how arousal actually works.
const ENERGY = Object.freeze({ low: 0, medium: 0.5, high: 1 });
export const LOW_BAND = 0.25;     // below this the dog is at rest
export const HIGH_BAND = 0.7;     // at or above this it is properly wound up
export const CONFIDENT = 0.6;     // at or above this the axes agree enough to act on

function arousalOf(vs) {
  let sum = 0, total = 0;
  for (const v of vs) { sum += ENERGY[v.arousal] * v.weight; total += v.weight; }
  const mean = total ? sum / total : 0;
  return { band: mean < LOW_BAND ? 'low' : mean < HIGH_BAND ? 'medium' : 'high', mean: round(mean) };
}

/**
 * The state table. Six states, closed set, no sentences.
 *
 * `distress` covers the negative side at low and medium arousal — a shut-down dog and an uneasy one
 * both need the same response from a human, which is space.
 */
export const STATES = Object.freeze(['relaxed', 'play', 'alert', 'aroused', 'distress', 'threat-warning']);

const TABLE = {
  'low|positive': 'relaxed', 'low|neutral': 'relaxed', 'low|negative': 'distress',
  'medium|positive': 'play', 'medium|neutral': 'alert', 'medium|negative': 'distress',
  'high|positive': 'play', 'high|neutral': 'aroused', 'high|negative': 'threat-warning',
};

export function stateOf(arousal, valence) {
  const s = TABLE[`${arousal}|${valence}`];
  if (!s) throw new Error(`no state for arousal "${arousal}" valence "${valence}"`);
  return s;
}

/**
 * Fuse the axes into one read.
 *
 * CONFIDENCE IS AGREEMENT, and nothing else. It is the share of axis weight backing the winning
 * band, so it falls automatically when the dog is conflicted or the observation is partial. It is
 * never a measure of how sure the software feels.
 *
 * `conflict` names the axes voting against the majority. That list is the most useful thing here:
 * "tail says positive, gaze and posture say negative" is exactly the moment a person should stop and
 * look again, and a tool that averages it into a smooth answer has taken that moment away.
 */
export function fuse(readings, { minAxes = 2 } = {}) {
  const vs = votes(readings);
  if (vs.length === 0) {
    return { state: null, arousal: null, valence: null, confidence: 0, axes: 0, drivers: [], conflict: [], checkContext: true, why: 'nothing observed' };
  }
  const ar = arousalOf(vs);
  const vw = winner(tally(vs, 'valence'), VALENCE_ORDER);

  // AGREEMENT IS ABOUT VALENCE, because that is where the disagreements that matter live. A dog with
  // a soft face and a bouncing body is not conflicted, it is playing; a dog with a wagging tail and a
  // hard stare IS conflicted, and that is the one a person needs flagging. Spreading the measure
  // across arousal too would fire the warning on every happy dog and teach people to ignore it.
  const agreement = vw.weight / vw.total;
  // heaviest first, so the read names the axes carrying the most of the decision
  const drivers = vs.filter(v => v.valence === vw.band).sort((a, b) => b.weight - a.weight).map(v => v.axis);

  // CONFLICT IS OPPOSITION, NOT ABSTENTION. A neutral axis is not arguing with the majority, it is
  // saying nothing — a panting mouth on a frightened dog is not evidence the dog is fine. Counting
  // neutrals as dissent fires the "check the context" warning on almost every read, and a warning
  // that is always on is a warning nobody reads. Neutrals are reported separately as `quiet`.
  const opposite = vw.band === 'positive' ? 'negative' : vw.band === 'negative' ? 'positive' : null;
  const conflict = vs.filter(v => opposite ? v.valence === opposite : v.valence !== 'neutral')
    .map(v => ({ axis: v.axis, reading: v.reading, valence: v.valence }));
  const quiet = vs.filter(v => v.valence === 'neutral' && vw.band !== 'neutral').map(v => v.axis);

  // Partial observation cannot buy full confidence. One axis agreeing with itself is not agreement,
  // so the score is scaled by how much of the dog was actually read.
  const coverage = Math.min(1, vs.length / Math.max(1, minAxes + 1));
  const confidence = round(agreement * coverage);

  // The honest flag, and WHY. Three different situations all mean "do not act on this alone" to the
  // person holding the lead, but they mean different things to the person holding the camera: the
  // axes disagree, or too little of the dog was read, or the agreement is thin. Reported separately
  // so the tool can say which — "you have only read the tail" is a fixable problem and "the tail and
  // the face disagree" is not.
  const flags = {
    lowConfidence: confidence < CONFIDENT,
    tooFewAxes: vs.length < minAxes,
    dissent: conflict.length > 0,
  };

  return {
    state: stateOf(ar.band, vw.band),
    arousal: ar.band, arousalLevel: ar.mean, valence: vw.band,
    confidence, agreement: round(agreement), coverage: round(coverage),
    axes: vs.length, drivers, conflict, quiet, flags,
    checkContext: flags.lowConfidence || flags.tooFewAxes || flags.dissent,
    votes: vs,
  };
}

const round = (x) => Math.round(x * 1000) / 1000;

// ── THE VET FLAG ────────────────────────────────────────────────────────────────────────────────

// Readings that are consistent with pain as well as with fear. This cannot tell the two apart and
// does not try — it says "a vet can", which is the only honest thing a body-reader can say here.
const PAIN_ADJACENT = Object.freeze({
  posture: ['cower', 'back-weight', 'freeze'],
  tail: ['tucked'],
  mouth: ['tight-closed', 'panting'],
  gaze: ['whale-eye', 'averted'],
  voice: ['whine'],
});

/**
 * Does this read warrant a vet? Deliberately generous: it fires on a pattern that is USUALLY fear,
 * because the cost of a needless vet mention is nothing and the cost of missing pain is a dog in
 * pain. Returns the signals, never a diagnosis.
 */
export function vetFlag(readings) {
  const hits = [];
  for (const [axis, list] of Object.entries(PAIN_ADJACENT)) {
    const r = (readings || {})[axis];
    if (r && list.includes(r)) hits.push({ axis, reading: r });
  }
  return {
    flag: hits.length >= 2,
    signals: hits,
    // one sentence, about the human's next action — never about what the dog is "saying"
    note: hits.length >= 2 ? 'These signals are consistent with pain as well as with fear. This tool cannot tell them apart — a vet can.' : null,
  };
}

// ── THE HONESTY GUARD ───────────────────────────────────────────────────────────────────────────

// Words put in a dog's mouth, and the shapes they arrive in. A label is a CONTEXT — "at the door
// before a walk", "when the neighbour's cat is on the wall" — never an utterance.
const SPEECH = [
  /\b(i|i'm|im|i am|me|my|mine)\b/i,          // first person: the dog talking
  /\b(he|she|they|it)\s+(is\s+)?(say|says|saying|said|tell|tells|telling|wants|means|thinks|feels)\b/i,
  /["“”']\s*\w+.*["“”']/,                      // a quoted utterance
  /\b(says?|saying|said|telling)\b/i,
];

/**
 * Reject a label that reads as speech.
 *
 * THROWS rather than warns. The difference matters: a warning is a thing a hurried person clicks
 * past, and one narrated label in a shared profile turns the whole tool into the thing it refuses to
 * be. The guard makes that state unreachable instead of discouraged.
 */
export function assertNotSpeech(label) {
  const s = String(label == null ? '' : label).trim();
  if (!s) throw new Error('a label needs a context — what was happening, not what the dog "said"');
  for (const p of SPEECH) {
    if (p.test(s)) {
      throw new Error(`"${s}" reads as speech. Label the CONTEXT it happens in — "at the door before a walk" — not what the dog is saying. This tool reports states, never words.`);
    }
  }
  return s;
}

// ── THE PER-DOG LAYER ───────────────────────────────────────────────────────────────────────────
//
// Dogs invent signals with their own people: the paw on the knee that means one specific thing in
// one specific house, the door-dance, the particular way this dog stands when the postman is due.
// None of that is in a universal dictionary, and imposing one would miss exactly the signals that
// matter most to the person who lives with the dog.
//
// So the profile watches for RECURRENCE. A pattern of readings that keeps coming back is flagged as
// a candidate, and the owner supplies the context. That division is the honest one and it is the
// whole claim: THE TOOL DETECTS THE PATTERN, THE OWNER SUPPLIES THE MEANING. A "new signal" here is
// "this combination has happened seven times", not "your dog has learned to ask for the ball".

/** Content signature of a multi-axis pattern. Order-independent, so the same read always signs the same. */
export function signature(readings) {
  const parts = AXIS_NAMES
    .filter(a => (readings || {})[a])
    .map(a => `${a}:${readings[a]}`);
  return parts.length ? h32(parts.join('|')) : null;
}

/** FNV-1a, 32-bit, hex. Deterministic across platforms and runs. */
function h32(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function makeProfile(dog = 'dog') {
  return { spec: SPEC, dog, patterns: new Map(), labels: new Map(), observations: 0 };
}

/**
 * Record one observation. `at` is supplied by the caller — this module owns no clock.
 *
 * Keeps the first and last time a pattern was seen and how many distinct contexts it appeared in.
 * Count alone would promote a dog's resting posture to a discovery; a pattern that recurs across
 * DIFFERENT situations is the interesting one, and the profile keeps both numbers so the threshold
 * can ask for either.
 */
export function observe(profile, readings, { at = null, context = null } = {}) {
  const sig = signature(readings);
  if (!sig) return null;
  profile.observations++;
  const p = profile.patterns.get(sig) || { sig, readings: { ...readings }, count: 0, contexts: [], first: at, last: at };
  p.count++;
  p.last = at;
  if (p.first == null) p.first = at;
  if (context && !p.contexts.includes(context)) p.contexts.push(context);
  profile.patterns.set(sig, p);
  return p;
}

/**
 * The candidates: patterns that keep recurring and have not been named yet.
 *
 * These are offered as a question, never asserted as a finding. The wording in the UI is "your dog
 * does a consistent thing here — what is happening when it does?", which is a request for the one
 * piece of information the software genuinely does not have.
 */
export function newSignals(profile, { threshold = 4, minContexts = 1 } = {}) {
  const out = [];
  for (const p of profile.patterns.values()) {
    if (profile.labels.has(p.sig)) continue;
    if (p.count < threshold) continue;
    if (p.contexts.length < minContexts) continue;
    out.push({ ...p, fused: fuse(p.readings) });
  }
  return out.sort((a, b) => b.count - a.count || a.sig.localeCompare(b.sig));
}

/**
 * Name a recurring pattern with the context it happens in.
 *
 * Runs the speech guard. A label that reads as an utterance is refused outright — the profile can
 * be shared, and a shared profile full of narrated dog-speech is the exact artefact this must never
 * produce.
 */
export function label(profile, sig, name, { context = null } = {}) {
  const clean = assertNotSpeech(name);
  if (!profile.patterns.has(sig)) throw new Error(`no pattern ${sig} in this profile — label what was actually observed`);
  const entry = { sig, name: clean, context: context ? assertNotSpeech(context) : null, count: profile.patterns.get(sig).count };
  profile.labels.set(sig, entry);
  return entry;
}

/** Has this dog's own repertoire got a name for what is happening right now? */
export function known(profile, readings) {
  const sig = signature(readings);
  return sig ? (profile.labels.get(sig) || null) : null;
}

/** The dog's learned repertoire, most-seen first. */
export function repertoire(profile) {
  return [...profile.labels.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ── THE TIMELINE ────────────────────────────────────────────────────────────────────────────────

const RANK = { relaxed: 0, play: 1, alert: 2, aroused: 3, distress: 3, 'threat-warning': 4 };

/**
 * Escalation over a clip.
 *
 * The single most useful output for training, reactivity work and a vet visit is not the state at
 * any one moment — it is whether it is climbing. A dog going alert → aroused → threat-warning has
 * given three warnings, and the whole point of watching is to act on the first one.
 */
export function timeline(frames) {
  const seq = (frames || []).filter(f => f && f.state).map(f => ({ ...f, rank: RANK[f.state] ?? 0 }));
  if (seq.length < 2) return { frames: seq.length, direction: 'flat', peak: seq[0] || null, escalations: [], deescalations: [] };
  const escalations = [], deescalations = [];
  for (let i = 1; i < seq.length; i++) {
    const d = seq[i].rank - seq[i - 1].rank;
    if (d > 0) escalations.push({ at: seq[i].at ?? i, from: seq[i - 1].state, to: seq[i].state });
    else if (d < 0) deescalations.push({ at: seq[i].at ?? i, from: seq[i - 1].state, to: seq[i].state });
  }
  const net = seq[seq.length - 1].rank - seq[0].rank;
  let peak = seq[0];
  for (const f of seq) if (f.rank > peak.rank) peak = f;
  return {
    frames: seq.length,
    direction: net > 0 ? 'escalating' : net < 0 ? 'settling' : 'flat',
    peak, escalations, deescalations,
  };
}

// ── THE WHOLE READ ──────────────────────────────────────────────────────────────────────────────

/**
 * One call, everything: the fused state, the vet flag, and whether this dog's own profile has a
 * name for it.
 *
 * Returns no prose about the dog. The only sentence anywhere in this module's output is the vet
 * note, and that one is addressed to the human about what to do next.
 */
export function read(readings, { profile = null, minAxes = 2 } = {}) {
  const f = fuse(readings, { minAxes });
  const vet = vetFlag(readings);
  return {
    ...f,
    vet: vet.flag ? vet : { flag: false, signals: vet.signals, note: null },
    learned: profile ? known(profile, readings) : null,
    spec: SPEC,
  };
}

// ── STATE ───────────────────────────────────────────────────────────────────────────────────────

export function profileToJSON(profile) {
  return {
    spec: profile.spec, dog: profile.dog, observations: profile.observations,
    patterns: [...profile.patterns.values()],
    labels: [...profile.labels.values()],
  };
}

export function profileFromJSON(o) {
  const p = makeProfile((o && o.dog) || 'dog');
  if (!o) return p;
  p.observations = o.observations || 0;
  for (const x of (o.patterns || [])) if (x && x.sig) p.patterns.set(x.sig, { contexts: [], ...x });
  for (const x of (o.labels || [])) if (x && x.sig) p.labels.set(x.sig, x);
  return p;
}

export default {
  VERSION, SPEC, AXES, AXIS_NAMES, AROUSAL, VALENCE, STATES,
  vocabulary, vote, votes, fuse, stateOf, vetFlag, assertNotSpeech,
  makeProfile, signature, observe, newSignals, label, known, repertoire,
  timeline, read, profileToJSON, profileFromJSON,
};
