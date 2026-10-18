# Filling another system's order form — safely

Many shops already use a billing or ERP tool. The last step of the ChatterPilot workflow is to put an
accepted order into that tool without re-typing. Done carelessly, this is where automation causes
real damage: duplicate invoices, wrong prices, documents sent to the wrong customer. This part is
therefore opt-in, separate from the read-only analysis, and built around explicit approval.

**Status: proven on a synthetic local form only (MockBooks).** No real application is connected, and
submitting a document is deliberately not available in this release.

## The rules the code enforces

1. **Only accepted orders can leave.** The document sent is built from the frozen, fingerprinted
   snapshot a person accepted. Any unknown value refuses the document.
2. **An approval covers one exact thing.** It names the person, the target app and account, the
   action ("prepare a draft" or "submit"), the customer, the exact document (by hash), the catalogue
   version and an expiry (at most 60 minutes). If the document, the prices, the target or the person
   changes, or time runs out, the approval no longer applies.
3. **Chat text never grants permission.** Approvals come from a named person
   (today: `chatterpilot fill-form --operator <name> --approve`, after the document is shown; an
   approval screen in the review app is not built yet). Nothing in a message, a transcript or model
   output can approve or trigger an action. Reopening or rejecting the draft voids the approval.
4. **Check before saving.** The connector fills the form, then compares the target's own calculated
   prices and totals with the approved document. If anything differs, it stops without saving.
5. **Read back after saving.** The saved draft is read back and compared field by field. Any
   difference blocks the attempt.
6. **Never twice.** Each business document can have only one live attempt (a database constraint),
   so repeated clicks or concurrent runs cannot create duplicates.
7. **Unknown means unknown.** If the target may or may not have saved (a lost response), the
   attempt is marked `submitted_unknown` and the connector looks the draft up by its reference. One
   match: continue. None or several: stop and ask a person. It never blindly retries.
8. **Stop before Submit.** Release 1 ends at `awaiting_submit_approval`. Even a valid "submit"
   approval is refused.
9. **Stay on the approved site.** The browser connector blocks every request outside the approved
   address, and stops if a field it needs is missing or renamed rather than guessing.
10. **Everything is recorded.** Approvals, attempts and every state change are stored; the
    transition history cannot be edited or deleted.

## States

```
approved_for_draft → preparing_draft → draft_readback → awaiting_submit_approval   (release 1 stops here)
                         │                  │
                         │                  └→ blocked (read-back differs)
                         ├→ blocked (target values differ; nothing saved)
                         ├→ failed_before_side_effect (layout changed; safe to retry later)
                         └→ submitted_unknown → draft_readback (found by reference)
                                              → (stays; a person must check)
```

Later states (`approved_to_submit → submitting → verified_complete`) exist in the model and are
refused by the code until a real target, its document semantics and the owner's explicit authority
are in place.

## What the tests prove (synthetic MockBooks form)

- Two different orders, with two lines and one line, are prepared and read back exactly; the
  Submit button is never used.
- A target that charges a different price is caught before anything is saved.
- A renamed form field stops the run with nothing saved; a later run can retry.
- A lost save confirmation is reconciled to the one saved draft, not saved again.
- When the connection drops after saving, the browser itself may retry the request and create a
  second draft. Reconciliation finds two matches and stops for a person instead of picking one.
- Requests to any other address are blocked.
- A read-back of a record that is no longer a draft (for example already submitted) is blocked.
- A blocked or unknown attempt stays locked until a person closes it with a reason.

## What is still needed before a real system

- The owner's genuine Codegen recording of the synthetic form
  ([recording guide](../fixtures/mock-order-app/recording/README.md)); the current connector is
  labelled hand-written.
- A named target app and account, its meaning of "save", "submit" and "send", a sandbox,
  read-only discovery, then draft-only tests. API or file import is preferred over browser filling
  when the target offers one. Native desktop software (for example a local Tally installation) needs
  a different connector; a browser connector cannot drive it.
