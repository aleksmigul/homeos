import crypto from "node:crypto"; import { Router } from "express"; import { z } from "zod"; import { isDeveloper } from "../auth.js"; import { config } from "../config.js"; import { claimCodexRequest,createCodexRequest,createDeployRequest,finishCodexRequest,listCodexRequests,retryCodexRequest } from "../codexRepository.js";
export const codexRouter=Router(),codexWorkerRouter=Router();
codexRouter.use((req,res,next)=>isDeveloper(req)?next():res.status(404).json({error:"Not found"}));
codexRouter.get("/dev/codex-requests",(_req,res)=>res.json({requests:listCodexRequests()}));
codexRouter.post("/dev/codex-requests",(req,res,next)=>{try{res.status(201).json({request:createCodexRequest(z.object({prompt:z.string().trim().min(1).max(20000)}).parse(req.body).prompt)});}catch(e){next(e);}});
codexRouter.post("/dev/deploy",(_req,res)=>res.status(201).json({request:createDeployRequest()}));
function worker(req:any,res:any,next:any){const supplied=String(req.headers.authorization??"").replace(/^Bearer /,"");const expected=config.codexWorkerToken;if(expected&&supplied.length===expected.length&&crypto.timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return next();res.status(404).end();}
codexWorkerRouter.post("/internal/codex/claim",worker,(_req,res)=>res.json({request:claimCodexRequest()}));
codexWorkerRouter.post("/internal/codex/:id/finish",worker,(req,res,next)=>{try{const body=z.object({response:z.string().max(200000).default(""),error:z.string().max(20000).default("")}).parse(req.body);finishCodexRequest(req.params.id,body.response,body.error);res.status(204).end();}catch(e){next(e);}});
codexWorkerRouter.post("/internal/codex/:id/retry",worker,(req,res)=>{retryCodexRequest(req.params.id);res.status(204).end();});
