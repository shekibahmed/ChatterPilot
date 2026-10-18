# Security policy

ChatterPilot processes business chats, which contain personal data. We take reports seriously.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private vulnerability reporting for this
repository (Security → Report a vulnerability). If that is not available, contact the maintainer,
[@shekibahmed](https://github.com/shekibahmed), on GitHub and ask for a private channel.

Include the version or commit, what an attacker can do, and steps to reproduce with **synthetic**
data. Never attach a real chat export.

We aim to acknowledge reports within 7 days. There is no bug bounty.

## Scope

In scope, for example:
- A crafted chat export or ZIP that writes outside the workspace, exhausts memory or disk, or
  executes code.
- Chat text that runs as a formula, script or markup in an export, the review app or an XML file.
- A web page that can read or change the local app (DNS rebinding, CSRF, missing Host checks).
- An MCP or CLI path that lets an agent accept an order, read files outside `--files`, or bypass an
  approval.
- Keys or chat content appearing in logs, errors or exports where they should not.

Out of scope: problems that need an attacker who already controls your user account, and
anything in the synthetic MockBooks demo form that does not affect the rest of the app.

## Design notes

The security model and the tests that enforce it are summarised in
[docs/patterns.md](docs/patterns.md) (sections 4–8).
