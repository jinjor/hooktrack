import * as express from "express";
import serverless from "serverless-http";
import { DecodeError } from "./common/decoder";
import { getData, endpointDecoder } from "./common/data";
import PromiseRouter from "express-promise-router";

const data = getData();

type Req = express.Request;
type Res = express.Response;

const router = PromiseRouter();

router.use(express.json());
router.post("/endpoints", async (req: Req, res: Res) => {
  let endpoint;
  try {
    endpoint = endpointDecoder.run(req.body);
  } catch (e) {
    const status = e instanceof DecodeError ? 400 : 500;
    return res.status(status).send({
      message: e.message
    });
  }
  const key = await data.addEndPoint(endpoint);
  res.send({
    key
  });
});
router.get("/endpoints/:key/results", async (req: Req, res: Res) => {
  const key = req.params.key;
  const from = +req.query.from;
  const results = await data.getResults(key, from);
  if (!results) {
    return res.status(404).send({
      message: "endpoint not found"
    });
  }
  res.send({
    items: results
  });
});
router.all("/:key", async (req: Req, res: Res) => {
  const key = req.params.key;
  const endpoint = await data.getEndpoint(key);
  if (endpoint && endpoint.method === req.method) {
    const request = {
      method: req.method as any,
      headers: req.headers as any,
      body: req.body
    };
    await data.addRequest(key, request);
    for (const key in endpoint.response.headers) {
      res.setHeader(key, endpoint.response.headers[key]);
    }
    return res.status(endpoint.response.status).send(endpoint.response.body);
  }
  res.status(404).send({
    message: "endpoint not found"
  });
});

const app = express();
app.use(express.json());
app.use("/.netlify/functions/index", router);

const handler = serverless(app);

export { handler };
