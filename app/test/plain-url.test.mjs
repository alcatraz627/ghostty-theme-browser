// Opening the window from Switchboard, bfb or a bookmark uses the plain
// address with no token. It must land on a working page, while a request
// addressed to some other host still gets nothing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { startServer } from "./helpers/start-server.mjs";

function get(port, path, host) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path, headers: { host } }, (res) => {
      res.resume();
      res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("the plain address sends you on to the tokened page", async () => {
  const s = await startServer();
  try {
    const r = await get(s.port, "/", `127.0.0.1:${s.port}`);
    assert.equal(r.status, 302);
    assert.equal(r.location, `/?token=${s.token}`);
    const page = await get(s.port, `/?token=${s.token}`, `127.0.0.1:${s.port}`);
    assert.equal(page.status, 200);
  } finally {
    s.child.kill();
  }
});

test("a wrong token is also sent on to the right one", async () => {
  const s = await startServer();
  try {
    const r = await get(s.port, "/?token=stale", `localhost:${s.port}`);
    assert.equal(r.status, 302);
    assert.equal(r.location, `/?token=${s.token}`);
  } finally {
    s.child.kill();
  }
});

test("a request for another host never learns the token", async () => {
  const s = await startServer();
  try {
    const r = await get(s.port, "/", "evil.example:80");
    assert.equal(r.status, 403);
    assert.equal(r.location, undefined);
  } finally {
    s.child.kill();
  }
});
