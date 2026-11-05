---- MODULE ProtocolPolicy ----
\* Generated from a Topology object. Do not edit by hand.
VARIABLE phase

Phases == {"active", "completed", "errored"}

Init == phase = "active"

ActiveToCompleted == phase = "active" /\ phase' = "completed"
ActiveToErrored == phase = "active" /\ phase' = "errored"

Next == ActiveToCompleted \/ ActiveToErrored

Spec == Init /\ [][Next]_phase

TypeOK == phase \in Phases

FinalIsFinal == [][phase \in {"completed", "errored"} => UNCHANGED phase]_phase
====
