import * as express from "express";
import serverless from "serverless-http";
import { DecodeError } from "./common/decoder";
import { getData, endpointDecoder, fromDecoder } from "./common/data";
import PromiseRouter from "express-promise-router";

const data = getData();

type Req = express.Request;
type Res = express.Response;

const router = PromiseRouter();

// For some reasons, `router.use(express.json())` does not work
// when request body is gzipped...
router.use((req: Req, res: Res, next: Function) => {
  const data: Buffer[] = [];
  req.on("data", (chunk) => {
    data.push(chunk);
  });
  req.on("end", () => {
    const buffer = Buffer.concat(data);
    if (buffer.length) {
      const text = buffer.toString();
      if (req.headers["content-type"] === "application/json") {
        try {
          req.body = JSON.parse(text);
          next();
        } catch (e) {
          res
            .status(400)
            .send({ message: "Only JSON body is supported for now" });
        }
      } else {
        req.body = text;
        next();
      }
    } else {
      next();
    }
  });
});
router.post("/endpoints", async (req: Req, res: Res) => {
  const endpoint = endpointDecoder.run(req.body);
  const key = await data.addEndPoint(endpoint);
  res.send({
    key,
  });
});
router.get("/endpoints/:key/results", async (req: Req, res: Res) => {
  const key = req.params.key;
  const from = fromDecoder.run(req.query.from);
  const results = await data.getResults(key, from);
  if (!results) {
    return res.status(404).send({
      message: "endpoint not found",
    });
  }
  res.send({
    items: results,
  });
});
router.all("/:key", async (req: Req, res: Res) => {
  const key = req.params.key;
  const endpoint = await data.getEndpoint(key);
  if (endpoint && endpoint.method === req.method) {
    const request = {
      method: req.method as any,
      headers: req.headers as any,
      body: req.body,
    };
    await data.addRequest(key, request);
    for (const key in endpoint.response.headers) {
      res.setHeader(key, endpoint.response.headers[key]);
    }
    return res.status(endpoint.response.status).send(endpoint.response.body);
  }
  res.status(404).send({
    message: "endpoint not found",
  });
});

const app = express();
app.use("/.netlify/functions/index", router);
app.use("/api", router);
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof DecodeError) {
    return res.status(400).send({
      message: err.message,
    });
  }
  console.log("unhandled", err);
  res.status(500).send({
    message: "unexpected error",
  });
});
const handler = serverless(app);

exports.handler = handler;
