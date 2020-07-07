import * as zlib from "zlib";
import fetch from "node-fetch";
import * as assert from "assert";
import { spawn, ChildProcess } from "child_process";
import * as waitOn from "wait-on";
import * as dotenv from "dotenv";

dotenv.config();

const port = 9000;
const origin =
  process.env.ORIGIN || `http://localhost:${port}/.netlify/functions/index`;
const isE2E = origin.includes("netlify.app");

async function send(
  method: string,
  path: string,
  data: any,
  gzip?: true
): Promise<any> {
  console.log(method, path);
  const url = origin + path;
  const options: any = {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
  };
  if (data) {
    if (gzip) {
      const buffer: Buffer = zlib.gzipSync(JSON.stringify(data));
      options.headers["content-encoding"] = "gzip";
      // options.headers["content-length"] = buffer.byteLength;
      options.body = buffer;
      // options.body = JSON.stringify(data);
    } else {
      options.body = JSON.stringify(data);
    }
  }
  return fetch(url, options);
}
async function get(path: string): Promise<any> {
  return send("GET", path, null);
}
async function post(path: string, data: any, gzip?: true): Promise<any> {
  return send("POST", path, data, gzip);
}

describe("Hooktrack", function () {
  this.timeout(30 * 1000);
  let netlifyLambda: ChildProcess;
  before(async () => {
    netlifyLambda = spawn("npm", ["run", "dev"], {
      stdio: "inherit",
    });
    await waitOn(
      {
        resources: [`tcp:localhost:${port}`],
      },
      undefined
    );
  });
  it("run", async () => {
    let res;
    res = await post(`/endpoints`, {
      method: "POST",
      response: {
        status: 200,
        headers: {
          foo: "bar",
        },
        body: JSON.stringify({
          greeting: "Hello!",
        }),
      },
    });
    const json = await res.json();
    console.log(json);
    assert.equal(res.status, 200);
    // const { key } = await res.json();
    const { key } = json;
    res = await post(`/${key}`, { num: 1 });
    res = await post(`/${key}`, { num: 2 });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(res.headers.get("foo"), "bar");
    assert.equal(data.greeting, "Hello!");
    res = await get(`/endpoints/${key}/results`);
    let results = await res.json();
    assert.equal(results.items.length, 2);
    assert.deepEqual(results.items[0].request.body, { num: 2 });
    assert.deepEqual(results.items[1].request.body, { num: 1 });
    res = await get(`/endpoints/${key}/results?from=${Date.now()}`);
    results = await res.json();
    assert.equal(results.items.length, 0);
    res = await get(`/endpoints/${key}/results?from=${Date.now() - 10 * 1000}`);
    results = await res.json();
    assert.equal(results.items.length, 2);
  });
  it("gzip", async function () {
    if (!isE2E) {
      this.skip();
    }
    let res;
    res = await post(`/endpoints`, {
      method: "POST",
      response: {
        status: 200,
        headers: {
          foo: "bar",
        },
        body: JSON.stringify({
          greeting: "Hello!",
        }),
      },
    });
    assert.equal(res.status, 200);
    const { key } = await res.json();
    res = await post(`/${key}`, { num: 0 }, true);
    const data = await res.json();
    console.log(data);

    assert.equal(res.status, 200);
    assert.equal(res.headers.get("foo"), "bar");
    assert.equal(data.greeting, "Hello!");
    res = await get(`/endpoints/${key}/results`);
    let results = await res.json();
    assert.equal(results.items.length, 1);
    assert.deepEqual(results.items[0].request.body, { num: 0 });
  });
  it("errors", async () => {
    let res;
    res = await get(`/foo`);
    assert.equal(res.status, 404);
    res = await post(`/foo`, {});
    assert.equal(res.status, 404);
    res = await get(`/endpoints/foo`);
    assert.equal(res.status, 404);
    res = await get(`/endpoints/foo/results`);
    assert.equal(res.status, 404);
    res = await get(`/endpoints/xxx/results?from=xxx`);
    assert.equal(res.status, 400);
    res = await post(`/endpoints`, null);
    assert.equal(res.status, 400);
    res = await post(`/endpoints`, {});
    assert.equal(res.status, 400);
    for (const method of [
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTION",
    ]) {
      res = await post(`/endpoints`, {
        method,
      });
      assert.equal(res.status, 200);
    }
    res = await post(`/endpoints`, {
      method: "",
    });
    assert.equal(res.status, 400);
    res = await post(`/endpoints`, {
      method: "GET",
      response: {
        status: 200,
        body: "",
      },
    });
    assert.equal(res.status, 200);
    res = await post(`/endpoints`, {
      method: "GET",
      response: {
        body: "{}",
      },
    });
    assert.equal(res.status, 200);
    res = await post(`/endpoints`, {
      method: "GET",
      response: {
        status: 200,
      },
    });
    assert.equal(res.status, 200);
    res = await post(`/endpoints`, {
      method: "GET",
      response: {
        body: {},
      },
    });
    assert.equal(res.status, 400);
    res = await post(`/endpoints`, {
      method: "GET",
      response: {
        status: "",
      },
    });
    assert.equal(res.status, 400);
    res = await post(`/endpoints`, {
      method: "GET",
      response: {
        headers: [],
      },
    });
    assert.equal(res.status, 400);
  });

  after(() => {
    if (netlifyLambda) {
      netlifyLambda.kill();
    }
  });
});
