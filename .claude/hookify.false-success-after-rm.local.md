---
name: block-false-success-after-rm
enabled: true
event: bash
action: block
conditions:
  - field: command
    operator: regex_match
    pattern: (^|&&|;|\||\()\s*rm\s+(-\w+\s+)*-?\w*f\w*\s+[^&|;]*&&
---

🚫 **Success message chained after `rm -f` — blocked**

`rm -f` on a path that does not exist **exits 0 by design**. Anything you chain
after `&&` therefore runs whether or not a file was actually deleted, and prints
a confirmation that may be false.

**This produced a false verification in task 1.2a:**

```sh
rm -f apps/web/src/spike-adapter.ts && echo "spike removed"
# → printed "spike removed"
# → deleted nothing (shell was in packages/db, relative path matched no file)
# → exited 0
```

The lie stood until a later `ls` happened to contradict it. A false confirmation
is worse than an error: an error gets investigated, a success does not.

**Do this instead:**

```sh
# Report what was actually removed
rm -v D:\work\AIFlow\apps\web\src\spike-adapter.ts

# Or verify separately, as its own observable step
rm -f D:\work\AIFlow\apps\web\src\spike-adapter.ts
ls D:\work\AIFlow\apps\web\src\
```

**The general rule this stands for:** a zero exit code means the command _ran_,
not that it did what you intended. When a command reports success, confirm the
effect — especially for deletes, and especially when the path is relative.

See `docs/17-session-review.md` § 3.9.
