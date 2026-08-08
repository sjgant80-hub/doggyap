# doggyap — read the whole dog, not just the yap

### ▶ **https://sjgant80-hub.github.io/doggyap/**

A multi-axis dog reader. Tail, posture, ears, gaze, hackles, mouth and voice each vote; the
votes are fused into one state with a confidence score; and when the axes disagree, that
disagreement is shown rather than smoothed away.

Runs entirely on your device. Nothing is uploaded, it works offline, and it produces no words.

---

## Why multi-axis

Roughly a fifth of how a dog communicates is sound. The rest is body. A tool that listens only
to the bark reads the small channel — and reads it wrong, because the axes only make sense
together:

| | tail | posture | ears | gaze | → reads as |
|---|---|---|---|---|---|
| **A** | loose wide wag | play-bow | relaxed | soft | **play** · positive · 100% |
| **B** | high **stiff** wag | forward weight | pinned | hard stare | **threat-warning** · negative · 100% |

Both dogs are wagging. A tail-only or sound-only reader calls both of them happy. The other
axes are the only thing that can tell you which is which — and that is the entire tool.

Give it just the tail and it says so: one axis never clears the confidence bar, and the honest
answer is *go and look at the dog*.

## Confidence is agreement, not certainty

The number is the share of axis weight backing the winning read, scaled by how much of the dog
you actually looked at. It is never a measure of how sure the software feels.

Three different things make it ask you to check the context, and it says **which**, because
they are not the same problem:

- **the axes disagree** — a wagging tail with a hard stare. Not fixable by looking harder; it
  means the dog is conflicted or the situation is ambiguous.
- **too few axes read** — fixable. Read more of the dog.
- **thin agreement** — the axes lean one way but not firmly.

A **neutral** axis is reported as *quiet*, not as dissent. A frightened dog pants; panting is
not evidence the dog is fine, and counting it as disagreement would fire the warning on nearly
every read. A warning that is always on is one nobody reads.

## It learns your dog's own signals

Dogs invent signals with their own people — the paw on the knee, the door-dance, the particular
way this dog stands when the postman is due. None of that is in a universal dictionary.

So the profile watches for **recurrence**. When a multi-axis pattern keeps coming back, it is
offered as a candidate and you supply the context. That division is the whole claim:

> **The tool detects the pattern. You supply the meaning.**

A "new signal" here means *this combination has happened seven times*, never *your dog has
learned to ask for the ball*. Naming one runs a guard that **throws** on anything reading as
speech — `"he says he wants out"` is refused, `"at the door before a walk"` is accepted. A
profile can be shared, and a shared profile full of narrated dog-speech is the exact artefact
this must never produce.

## Measured versus observed

Honest about the ceiling, because it matters:

| axis | how |
|---|---|
| **voice** | **measured** — microphone: loudness and dominant pitch by autocorrelation |
| **tail** | **part measured** — camera: wag rate and amplitude by frame differencing. Height is **not** measurable without keypoints |
| posture · ears · gaze · hackles · mouth | **observed** — you tap what you can see |

Automatic tail-height, ear, gaze and hackle extraction needs a dog-pose keypoint model. There
isn't one that ships offline in a browser, so this does not pretend to have one. The measured
axes fill their chips in as suggestions you can override; the kernel never sees a reading you
did not agree to.

The fusion — the part that catches the misreads — works identically either way.

## What it is not

- **No words.** No sentence, no caption, nothing put in the dog's mouth. The output is a state
  from a fixed set of six, a confidence score, and the axes that drove it.
- **Not a diagnosis.** Pain and fear look alike from outside. Readings consistent with pain
  raise a vet flag that says exactly that and nothing more: *this tool cannot tell them apart —
  a vet can.*
- **A reader, not a mind.** It reports what the body is doing and how the axes agree, and stops.

## The gate

```bash
node doggyap.test.mjs                                          # 59 tests
node witness.mjs mutate doggyap.mjs --test "node doggyap.test.mjs"
```

**Mutation score 1.000 — 60 mutants killed, 0 survivors, 0 baselined.** Every threshold in the
reader is pinned by a case sitting exactly on it, because off-by-one here is not a rounding
error, it is calling a warning "alert".

The page imports `doggyap.mjs` directly, so the gated logic *is* the running logic.

## Files

```
doggyap.mjs      the kernel — axes, votes, fusion, vet flag, speech guard, per-dog recurrence
doggyap.test.mjs the gate, headed by the wagging-tail case
boundaries.mjs   every threshold, pinned to a case sitting on it
index.html       the one page
sw.js            offline — a dog does not wait for a signal
```

Zero dependencies. Pure and deterministic: the kernel has no I/O, no clock and no randomness.

MIT.
