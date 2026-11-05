// Checks that connect the models to real RxJS operators.
// Each check takes one input and returns true if it holds,
// so the same functions run under fast-check and in the browser.
import { Observable, identity as rxIdentity, map, pipe, type OperatorFunction } from "rxjs";
import { compose, run, type Mealy, type Note } from "./mealy";

/** Replay notifications through a real RxJS operator and record what comes out. */
export const runRx = <A, B>(operator: OperatorFunction<A, B>, inputs: readonly Note<A>[]): Note<B>[] => {
  const source = new Observable<A>((sub) => {
    for (const n of inputs) {
      if (n.kind === "N") sub.next(n.value);
      else if (n.kind === "C") sub.complete();
      else sub.error(n.error);
    }
  });
  const out: Note<B>[] = [];
  source.pipe(operator).subscribe({
    next: (value) => out.push({ kind: "N", value }),
    complete: () => out.push({ kind: "C" }),
    error: (error) => out.push({ kind: "E", error }),
  });
  return out;
};

export const sameNotes = <T>(a: readonly Note<T>[], b: readonly Note<T>[]): boolean =>
  a.length === b.length &&
  a.every((x, i) => {
    const y = b[i];
    if (x.kind !== y.kind) return false;
    if (x.kind === "N" && y.kind === "N") return Object.is(x.value, y.value);
    if (x.kind === "E" && y.kind === "E") return x.error === y.error;
    return true;
  });

/** Protocol: at most one terminal notification, and it is the last one. */
export const wellFormed = <T>(ns: readonly Note<T>[]): boolean => {
  const t = ns.findIndex((n) => n.kind !== "N");
  return t === -1 || t === ns.length - 1;
};

// --- Idea 2: the Mealy model as oracle -------------------------------------

/** The real operator produces exactly what its model produces. */
export const matchesModel =
  <S, A, B>(model: Mealy<S, Note<A>, Note<B>>, operator: OperatorFunction<A, B>) =>
  (inputs: readonly Note<A>[]): boolean =>
    sameNotes(run(model, inputs), runRx(operator, inputs));

/** Homomorphism: the model of pipe(f, g) is the composition of the models. */
export const pipeMatchesCompose =
  <S1, S2, A, B, O>(
    mf: Mealy<S1, Note<A>, Note<B>>, f: OperatorFunction<A, B>,
    mg: Mealy<S2, Note<B>, Note<O>>, g: OperatorFunction<B, O>,
  ) =>
  (inputs: readonly Note<A>[]): boolean =>
    sameNotes(run(compose(mf, mg), inputs), runRx(pipe(f, g), inputs));

// --- Idea 1: Category and Profunctor laws on real RxJS ---------------------

export const leftIdentity =
  <A, B>(f: OperatorFunction<A, B>) =>
  (inputs: readonly Note<A>[]): boolean =>
    sameNotes(runRx(pipe(rxIdentity, f), inputs), runRx(f, inputs));

export const rightIdentity =
  <A, B>(f: OperatorFunction<A, B>) =>
  (inputs: readonly Note<A>[]): boolean =>
    sameNotes(runRx(pipe(f, rxIdentity), inputs), runRx(f, inputs));

export const associativity =
  <A, B, X, O>(f: OperatorFunction<A, B>, g: OperatorFunction<B, X>, h: OperatorFunction<X, O>) =>
  (inputs: readonly Note<A>[]): boolean =>
    sameNotes(runRx(pipe(pipe(f, g), h), inputs), runRx(pipe(f, pipe(g, h)), inputs));

/** rmap fusion: op then map(f) then map(g) equals op then map(g . f). */
export const mapFusion =
  <A, B, X, O>(op: OperatorFunction<A, B>, f: (b: B) => X, g: (x: X) => O) =>
  (inputs: readonly Note<A>[]): boolean =>
    sameNotes(runRx(pipe(op, map(f), map(g)), inputs), runRx(pipe(op, map((b: B) => g(f(b)))), inputs));

/** Every operator output obeys the protocol when the input does. */
export const preservesProtocol =
  <A, B>(f: OperatorFunction<A, B>) =>
  (inputs: readonly Note<A>[]): boolean =>
    !wellFormed(inputs) || wellFormed(runRx(f, inputs));
