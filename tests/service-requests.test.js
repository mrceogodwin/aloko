import test from "node:test";
import assert from "node:assert/strict";
import { createServiceRequestsHandler } from "../api/_handlers/service-requests.js";
import { clearRateLimitBuckets } from "../api/_lib/rate-limit.js";

function responseRecorder(){return{statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
const userId="11111111-1111-4111-8111-111111111111";
const auth={user:{id:userId,role:"buyer"}};
const valid={service_type:"decluttering",description:"Please help clear a two bedroom apartment before relocation.",city:"Port Harcourt",state:"Rivers",preferred_date:"2026-11-15"};

test("service requests require authentication",async()=>{clearRateLimitBuckets();const h=createServiceRequestsHandler({getDatabase:()=>null});const r=responseRecorder();await h({method:"POST",body:valid},r);assert.equal(r.statusCode,401);});
test("customer can create a service enquiry using their authenticated identity",async()=>{clearRateLimitBuckets();const h=createServiceRequestsHandler({getDatabase:()=>({async query(sql,values){assert.match(sql,/INSERT INTO public\.service_requests/);assert.equal(values[0],userId);assert.equal(values[1],"decluttering");assert.equal(values[3],"Port Harcourt");return{rows:[{id:"request-1",status:"requested"}]};}})});const r=responseRecorder();await h({method:"POST",auth,body:valid},r);assert.equal(r.statusCode,201);assert.equal(r.body.request.id,"request-1");});
test("service enquiry rejects invalid service type, short description and missing location",async()=>{clearRateLimitBuckets();const h=createServiceRequestsHandler({getDatabase:()=>({async query(){throw new Error("invalid input must not reach database");}})});for(const body of [{...valid,service_type:"plumbing"},{...valid,description:"Too short"},{...valid,state:""}]){const r=responseRecorder();await h({method:"POST",auth,body},r);assert.equal(r.statusCode,400);}});
test("customer sees only their own service requests",async()=>{clearRateLimitBuckets();const h=createServiceRequestsHandler({getDatabase:()=>({async query(sql,values){assert.match(sql,/WHERE customer_id = \$1::uuid/);assert.equal(values[0],userId);return{rows:[{id:"mine"}]};}})});const r=responseRecorder();await h({method:"GET",auth},r);assert.equal(r.statusCode,200);assert.equal(r.body.items[0].id,"mine");});
test("unsupported methods are rejected",async()=>{clearRateLimitBuckets();const h=createServiceRequestsHandler({getDatabase:()=>({async query(){return{rows:[]};}})});const r=responseRecorder();await h({method:"DELETE",auth},r);assert.equal(r.statusCode,405);assert.equal(r.headers.Allow,"GET, POST");});
