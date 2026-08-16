# `sys-tui` — a resource monitor as the third example

A third consumer, and it is the one that would get used. **htop's job, built on Calcium.**

---

## Why a third example, and what it finds that the others cannot

**Each example has found a different class of gap**, which is the argument for a third rather
than a bigger second:

```
docker-tui   the BLOCK VOCABULARY      eight wrong drawings, the change axis, F30/F49/F51
agent-tui    INTERACTION and CHROME    the activity region, five popup consumers, the footer
sys-tui      DENSITY and UPDATE RATE   ← the untested axis
```

**And three far sides of three shapes:**

```
docker-tui   a subprocess           spawn, parse JSON, settle
agent-tui    HTTP, streaming        typed parts arriving over time
sys-tui      THE OS ITSELF          /proc, sysctl, wmic — no process, no network, no daemon
```

**The third is the cheapest to run**, which matters more than it sounds: `clone and run` needs
no docker daemon and no model server. **It works on any machine, immediately**, which is what
an example is for.

---

## What it exercises that nothing has

**Every part is live, forever.** docker-tui's live parts are bounded — a container list
settles. A monitor is **all live, indefinitely**, which is the refresh driver's real load case
and nothing has run it.

**The shared poller at its actual scale.** CPU, memory, load, swap and uptime come from **one
`/proc/stat` read**. That is F91's source-sharing mechanism with the consumer it was designed
for — docker-tui shares one source between two parts; this shares one between six.

**A big table that changes every tick.** Hundreds of processes, sorted, filtered, and the row
set is different each second. **C11 and C14's virtualisation under real pressure**, and the
first consumer where *a row that vanished between frames* is ordinary rather than exceptional.

**Plots as the primary content, with a non-ML consumer.** CPU history, memory over time,
network throughput. **That is the ML package's machinery tested by something that is not
Prism**, which is a better check than a single consumer.

**Actions on rows, and they are destructive.** Kill, renice, signal. C26's dispatch with a
confirm, and **the `⏎ on a focused row` case with real consequences** — a mis-aimed kill is
worse than a mis-aimed `docker rm`.

**And sorting and filtering as interaction.** Click a column header; type to filter. **Nothing
in either existing example does either**, and both are things every table in every TUI has.

---

## The frame

```
sys-tui                                    up 4d 12h   load 1.24 0.98 0.87   22:13

┌ cpu ──────────────────────────────┐ ┌ memory ─────────────────────────────┐
  ╭─╮      ╭╮                          ▮▮▮▮▮▮▮▮▮▮▮▮▮▮▰▰▰▰░░░░░░  11.2/32 GB
 ╭╯ ╰─╮  ╭─╯╰──╮   ╭──╮                used 8.1   cache 3.1   free 20.8
╭╯    ╰──╯     ╰───╯  ╰──   34%        swap ▮▮░░░░░░░░░░░░░░░░░░  0.4/8 GB
  0  1  2  3  4  5  6  7
  ▮▮ ▮  ▮▮▮ ▮ ▮▮▮▮ ▮▮ ▮  per core    net ↑ 1.2 MB/s  ↓ 8.4 MB/s
└───────────────────────────────────┘ └─────────────────────────────────────┘

  PID  USER      CPU%   MEM%   TIME      COMMAND                    ▲ CPU%
 4821  malachy   38.2    4.1   1:24:07   node --max-old-space
 1204  root      12.4    0.8   4d 2:11   dockerd
 8837  malachy    8.1   11.2   0:03:44   chrome --type=renderer
 2291  malachy    4.0    2.2   0:41:12   ghostty
  ...

──────────────────────────────────────────────────────────────────────────────
❯ ▌
──────────────────────────────────────────────────────────────────────────────
 ⌥f filter   ⌥s sort   ⏎ actions   ⌥k kill   ⌥h help          247 procs   1s
```

**And it is a shell, not a dashboard** — which is what makes it a Calcium app rather than an
htop clone. `/top`, `/kill 4821`, `/watch node`, `/tree`, `/net` are verbs, and **the dashboard
is what `/top` shows**. The transcript keeps what you did.

---

## What it needs that does not exist

**This is the app most blocked on unbuilt features**, and that is either a reason to wait or
the reason to build it — it is the forcing function for four of them.

| | why | roadmap |
|---|---|---|
| **scrollable containers** | a 247-row process table inside a bounded region | **#46, blocked on 7** |
| **`height: "fill"`** | the table takes what the plots leave | **38's remaining half** |
| **the chrome question** | a header, a footer, and two bordered regions | **#29** |
| **sorting** | click a header, cycle the key | not on the list |
| **filtering** | type to narrow a live table | not on the list |
| **bar · sparkline in cells** | the per-core strip, the memory bars | #3, and sparkline ships |

**Sorting and filtering are the two nobody has filed**, and they are what every table wants.
**A live table that sorts is a different problem from a static one** — the row order changes
under the reader's focus, which is C26 I10's fall-forward at every tick rather than
occasionally.

---

## What termplot contributes, since it is the closest prior art

**Its config DSL is `b.group` under another name:**

```
col do
  row do
    histogram  title: "CPU (%)", command: cpu_command
    timeseries title: "CPU (%)", command: cpu_command
    statistics title: "CPU (%)", command: cpu_command
  end
end
```

**Rows and columns nesting, each cell a chart with its own command and interval.** That is
`b.group("row", …)` with a live part per child, and **it is the layout a monitor wants** —
which is a second independent vote for the container after granite's and plotille's config
records.

**Three things worth taking:**

**`--line-style: line · heavy-line · dot · star · x · bar`** — a per-series marker, and **the
third independent vote** after plotille's `marker:` and ratatui's symbol sets. **That is the
threshold**: three libraries offering it means it is how multi-series works without colour,
and C12 §5's stacked-strip ruling should be re-tested against it.

**A `statistics` panel as a type** — mean, median, stddev, min, max beside the chart. **In
Calcium that is a `keyValue` block and it is free**, but naming it as a companion to every plot
is the idea: *a chart shows shape and the numbers show value*, which is the same rule as
printing a bar's value at its end.

**And a documented limitation worth inheriting deliberately**: *samples are plotted in sequence
order, and there is no notion of temporal spacing.* **A time axis and a sequence axis are
different things**, and a monitor sampling at an uneven interval draws a lie unless it says
which it is using. Nothing in Calcium's plot distinguishes them today.

---

## Where it sits

**After the ML package and after C26**, because it is blocked on both. **And before or
alongside `prism-tui`**, because it exercises the same machinery with a consumer anyone can
run.

**Its real argument is that it is the example people would install.** docker-tui demonstrates;
agent-tui impresses; **a monitor gets used**, and an example that gets used is the one that
finds the bugs a demo never reaches.
