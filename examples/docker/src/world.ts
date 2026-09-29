/**
 * The demo world — an invented docker host, for recordings and nothing else.
 *
 * **Why it exists** (the person's ruling, 2026-09-29): *demo and screenshots do
 * not record against my real Docker.* The app draws the whole daemon, so a
 * recording made against a working machine publishes that machine — its other
 * projects' containers, its devcontainer images, its paths. The one re-record
 * that tried it showed exactly that and was deleted. So every picture of this
 * app is made against this file instead, and this file names nothing that
 * exists anywhere: the containers are a small shop (`web`, `api`, `worker`,
 * `postgres`, `cache`, `proxy`, and a finished `migrate`), the private images
 * come from `registry.example.test` (RFC 2606 reserves `.test`), and every
 * path is under `/srv/shop`.
 *
 * **Deterministic by construction.** Every answer is a pure function of the
 * argv and of `clock()` — milliseconds since the world was made, injected, never
 * read from the host. No randomness, no host reads: ids are hashes of names, and
 * the one thing that moves (the CPU figures) is a fixed curve sampled at the
 * clock. Under `tools/record.ts`'s virtual time the clock is exact, so two
 * recordings are the same bytes; under `DOCKER_TUI_WORLD=demo` it is the wall
 * clock and the world simply moves.
 *
 * **Two doors, one world** — because the app reaches docker two ways:
 *
 * | door | who uses it | what stands in |
 * |---|---|---|
 * | C06's transport | the adapted verbs: `/ps`, `/images`, `/container stats`, `/inspect`, `/logs`, `/port`, `/top`, `/diff` | `createFixtureTransport` over `corpus()` — C08's fixtures, `provenance: "authored"` |
 * | a `Runner` | every local handler and part: the dashboard, the stats parts, `/drift`, `/compare`, `/filediff`, `/events`, completion, the mutation families | `docker(argv)` below |
 *
 * The corpus is **generated from the same function** the runner answers with,
 * so the two doors cannot disagree about a container.
 *
 * **What each shot needs from it** (the survey, 2026-09-29):
 *
 * | shot | calls |
 * |---|---|
 * | greeting, `/dashboard` | `ps -a`, `stats --no-stream` every 2 s — so CPU must move |
 * | `/ps` (`ps-120`, `ps-80`, demo) | `ps` — running only, with ports |
 * | completion (`/images ngi⇥`, `/container stats ⇥`) | `images`, `ps -a` |
 * | `/images nginx`, `scroll` | `images [repo]` |
 * | `s3-live`, `depth-*`, demo dive | `container stats <c>` then per tick `container stats --no-stream <id>` and once `ps -a --no-trunc --filter id=` |
 * | `drift` | `inspect <c>`, `image inspect <image>` |
 * | `config-diff`, demo | `inspect`, `exec <c> cat <path>`, `run --rm <image> cat <path>`, and `exec <c> ls -1pL <dir>` for path completion |
 * | `logs` | `logs <c>` as a stream that keeps arriving — `paced()` below |
 * | demo | `port <c>`, `top <c>` |
 *
 * Anything else is refused the way docker refuses — a non-zero exit and a
 * sentence — so a verb the world does not model shows as an error in the frame
 * rather than as an empty table that looks like a real answer.
 */

import { createHash } from "node:crypto";
import { createFixtureTransport, createRouter } from "calcium-tui";
import type { Fixture, RawPatch, RawResult, TransportRouter, VerbTransport } from "calcium-tui";
import type { Runner } from "./mutation.ts";
import type { Spawner } from "./progress.ts";

/** What `docker version` says. Invented; any plausible release would do. */
export const ENGINE = "27.3.1";

/** The host's memory, as `stats` reports it. Not this machine's. */
const HOST_MEM_MIB = 16_000;

const REGISTRY = "registry.example.test/shop";

// ── The roster ──────────────────────────────────────────────────────────────

type Image = Readonly<{
  repository: string;
  tag: string;
  size: string;
  age: string;
  created: string;
  entrypoint: readonly string[];
  cmd: readonly string[];
  user: string;
  workdir: string;
  stopSignal: string;
  exposed: readonly string[];
  env: readonly string[];
  labels: Readonly<Record<string, string>>;
  /** Files `run --rm <image> cat <path>` can read. */
  files: Readonly<Record<string, string>>;
}>;

type Container = Readonly<{
  name: string;
  image: string;
  state: "running" | "exited";
  status: string;
  runningFor: string;
  created: string;
  command: string;
  ports: string;
  /** `HostConfig.PortBindings`: container port → host port. */
  published: Readonly<Record<string, string>>;
  binds: readonly Readonly<{ source: string; destination: string }>[];
  /** Environment the container adds over its image. */
  env: readonly string[];
  labels: Readonly<Record<string, string>>;
  /** CPU % at `t` ms. */
  cpu: (t: number) => number;
  memMiB: number;
  pids: number;
  /** Files `exec <c> cat` reads, over the image's. */
  files: Readonly<Record<string, string>>;
  processes: readonly string[];
  changes: readonly string[];
}>;

const NGINX_STOCK_CONF = `server {
    listen       80;
    listen  [::]:80;
    server_name  localhost;

    #access_log  /var/log/nginx/host.access.log  main;

    location / {
        root   /usr/share/nginx/html;
        index  index.html index.htm;
    }

    #error_page  404              /404.html;

    # redirect server error pages to the static page /50x.html
    #
    error_page   500 502 503 504  /50x.html;
    location = /50x.html {
        root   /usr/share/nginx/html;
    }

    # proxy the PHP scripts to Apache listening on 127.0.0.1:80
    #
    #location ~ \\.php$ {
    #    proxy_pass   http://127.0.0.1;
    #}

    # pass the PHP scripts to FastCGI server listening on 127.0.0.1:9000
    #
    #location ~ \\.php$ {
    #    root           html;
    #    fastcgi_pass   127.0.0.1:9000;
    #    fastcgi_index  index.php;
    #    fastcgi_param  SCRIPT_FILENAME  /scripts$fastcgi_script_name;
    #    include        fastcgi_params;
    #}

    # deny access to .htaccess files, if Apache's document root
    # concurs with nginx's one
    #
    #location ~ /\\.ht {
    #    deny  all;
    #}
}
`;

/** `proxy`'s bind-mounted config: the stock file, edited into a reverse proxy. */
const PROXY_CONF = `server {
    listen       443 ssl;
    listen  [::]:443 ssl;
    server_name  shop.example.test;

    ssl_certificate      /etc/nginx/certs/shop.crt;
    ssl_certificate_key  /etc/nginx/certs/shop.key;

    access_log  /var/log/nginx/host.access.log  main;
    client_max_body_size 20M;

    location / {
        proxy_pass   http://web:80;
        proxy_set_header Host $host;
    }

    location /api/ {
        proxy_pass   http://api:3000/;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    #error_page  404              /404.html;

    # redirect server error pages to the static page /50x.html
    #
    error_page   500 502 503 504  /50x.html;
    location = /50x.html {
        root   /usr/share/nginx/html;
    }

    # deny access to .htaccess files, if Apache's document root
    # concurs with nginx's one
    #
    #location ~ /\\.ht {
    #    deny  all;
    #}
}
`;

const NGINX: Image = {
  repository: "nginx",
  tag: "1.27",
  size: "192MB",
  age: "3 weeks ago",
  created: "2026-09-08 11:02:31 +0000 UTC",
  entrypoint: ["/docker-entrypoint.sh"],
  cmd: ["nginx", "-g", "daemon off;"],
  user: "",
  workdir: "",
  stopSignal: "SIGQUIT",
  exposed: ["80/tcp"],
  env: [
    "PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    "NGINX_VERSION=1.27.2",
    "PKG_RELEASE=1~bookworm",
  ],
  labels: { maintainer: "NGINX Docker Maintainers <docker-maint@nginx.com>" },
  files: { "/etc/nginx/conf.d/default.conf": NGINX_STOCK_CONF },
};

const shopImage = (name: string, size: string, cmd: readonly string[], exposed: readonly string[]): Image => ({
  repository: `${REGISTRY}/${name}`,
  tag: "2.4.1",
  size,
  age: "2 days ago",
  created: "2026-09-27 16:40:05 +0000 UTC",
  entrypoint: [],
  cmd,
  user: "app",
  workdir: "/srv/app",
  stopSignal: "",
  exposed,
  env: ["PATH=/usr/local/bin:/usr/bin:/bin", "NODE_ENV=production"],
  labels: { "org.opencontainers.image.source": "https://git.example.test/shop" },
  files: {},
});

const IMAGES: readonly Image[] = [
  NGINX,
  shopImage("api", "164MB", ["node", "server.js"], ["3000/tcp"]),
  shopImage("worker", "158MB", ["node", "worker.js"], []),
  {
    ...shopImage("migrate", "141MB", ["node", "migrate.js"], []),
  },
  {
    repository: "postgres",
    tag: "16",
    size: "432MB",
    age: "4 weeks ago",
    created: "2026-09-01 09:15:44 +0000 UTC",
    entrypoint: ["docker-entrypoint.sh"],
    cmd: ["postgres"],
    user: "",
    workdir: "",
    stopSignal: "SIGINT",
    exposed: ["5432/tcp"],
    env: ["PATH=/usr/lib/postgresql/16/bin:/usr/bin:/bin", "PG_MAJOR=16", "PGDATA=/var/lib/postgresql/data"],
    labels: {},
    files: {},
  },
  {
    repository: "redis",
    tag: "7.4",
    size: "117MB",
    age: "4 weeks ago",
    created: "2026-09-01 09:20:12 +0000 UTC",
    entrypoint: ["docker-entrypoint.sh"],
    cmd: ["redis-server"],
    user: "",
    workdir: "/data",
    stopSignal: "",
    exposed: ["6379/tcp"],
    env: ["PATH=/usr/local/bin:/usr/bin:/bin", "REDIS_VERSION=7.4.1"],
    labels: {},
    files: {},
  },
  {
    repository: "alpine",
    tag: "3.20",
    size: "7.8MB",
    age: "2 months ago",
    created: "2026-07-22 18:03:57 +0000 UTC",
    entrypoint: [],
    cmd: ["/bin/sh"],
    user: "",
    workdir: "",
    stopSignal: "",
    exposed: [],
    env: ["PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"],
    labels: {},
    files: {},
  },
];

const refOf = (i: Image): string => `${i.repository}:${i.tag}`;

/**
 * `worker`'s CPU — a job queue draining in bursts, so the plot has a shape.
 *
 * The lab fixture this replaces learned the hard way that a busy loop draws a
 * flat line at 100%, the least interesting figure C12 can draw (Makefile,
 * `dtui-load`). Keyframes every four seconds over a forty-second cycle,
 * interpolated, with a small fixed ripple so neighbouring samples differ.
 */
const WORKER_KEYS = [6, 64, 92, 87, 41, 14, 73, 97, 58, 9] as const;
const workerCpu = (t: number): number => {
  const span = 4000;
  const cycle = WORKER_KEYS.length * span;
  const at = ((t % cycle) + cycle) % cycle;
  const i = Math.floor(at / span);
  const f = (at - i * span) / span;
  const a = WORKER_KEYS[i] ?? 0;
  const b = WORKER_KEYS[(i + 1) % WORKER_KEYS.length] ?? 0;
  return a + (b - a) * f + 1.7 * Math.sin(t / 1300);
};

/** A quiet service: a base and a slow wobble. */
const idle = (base: number, swing: number, period: number) => (t: number): number =>
  base + swing * (0.5 + 0.5 * Math.sin(t / period));

const CONTAINERS: readonly Container[] = [
  {
    name: "web",
    image: refOf(NGINX),
    state: "running",
    status: "Up 3 hours",
    runningFor: "3 hours ago",
    created: "2026-09-29 06:12:40 +0000 UTC",
    command: '"/docker-entrypoint.…"',
    ports: "0.0.0.0:8080->80/tcp",
    published: { "80/tcp": "8080" },
    binds: [{ source: "/srv/shop/web/index.html", destination: "/usr/share/nginx/html/index.html" }],
    env: ["LOG_LEVEL=debug"],
    labels: { "com.example.stack": "shop" },
    cpu: idle(0.4, 1.1, 2100),
    memMiB: 11.6,
    pids: 9,
    files: { "/usr/share/nginx/html/index.html": "<!doctype html>\n<title>shop</title>\n<h1>The shop is open.</h1>\n" },
    processes: ["nginx: master process nginx -g daemon off;", "nginx: worker process", "nginx: worker process"],
    changes: ["C /var", "C /var/cache", "C /var/cache/nginx", "A /var/cache/nginx/client_temp", "A /var/cache/nginx/proxy_temp", "C /run", "A /run/nginx.pid"],
  },
  {
    name: "api",
    image: `${REGISTRY}/api:2.4.1`,
    state: "running",
    status: "Up 3 hours",
    runningFor: "3 hours ago",
    created: "2026-09-29 06:12:41 +0000 UTC",
    command: '"node server.js"',
    ports: "0.0.0.0:3000->3000/tcp",
    published: { "3000/tcp": "3000" },
    binds: [],
    env: ["DATABASE_URL=postgres://shop@postgres:5432/shop"],
    labels: { "com.example.stack": "shop" },
    cpu: idle(3.2, 6.5, 1700),
    memMiB: 96.4,
    pids: 11,
    files: {},
    processes: ["node server.js"],
    changes: ["C /srv/app", "A /srv/app/.cache"],
  },
  {
    name: "worker",
    image: `${REGISTRY}/worker:2.4.1`,
    state: "running",
    status: "Up 3 hours",
    runningFor: "3 hours ago",
    created: "2026-09-29 06:12:41 +0000 UTC",
    command: '"node worker.js"',
    ports: "",
    published: {},
    binds: [],
    env: ["QUEUE=orders"],
    labels: { "com.example.stack": "shop" },
    cpu: workerCpu,
    memMiB: 212.8,
    pids: 7,
    files: {},
    processes: ["node worker.js"],
    changes: ["C /tmp", "A /tmp/orders.lock"],
  },
  {
    name: "postgres",
    image: "postgres:16",
    state: "running",
    status: "Up 3 hours (healthy)",
    runningFor: "3 hours ago",
    created: "2026-09-29 06:12:38 +0000 UTC",
    command: '"docker-entrypoint.s…"',
    ports: "5432/tcp",
    published: {},
    binds: [],
    env: ["POSTGRES_DB=shop"],
    labels: { "com.example.stack": "shop" },
    cpu: idle(1.1, 2.4, 2600),
    memMiB: 148.2,
    pids: 14,
    files: {},
    processes: ["postgres", "postgres: checkpointer", "postgres: background writer", "postgres: walwriter"],
    changes: ["C /var/run/postgresql", "A /var/run/postgresql/.s.PGSQL.5432"],
  },
  {
    name: "cache",
    image: "redis:7.4",
    state: "running",
    status: "Up 3 hours",
    runningFor: "3 hours ago",
    created: "2026-09-29 06:12:38 +0000 UTC",
    command: '"docker-entrypoint.s…"',
    ports: "6379/tcp",
    published: {},
    binds: [],
    env: [],
    labels: { "com.example.stack": "shop" },
    cpu: idle(0.3, 0.5, 1900),
    memMiB: 8.9,
    pids: 6,
    files: {},
    processes: ["redis-server *:6379"],
    changes: [],
  },
  {
    name: "proxy",
    image: refOf(NGINX),
    state: "running",
    status: "Up 2 hours",
    runningFor: "2 hours ago",
    created: "2026-09-29 07:30:02 +0000 UTC",
    command: '"/docker-entrypoint.…"',
    ports: "0.0.0.0:443->443/tcp",
    published: { "443/tcp": "443" },
    binds: [{ source: "/srv/shop/proxy/default.conf", destination: "/etc/nginx/conf.d/default.conf" }],
    env: [],
    labels: { "com.example.stack": "shop" },
    cpu: idle(0.2, 0.4, 2300),
    memMiB: 9.7,
    pids: 9,
    files: { "/etc/nginx/conf.d/default.conf": PROXY_CONF },
    processes: ["nginx: master process nginx -g daemon off;", "nginx: worker process"],
    changes: ["C /run", "A /run/nginx.pid"],
  },
  {
    name: "migrate",
    image: `${REGISTRY}/migrate:2.4.1`,
    state: "exited",
    status: "Exited (0) 3 hours ago",
    runningFor: "3 hours ago",
    created: "2026-09-29 06:12:39 +0000 UTC",
    command: '"node migrate.js"',
    ports: "",
    published: {},
    binds: [],
    env: [],
    labels: { "com.example.stack": "shop" },
    cpu: () => 0,
    memMiB: 0,
    pids: 0,
    files: {},
    processes: [],
    changes: [],
  },
];

/** A container's filesystem as far as path completion walks it. */
const NGINX_TREE: Readonly<Record<string, readonly string[]>> = {
  "/": ["bin/", "dev/", "docker-entrypoint.d/", "docker-entrypoint.sh", "etc/", "home/", "lib/", "proc/", "root/", "run/", "srv/", "sys/", "tmp/", "usr/", "var/"],
  "/etc/": ["adduser.conf", "hostname", "hosts", "nginx/", "os-release", "passwd", "resolv.conf", "ssl/"],
  "/etc/nginx/": ["conf.d/", "fastcgi_params", "mime.types", "modules/", "nginx.conf", "scgi_params", "uwsgi_params"],
  "/etc/nginx/conf.d/": ["default.conf"],
};

// ── Derived facts ───────────────────────────────────────────────────────────

const hex = (seed: string): string => createHash("sha256").update(`demo-world/${seed}`).digest("hex");
const idOf = (c: Container): string => hex(`container/${c.name}`);
const imageIdOf = (i: Image): string => hex(`image/${refOf(i)}`);

const imageFor = (c: Container): Image | undefined => IMAGES.find((i) => refOf(i) === c.image);

const byRef = (ref: string): Container | undefined =>
  CONTAINERS.find((c) => c.name === ref || c.name === ref.replace(/^\//u, "") || (ref.length >= 4 && idOf(c).startsWith(ref)));

const imageByRef = (ref: string): Image | undefined =>
  IMAGES.find((i) => refOf(i) === ref || i.repository === ref || (ref.length >= 4 && imageIdOf(i).startsWith(ref.replace(/^sha256:/u, ""))));

const fixed = (n: number, places = 2): string => n.toFixed(places);

const psRow = (c: Container, full = false): Record<string, unknown> => ({
  Command: full ? `"${[...(imageFor(c)?.entrypoint ?? []), ...(imageFor(c)?.cmd ?? [])].join(" ")}"` : c.command,
  CreatedAt: c.created,
  ID: full ? idOf(c) : idOf(c).slice(0, 12),
  Image: c.image,
  Labels: Object.entries(c.labels).map(([k, v]) => `${k}=${v}`).join(","),
  LocalVolumes: "0",
  Mounts: c.binds.map((m) => m.source).join(","),
  Names: c.name,
  Networks: "shop_default",
  Ports: c.ports,
  RunningFor: c.runningFor,
  Size: "0B",
  State: c.state,
  Status: c.status,
});

const statsRow = (c: Container, t: number, asked: string | null): Record<string, unknown> => {
  const cpu = Math.max(0, c.cpu(t));
  // Memory breathes a little with the work, so the bar is not a constant.
  const mem = c.memMiB * (1 + cpu / 900);
  const seconds = t / 1000;
  const rx = 48.2 + seconds * 0.9 * (1 + c.pids / 10);
  const tx = 21.7 + seconds * 0.4 * (1 + c.pids / 10);
  return {
    BlockIO: `${fixed(c.memMiB / 7, 1)}MB / ${fixed(c.memMiB / 31, 1)}MB`,
    CPUPerc: `${fixed(cpu)}%`,
    // `Container` is whatever was asked for — a name when a name was given,
    // the full id when nothing was (the corpus's `stats-real.ndjson` shape).
    Container: asked ?? idOf(c),
    ID: idOf(c).slice(0, 12),
    MemPerc: `${fixed((mem / HOST_MEM_MIB) * 100)}%`,
    MemUsage: `${fixed(mem)}MiB / 15.63GiB`,
    Name: c.name,
    NetIO: `${fixed(rx, 1)}kB / ${fixed(tx, 1)}kB`,
    PIDs: String(c.pids),
  };
};

const imageRow = (i: Image): Record<string, unknown> => ({
  Containers: String(CONTAINERS.filter((c) => c.image === refOf(i)).length),
  CreatedAt: i.created,
  CreatedSince: i.age,
  Digest: "<none>",
  ID: imageIdOf(i).slice(0, 12),
  Repository: i.repository,
  SharedSize: "N/A",
  Size: i.size,
  Tag: i.tag,
  UniqueSize: "N/A",
});

const imageInspect = (i: Image): Record<string, unknown> => ({
  Id: `sha256:${imageIdOf(i)}`,
  RepoTags: [refOf(i)],
  Created: i.created,
  Config: {
    User: i.user,
    ExposedPorts: Object.fromEntries(i.exposed.map((p) => [p, {}])),
    Env: i.env,
    Cmd: i.cmd,
    Entrypoint: i.entrypoint.length === 0 ? null : i.entrypoint,
    WorkingDir: i.workdir,
    Labels: i.labels,
    StopSignal: i.stopSignal,
  },
});

const containerInspect = (c: Container): Record<string, unknown> => {
  const img = imageFor(c);
  const exposed = [...(img?.exposed ?? []), ...Object.keys(c.published)];
  return {
    Id: idOf(c),
    Created: c.created,
    Name: `/${c.name}`,
    Image: `sha256:${img === undefined ? hex("missing") : imageIdOf(img)}`,
    State: {
      Status: c.state,
      Running: c.state === "running",
      Paused: false,
      ExitCode: 0,
    },
    HostConfig: {
      PortBindings: Object.fromEntries(
        Object.entries(c.published).map(([port, host]) => [port, [{ HostIp: "0.0.0.0", HostPort: host }]]),
      ),
    },
    Mounts: c.binds.map((m) => ({ Type: "bind", Source: m.source, Destination: m.destination, Mode: "ro", RW: false })),
    Config: {
      Hostname: idOf(c).slice(0, 12),
      User: img?.user ?? "",
      ExposedPorts: Object.fromEntries([...new Set(exposed)].map((p) => [p, {}])),
      Env: [...(img?.env ?? []), ...c.env],
      Cmd: img?.cmd ?? [],
      Entrypoint: img === undefined || img.entrypoint.length === 0 ? null : img.entrypoint,
      Image: c.image,
      WorkingDir: img?.workdir ?? "",
      Labels: { ...(img?.labels ?? {}), ...c.labels },
      StopSignal: img?.stopSignal ?? "",
    },
  };
};

const ndjson = (rows: readonly Record<string, unknown>[]): string =>
  rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length === 0 ? "" : "\n");

/** `docker top` pads to a table; the widths are docker's, the rows invented. */
const topTable = (c: Container): string => {
  const head = ["UID", "PID", "PPID", "C", "STIME", "TTY", "TIME", "CMD"];
  const rows = c.processes.map((cmd, i) => [
    i === 0 ? "root" : "101",
    String(4100 + i * 17),
    i === 0 ? "4088" : "4100",
    "0",
    "06:12",
    "?",
    "00:00:0" + String(i + 1),
    cmd,
  ]);
  return [head, ...rows].map((r) => r.map((cell, i) => (i < r.length - 1 ? cell.padEnd(20) : cell)).join("")).join("\n") + "\n";
};

const portText = (c: Container): string =>
  Object.entries(c.published)
    .map(([port, host]) => `${port} -> 0.0.0.0:${host}`)
    .join("\n") + (Object.keys(c.published).length === 0 ? "" : "\n");

// ── The logs ────────────────────────────────────────────────────────────────

const LOG_PATHS = ["/", "/api/orders", "/static/app.css", "/api/cart", "/healthz", "/static/app.js", "/api/orders/1042", "/favicon.ico"] as const;
const LOG_AGENTS = ["Mozilla/5.0 (X11; Linux x86_64)", "curl/8.9.1", "Mozilla/5.0 (Macintosh)", "shop-healthcheck/1.0"] as const;

/** Access lines at fixed invented times — the recording carries no clock of ours. */
const accessLine = (n: number): string => {
  const path = LOG_PATHS[(n * 5) % LOG_PATHS.length] ?? "/";
  const agent = LOG_AGENTS[(n * 3) % LOG_AGENTS.length] ?? "curl/8.9.1";
  const status = path === "/favicon.ico" ? 404 : 200;
  const bytes = status === 404 ? 153 : 612 + ((n * 97) % 4200);
  const second = 12 + n;
  const clock = `09:${String(38 + Math.floor(second / 60)).padStart(2, "0")}:${String(second % 60).padStart(2, "0")}`;
  return `172.20.0.${String(2 + (n % 5))} - - [29/Sep/2026:${clock} +0000] "GET ${path} HTTP/1.1" ${String(status)} ${String(bytes)} "-" "${agent}" "-"`;
};

const STARTUP = [
  "/docker-entrypoint.sh: /docker-entrypoint.d/ is not empty, will attempt to perform configuration",
  "/docker-entrypoint.sh: Looking for shell scripts in /docker-entrypoint.d/",
  "/docker-entrypoint.sh: Launching /docker-entrypoint.d/10-listen-on-ipv6-by-default.sh",
  "10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf",
  "/docker-entrypoint.sh: Configuration complete; ready for start up",
  "2026/09/29 06:12:41 [notice] 1#1: using the \"epoll\" event method",
  "2026/09/29 06:12:41 [notice] 1#1: nginx/1.27.2",
  "2026/09/29 06:12:41 [notice] 1#1: start worker processes",
];

const logLines = (c: Container): readonly string[] =>
  c.image === refOf(NGINX)
    ? [...STARTUP, ...Array.from({ length: 64 }, (_, n) => accessLine(n))]
    : Array.from({ length: 24 }, (_, n) => `2026-09-29T09:${String(38 + Math.floor(n / 6))}:${String((n * 10) % 60).padStart(2, "0")}Z info ${c.name}: tick ${String(n + 1)}`);

/** How many log lines are already there when the view opens; the rest arrive. */
export const LOG_BACKLOG = 20;
/** One new line this often, once the backlog is drawn. */
export const LOG_EVERY_MS = 450;

// ── The CLI ─────────────────────────────────────────────────────────────────

/** A refusal shaped like `execFile`'s rejection — what every caller already catches. */
class DockerError extends Error {
  readonly stderr: string;
  readonly stdout = "";
  readonly code = 1;
  constructor(stderr: string) {
    super(`Command failed: docker\n${stderr}`);
    this.stderr = stderr;
  }
}

const noSuch = (kind: string, ref: string): never => {
  throw new DockerError(`Error response from daemon: No such ${kind}: ${ref}\n`);
};

/** Flags that change nothing about an answer here. */
const INERT = new Set(["--no-stream", "--no-trunc", "--follow", "-f", "--json"]);
const WITH_VALUE = new Set(["--format", "--tail", "--since", "--until"]);

/** The positionals of an argv, and its filters. */
function parse(args: readonly string[]): { words: string[]; filters: string[]; all: boolean } {
  const words: string[] = [];
  const filters: string[] = [];
  let all = false;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? "";
    if (a === "-a" || a === "--all") all = true;
    else if (a === "--filter") filters.push(args[(i += 1)] ?? "");
    else if (WITH_VALUE.has(a)) i += 1;
    else if (!INERT.has(a)) words.push(a);
  }
  return { words, filters, all };
}

/**
 * `docker <args>`, answered from the roster at world time `t`.
 *
 * Returns stdout. Throws a `DockerError` where docker would exit non-zero.
 */
function answer(args: readonly string[], t: number): string {
  const { words, filters, all } = parse(args);
  const [verb, ...rest] = words;
  const sub = verb === "container" || verb === "image" ? `${verb} ${rest.shift() ?? ""}` : (verb ?? "");

  switch (sub) {
    case "version":
      return `${ENGINE}\n`;

    case "ps":
    case "container ls": {
      const byId = filters.find((f) => f.startsWith("id="))?.slice(3);
      const rows = CONTAINERS.filter((c) => all || c.state === "running")
        .filter((c) => byId === undefined || idOf(c).startsWith(byId))
        .map((c) => psRow(c, args.includes("--no-trunc")));
      return ndjson(rows);
    }

    case "stats":
    case "container stats": {
      if (rest.length === 0) {
        return ndjson(CONTAINERS.filter((c) => c.state === "running").map((c) => statsRow(c, t, null)));
      }
      return ndjson(
        rest.map((ref) => {
          const c = byRef(ref) ?? noSuch("container", ref);
          return statsRow(c, t, ref);
        }),
      );
    }

    case "images":
    case "image ls": {
      const repo = rest[0];
      return ndjson(IMAGES.filter((i) => repo === undefined || i.repository === repo).map(imageRow));
    }

    case "inspect":
    case "container inspect": {
      const ref = rest[0] ?? "";
      const c = byRef(ref);
      if (c !== undefined) return JSON.stringify([containerInspect(c)], null, 4) + "\n";
      const i = imageByRef(ref) ?? noSuch("object", ref);
      return JSON.stringify([imageInspect(i)], null, 4) + "\n";
    }

    case "image inspect": {
      const ref = rest[0] ?? "";
      const i = imageByRef(ref) ?? noSuch("image", ref);
      return JSON.stringify([imageInspect(i)], null, 4) + "\n";
    }

    case "exec": {
      const [ref = "", cmd, ...cmdArgs] = rest;
      const c = byRef(ref) ?? noSuch("container", ref);
      if (c.state !== "running") throw new DockerError(`Error response from daemon: container ${idOf(c)} is not running\n`);
      if (cmd === "cat") {
        const path = cmdArgs[0] ?? "";
        const text = c.files[path] ?? imageFor(c)?.files[path];
        if (text === undefined) throw new DockerError(`cat: can't open '${path}': No such file or directory\n`);
        return text;
      }
      if (cmd === "ls") {
        const dir = cmdArgs.find((a) => !a.startsWith("-")) ?? "/";
        const listing = imageFor(c)?.repository === "nginx" ? NGINX_TREE[dir] : undefined;
        if (listing === undefined) throw new DockerError(`ls: ${dir}: No such file or directory\n`);
        return listing.join("\n") + "\n";
      }
      throw new DockerError(`demo world: \`exec ${cmd ?? ""}\` is not part of the invented host\n`);
    }

    case "run": {
      const [image = "", cmd, path = ""] = rest.filter((w) => w !== "--rm");
      const i = imageByRef(image) ?? noSuch("image", image);
      const text = cmd === "cat" ? i.files[path] : undefined;
      if (text === undefined) throw new DockerError(`cat: can't open '${path}': No such file or directory\n`);
      return text;
    }

    case "port":
    case "container port":
      return portText(byRef(rest[0] ?? "") ?? noSuch("container", rest[0] ?? ""));

    case "top":
    case "container top":
      return topTable(byRef(rest[0] ?? "") ?? noSuch("container", rest[0] ?? ""));

    case "diff":
    case "container diff":
      return (byRef(rest[0] ?? "") ?? noSuch("container", rest[0] ?? "")).changes.join("\n") + "\n";

    case "logs":
    case "container logs":
      return logLines(byRef(rest[0] ?? "") ?? noSuch("container", rest[0] ?? "")).join("\n") + "\n";

    case "events":
      // Nothing started or stopped in the last ten minutes: an honest quiet.
      return "";

    default:
      throw new DockerError(`demo world: \`docker ${args.join(" ")}\` is not part of the invented host\n`);
  }
}

// ── The two doors ───────────────────────────────────────────────────────────

const settled = (argv: readonly string[], stdoutRaw: string, over: Partial<RawResult> = {}): RawResult => {
  // The subprocess transport's own parse: the whole of stdout as one JSON
  // value, and the error kept when it is not one (NDJSON never is).
  let stdout: unknown;
  let parseError: string | null = null;
  try {
    stdout = JSON.parse(stdoutRaw) as unknown;
  } catch (error) {
    parseError = error instanceof Error ? error.message : String(error);
  }
  return {
    argv,
    exitCode: 0,
    signal: null,
    stdout,
    stdoutRaw,
    stderr: "",
    durationMs: 0,
    parseError,
    cancelled: false,
    timedOut: false,
    overflowed: false,
    ...over,
  };
};

const failed = (argv: readonly string[], error: unknown): RawResult =>
  settled(argv, "", {
    exitCode: 1,
    stderr: error instanceof DockerError ? error.stderr : String(error),
    parseError: null,
  });

export type DemoWorld = Readonly<{
  /** Every local handler's far side. */
  docker: Runner;
  /** `pull`, `push`, `build` — refused, since the world has no registry to reach. */
  spawner: Spawner;
  /** The adapted verbs' far side: C08 fixtures, generated from `docker` above. */
  corpus: () => readonly Fixture[];
}>;

/**
 * The world, on a clock. `clock()` is milliseconds since the world began.
 *
 * The corpus is regenerated per call rather than once, so a `/ps` typed at
 * minute two is answered at minute two — replay is exact-match (C06 T3.23),
 * and a fixture's result is whatever the world says when the transport asks.
 */
export function createDemoWorld(clock: () => number): DemoWorld {
  const docker: Runner = async (args) => ({ stdout: answer(args, clock()), stderr: "" });

  const spawner: Spawner = async (argv, onLine) => {
    onLine(`demo world: \`docker ${argv.join(" ")}\` needs a registry, and the invented host has none`);
    return 1;
  };

  const fixture = (verb: string, argv: readonly string[], dockerArgv: readonly string[]): Fixture => {
    let result: RawResult;
    try {
      result = settled([...argv, "--json"], answer(dockerArgv, clock()));
    } catch (error) {
      result = failed([...argv, "--json"], error);
    }
    return {
      id: `demo:${argv.join(" ")}`,
      verb,
      argv,
      provenance: "authored",
      capturedAt: null,
      cliVersion: ENGINE,
      note: "the demo world (examples/docker/src/world.ts) — invented, never recorded",
      result,
    };
  };

  /**
   * `docker logs` as C06's subprocess transport would deliver it: nginx's lines
   * are not JSON, so each is `malformed`, and the NDJSON reader declares the
   * stream `degraded` once ten lines have failed (`DEGRADE_FLOOR`, ratio over
   * 0.1 — `src/data/transport/ndjson.ts`). **The copy is the risk here**: that
   * rule is interior to C06, so it is restated rather than imported, and a
   * change there leaves this answering as the old reader did.
   *
   * It matters to the picture because C07 drops `malformed` lines until
   * `degraded` arrives (`adapters/stream.ts`). The first version of this
   * fixture sent no `degraded`, and `/logs web` drew a card with nothing in it
   * for as long as it ran — every line delivered, every line dropped.
   */
  const logFixture = (c: Container): Fixture => {
    const argv = ["logs", c.name];
    const patches: RawPatch[] = logLines(c).flatMap((line, i): RawPatch[] =>
      i === 9
        ? [{ kind: "malformed", line }, { kind: "degraded", reason: "10 of 10 lines did not parse as JSON" }]
        : [{ kind: "malformed", line }],
    );
    return {
      id: `demo:logs ${c.name}`,
      verb: "logs",
      argv,
      provenance: "authored",
      capturedAt: null,
      cliVersion: ENGINE,
      note: "the demo world — a follow, paced by `paced()`",
      result: [...patches, { kind: "end", result: settled(argv, logLines(c).join("\n")) }],
    };
  };

  const corpus = (): readonly Fixture[] => [
    fixture("ps", ["ps"], ["ps"]),
    fixture("ps", ["ps", "-a"], ["ps", "-a"]),
    fixture("images", ["images"], ["images"]),
    ...IMAGES.map((i) => fixture("images", ["images", i.repository], ["images", i.repository])),
    ...CONTAINERS.flatMap((c) => [
      fixture("container stats", ["container", "stats", c.name], ["container", "stats", c.name]),
      fixture("inspect", ["inspect", c.name], ["inspect", c.name]),
      fixture("port", ["port", c.name], ["port", c.name]),
      fixture("top", ["top", c.name], ["top", c.name]),
      fixture("diff", ["diff", c.name], ["diff", c.name]),
      logFixture(c),
    ]),
  ];

  return { docker, spawner, corpus };
}

/**
 * C06's fixture transport, over a corpus taken fresh per invocation.
 *
 * **And streams paced, which C06 deliberately does not do** — its replay reads
 * no clock (I16), so a recorded follow arrives all at once, and a log tail that
 * is not moving is a table. `LOG_BACKLOG` lines arrive together, as `--tail`
 * would give them; the rest one per `LOG_EVERY_MS`; and the `end` waits for the
 * reader to leave, because a `--follow` does not finish on its own.
 */
export function paced(world: DemoWorld, replay: (corpus: readonly Fixture[]) => VerbTransport): VerbTransport {
  return {
    invoke: (inv) => replay(world.corpus()).invoke(inv),
    stream(inv) {
      const inner = replay(world.corpus()).stream(inv);
      async function* body(): AsyncGenerator<RawPatch> {
        let n = 0;
        for await (const patch of inner) {
          if (patch.kind === "end" && !inv.signal.aborted) {
            await new Promise<void>((resolve) => inv.signal.addEventListener("abort", () => resolve(), { once: true }));
            yield { kind: "end", result: { ...patch.result, cancelled: true } };
            return;
          } else if (n >= LOG_BACKLOG && !inv.signal.aborted) {
            await new Promise<void>((resolve) => setTimeout(resolve, LOG_EVERY_MS));
          }
          n += 1;
          yield patch;
        }
      }
      return { [Symbol.asyncIterator]: (): AsyncGenerator<RawPatch> => body() };
    },
  };
}

/**
 * What `app.ts` takes, for the demo world. `clock` is any millisecond counter;
 * the world counts from the moment this is called.
 *
 * `main.ts` hands it the wall clock under `DOCKER_TUI_WORLD=demo`, and
 * `tools/record.ts` the same call under virtual time — which is what makes two
 * recordings the same bytes.
 */
export function demoDeps(clock: () => number): Readonly<{
  engine: string;
  binary: string;
  docker: Runner;
  spawner: Spawner;
  transport: TransportRouter;
}> {
  const t0 = clock();
  const world = createDemoWorld(() => clock() - t0);
  return {
    engine: ENGINE,
    binary: "docker",
    docker: world.docker,
    spawner: world.spawner,
    transport: createRouter({ default: paced(world, createFixtureTransport) }),
  };
}
