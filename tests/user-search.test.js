import test from "node:test";
import assert from "node:assert/strict";
import { createUserSearchHandler } from "../api/_handlers/user-search.js";
function response(){return {statusCode:200,headers:{},body:null,setHeader(k,v){this.headers[k]=v;},status(c){this.statusCode=c;return this;},json(b){this.body=b;return this;}};}
const staff="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
test("member search rejects non-staff",async()=>{const h=createUserSearchHandler({getDatabase:()=>({async query(){throw Error("must not query");}})});const r=response();await h({method:"GET",query:{q:"ab"},auth:{user:{id:staff,role:"buyer"}}},r);assert.equal(r.statusCode,403);});
test("member search requires at least two characters",async()=>{const h=createUserSearchHandler({getDatabase:()=>({async query(){throw Error("must not query");}})});const r=response();await h({method:"GET",query:{q:"a"},auth:{user:{id:staff,role:"moderator"}}},r);assert.equal(r.statusCode,400);});
test("member search returns limited non-staff profile fields",async()=>{let args;const h=createUserSearchHandler({getDatabase:()=>({async query(sql,values){args={sql,values};return {rows:[{id:"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",display_name:"Member",account_type:"buyer",is_suspended:false}]};}})});const r=response();await h({method:"GET",query:{q:"Member"},auth:{user:{id:staff,role:"moderator"}}},r);assert.equal(r.statusCode,200);assert.equal(r.body.count,1);assert.match(args.sql,/NOT EXISTS/);assert.match(args.sql,/LIMIT 25/);assert.equal(args.values[0],"%Member%");});
test("member search rejects unsupported methods",async()=>{const h=createUserSearchHandler({getDatabase:()=>null});const r=response();await h({method:"POST",auth:{user:{id:staff,role:"moderator"}}},r);assert.equal(r.statusCode,405);});
