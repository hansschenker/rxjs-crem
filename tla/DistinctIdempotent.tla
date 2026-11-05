---- MODULE DistinctIdempotent ----
\* Law dUC . dUC = dUC, checked as a lockstep product of two Mealy machines.
CONSTANTS Values, None
VARIABLES a, b1, b2, outA, outB
vars == <<a, b1, b2, outA, outB>>

Init == a = None /\ b1 = None /\ b2 = None
        /\ outA = <<>> /\ outB = <<>>

Step(v) ==
  \* left side: one distinctUntilChanged
  /\ a' = v
  /\ outA' = IF v # a THEN <<v>> ELSE <<>>
  \* right side: distinctUntilChanged feeding distinctUntilChanged
  /\ b1' = v
  /\ LET mid == IF v # b1 THEN <<v>> ELSE <<>>
     IN /\ b2'   = IF mid = <<>> THEN b2 ELSE v
        /\ outB' = IF mid # <<>> /\ v # b2 THEN <<v>> ELSE <<>>

Next == \E v \in Values : Step(v)
Spec == Init /\ [][Next]_vars

LawHolds == outA = outB
====
