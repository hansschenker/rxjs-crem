---- MODULE DistinctPolicy ----
\* Generated from a Topology object. Do not edit by hand.
VARIABLE phase

Phases == {"empty", "seen", "completed", "errored"}

Init == phase = "empty"

EmptyToSeen == phase = "empty" /\ phase' = "seen"
EmptyToCompleted == phase = "empty" /\ phase' = "completed"
EmptyToErrored == phase = "empty" /\ phase' = "errored"
SeenToCompleted == phase = "seen" /\ phase' = "completed"
SeenToErrored == phase = "seen" /\ phase' = "errored"

Next == EmptyToSeen \/ EmptyToCompleted \/ EmptyToErrored \/ SeenToCompleted \/ SeenToErrored

Spec == Init /\ [][Next]_phase

TypeOK == phase \in Phases

FinalIsFinal == [][phase \in {"completed", "errored"} => UNCHANGED phase]_phase
====
