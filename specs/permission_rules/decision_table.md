Mutating tool + path in allowlist => No prompt (auto allow)

Mutating tool + test folder path => Auto allow (if configured)

Mutating tool + dockerfile or github workflows => Always require explicit user approval

bash commands that are potentially destructive (rm -rf, sudo) => Block unless explicit allowlist

Multi-file edits touching many modules => High risk => require tests pass + user approval