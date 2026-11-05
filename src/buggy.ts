// A deliberately wrong operator, to show what a failing check looks like.
import { Observable, type MonoTypeOperatorFunction } from "rxjs";

/** Bug: compares each value with the FIRST value instead of the previous one. */
export const buggyDistinct =
  <T>(): MonoTypeOperatorFunction<T> =>
  (source) =>
    new Observable<T>((sub) => {
      let first: { v: T } | undefined;
      return source.subscribe({
        next: (v) => {
          if (first === undefined) {
            first = { v };
            sub.next(v);
          } else if (v !== first.v) sub.next(v);
        },
        error: (e) => sub.error(e),
        complete: () => sub.complete(),
      });
    });
